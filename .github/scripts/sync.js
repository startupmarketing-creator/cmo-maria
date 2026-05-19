const { Client } = require('@notionhq/client');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

// Database IDs (used to discover their data sources)
const SETTINGS_DB = '357ca93d844180c3a965db01e49db981';
const NAV_DB      = '357ca93d84418097a8a5d51b59771f55';
const PAGE_MAIN   = '357ca93d84418080b90ec9d1bb0a596f';
const PAGE_ABOUT  = '357ca93d84418082ae87dc96bb3d7dd5';

// Resolve a database to its first data source ID.
async function getDataSourceId(databaseId) {
    const db = await notion.databases.retrieve({ database_id: databaseId });
    if (!db.data_sources || db.data_sources.length === 0) {
          throw new Error('No data sources found for database ' + databaseId);
    }
    return db.data_sources[0].id;
}

// Extract plain text from a property (title or rich_text)
function getText(prop) {
    if (!prop) return '';
    if (prop.type === 'title')      return prop.title.map(t => t.plain_text).join('');
    if (prop.type === 'rich_text')  return prop.rich_text.map(t => t.plain_text).join('');
    return '';
}

// Convert Notion rich_text array to HTML string with formatting
function richTextToHtml(richText) {
    if (!richText) return '';
    return richText.map(t => {
          let s = t.plain_text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
          const a = t.annotations || {};
          if (a.bold)   s = '<strong>' + s + '</strong>';
          if (a.italic) s = '<em>' + s + '</em>';
          if (a.code)   s = '<code>' + s + '</code>';
          if (a.color && a.color !== 'default') {
                  const color  = a.color.replace('_background', '');
                  const cssColor = color === 'blue' ? 'var(--accent-color)' : color;
                  const isBg   = a.color.endsWith('_background');
                  s = isBg
                    ? '<span style="background:' + cssColor + '">' + s + '</span>'
                            : '<span style="color:' + cssColor + '">' + s + '</span>';
          }
          if (t.href) s = '<a href="' + t.href + '">' + s + '</a>';
          return s;
    }).join('');
}

// Resolve callout background color from Notion color name
function calloutBgColor(color) {
    const map = {
          gray_background:   '#F1F1EF',
          brown_background:  '#F4EEEE',
          orange_background: '#FFF0E6',
          yellow_background: '#FFF9C4',
          green_background:  '#EAFAF1',
          blue_background:   '#EDE4D8',
          purple_background: '#F6F3F9',
          pink_background:   '#FFF0F6',
          red_background:    '#FEE2E2',
      default:           'var(--bg-tertiary)',
    };
    return map[color] || map.default;
}

// Extract icon from callout icon object
function extractIcon(icon) {
    if (!icon) return '';
    if (icon.type === 'emoji') return icon.emoji || '';
    return '';
}

// Extract cover image URL from a Notion page object
function extractCover(page) {
    if (!page || !page.cover) return '';
    const cover = page.cover;
    if (cover.type === 'external') return cover.external.url || '';
    if (cover.type === 'file')     return cover.file.url || '';
    return '';
}

// Extract cell value from a Notion page property
function propToHtml(prop) {
    if (!prop) return '';
    switch (prop.type) {
      case 'title':        return richTextToHtml(prop.title || []);
      case 'rich_text':    return richTextToHtml(prop.rich_text || []);
      case 'number':       return prop.number != null ? String(prop.number) : '';
      case 'select':       return prop.select ? prop.select.name : '';
      case 'multi_select': return (prop.multi_select || []).map(s => s.name).join(', ');
      case 'date':         return prop.date ? (prop.date.start || '') : '';
      case 'checkbox':     return prop.checkbox ? '&#10003;' : '';
      case 'url':          return prop.url ? '<a href="' + prop.url + '">' + prop.url + '</a>' : '';
      case 'email':        return prop.email || '';
      case 'phone_number': return prop.phone_number || '';
      default:             return getText(prop);
    }
}

// Extract raw date value for sorting
function propToDate(prop) {
    if (!prop || prop.type !== 'date') return '';
    return prop.date ? (prop.date.start || '') : '';
}

// Convert a Notion block to a simple object for site.json
function blockToObj(block) {
    const type    = block.type;
    const content = block[type];
    if (!content) return null;
    const text = richTextToHtml(content.rich_text || []);

  switch (type) {
    case 'heading_1': return { type: 'heading_1', text };
    case 'heading_2': return { type: 'heading_2', text };
    case 'heading_3': return { type: 'heading_3', text };
    case 'paragraph': return text ? { type: 'paragraph', text } : null;
    case 'quote':     return { type: 'quote', text };
    case 'divider':   return { type: 'divider' };
    case 'bulleted_list_item':  return { type: 'bulleted_list_item', text };
    case 'numbered_list_item':  return { type: 'numbered_list_item', text };

    case 'callout': {
            const icon = extractIcon(content.icon);
            const bg   = calloutBgColor(content.color || 'default');
            return { type: 'callout', icon, text, color: bg };
    }

    case 'image': {
            let url = '';
            if (content.type === 'external') url = content.external.url;
            else if (content.type === 'file') url = content.file.url;
            if (!url) return null;
            const caption = richTextToHtml(content.caption || []);
            return { type: 'image', url, caption };
    }

    case 'table':
            return {
                      type: 'table',
                      has_header: content.has_column_header || false,
                      _id: block.id,
                      _has_children: block.has_children,
            };

    case 'table_row':
            return {
                      type: 'table_row',
                      cells: (content.cells || []).map(cell => richTextToHtml(cell)),
            };

    case 'child_database':
    case 'linked_database': {
            const title = content.title || '';
            const dbId  = block.id.replace(/-/g, '');
            return {
                      type: '_database',
                      title,
                      _id: dbId,
            };
    }

    case 'embed':
    case 'video':
    case 'pdf': {
            const url = content.external ? content.external.url
                              : content.file     ? content.file.url
                              : '';
            if (!url) return null;
            return { type: 'embed', url };
    }

      // Blocks that may contain children (traverse them)
    case 'column_list':
    case 'column':
    case 'toggle':
    case 'synced_block':
    case 'template': {
            return {
                      type: '_container',
                      _id: block.id,
                      _has_children: block.has_children,
            };
    }

    default:
            console.log('  [skip]', type);
            return null;
  }
}

// Fetch all child blocks of a page/block (handles pagination)
async function fetchBlocks(pageId) {
    const blocks = [];
    let cursor;
    do {
          const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor, page_size: 100 });
          blocks.push(...res.results);
          cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return blocks;
}

// Fetch all rows from a data source (handles pagination, new 2025-09-03 API)
async function fetchDataSource(dataSourceId) {
    const rows = [];
    let cursor;
    do {
          const res = await notion.dataSources.query({
                  data_source_id: dataSourceId,
                  start_cursor: cursor
          });
          rows.push(...res.results);
          cursor = res.has_more ? res.next_cursor : undefined;
    } while (cursor);
    return rows;
}

// Convert a database block to a gallery of work cards
async function databaseToGallery(obj) {
    try {
          const dsId = await getDataSourceId(obj._id);
          const rows = await fetchDataSource(dsId);
          console.log('  [database] got', rows.length, 'rows via dataSources');

      if (!rows.length) return null;

      // Detect column names from first row properties
      const firstProps = rows[0].properties || {};
          const colNames = Object.keys(firstProps);
          console.log('  [database] columns:', colNames.join(', '));

      // Map property names (case-insensitive match)
      function findProp(row, ...candidates) {
              const props = row.properties || {};
              for (const name of Object.keys(props)) {
                        if (candidates.some(c => name.toLowerCase() === c.toLowerCase())) {
                                    return props[name];
                        }
              }
              return null;
      }

      const cards = rows.map(row => {
              const cover       = extractCover(row);
              const dateProp    = findProp(row, 'Date', 'date', 'Start', 'Period');
              const titleProp   = findProp(row, 'Position ', 'Position', 'Title', 'Name', 'Role');
              const compProp    = findProp(row, 'Position', 'Company', 'Organization', 'Employer');
              const descProp    = findProp(row, 'Description', 'Summary', 'Details', 'About');

                                   // Prefer the title-type property for job title
                                   const allProps = row.properties || {};
              let jobTitle = '';
              let company  = '';
              // Find the title-type property first
                                   for (const [name, prop] of Object.entries(allProps)) {
                                             if (prop.type === 'title') {
                                                         jobTitle = propToHtml(prop);
                                                         break;
                                             }
                                   }
              // Company is the second "Position" (plain text / rich_text)
                                   // Use the Position column that is NOT the title
                                   for (const [name, prop] of Object.entries(allProps)) {
                                             if ((name === 'Position' || name === 'Position ') && prop.type !== 'title') {
                                                         company = propToHtml(prop);
                                                         break;
                                             }
                                   }

                                   const date = dateProp ? propToDate(dateProp) : '';
              const desc = descProp ? propToHtml(descProp) : '';

                                   return { cover, date, jobTitle, company, desc };
      });

      // Sort by date descending (most recent first)
      cards.sort((a, b) => {
              if (!a.date && !b.date) return 0;
              if (!a.date) return 1;
              if (!b.date) return -1;
              return b.date.localeCompare(a.date);
      });

      return { type: 'gallery', title: obj.title, cards };
    } catch (e) {
          console.log('  [database error]:', e.message);
          return {
                  type: 'callout',
                  icon: '\u26a0\ufe0f',
                  text: (obj.title ? '<strong>' + obj.title + '</strong>: ' : '') +
                                'Database not accessible. Please add the Notion integration to this database.',
                  color: '#FFF9C4'
          };
    }
}

// Recursively process blocks, diving into containers
async function processBlocks(rawBlocks) {
    const out = [];
    for (const block of rawBlocks) {
          const obj = blockToObj(block);
          if (!obj) continue;

      // Dive into container blocks (column_list, toggle, etc.)
      if (obj.type === '_container') {
              if (obj._has_children) {
                        const childBlocks = await fetchBlocks(obj._id);
                        const childOut    = await processBlocks(childBlocks);
                        out.push(...childOut);
              }
              continue;
      }

      // Regular table: fetch row children
      if (obj.type === 'table' && obj._has_children) {
              const childBlocks = await fetchBlocks(obj._id);
              obj.rows = childBlocks
                .map(b => blockToObj(b))
                .filter(b => b && b.type === 'table_row')
                .map(b => b.cells);
              delete obj._id;
              delete obj._has_children;
              out.push(obj);
              continue;
      }

      // Database block (child or linked): fetch as gallery of cards
      if (obj.type === '_database') {
              const galleryObj = await databaseToGallery(obj);
              if (galleryObj) out.push(galleryObj);
              continue;
      }

      delete obj._id;
          delete obj._has_children;
          out.push(obj);
    }
    return out;
}

async function buildSettings() {
    const dsId = await getDataSourceId(SETTINGS_DB);
    const rows = await fetchDataSource(dsId);
    const settings = {};
    for (const row of rows) {
          const p   = row.properties || {};
          const key = getText(p.Key   || p.Name  || p.key);
          const val = getText(p.Value || p.value || p.Val);
          if (key) settings[key] = val;
    }
    return settings;
}

async function buildNavigation() {
    const dsId = await getDataSourceId(NAV_DB);
    const rows = await fetchDataSource(dsId);
    const items = rows.map(row => {
          const p = row.properties || {};
          return {
                  id:      getText(p.ID),
                  label:   getText(p.Label),
                  url:     getText(p.URL),
                  order:   p.Order && p.Order.number != null ? p.Order.number : 99,
                  visible: p.Visible ? !!p.Visible.checkbox : true,
                  type:    p.Type && p.Type.select ? p.Type.select.name : 'page'
          };
    });
    items.sort((a, b) => a.order - b.order);
    return items;
}

async function buildPage(pageId) {
    const rawBlocks = await fetchBlocks(pageId);
    console.log('  raw blocks:', rawBlocks.length);
    const blocks = await processBlocks(rawBlocks);
    return { blocks };
}

async function main() {
    console.log('Reading settings...');
    const settings = await buildSettings();
    console.log('  ' + Object.keys(settings).length + ' settings keys');

  console.log('Reading navigation...');
    const navigation = await buildNavigation();
    console.log('  ' + navigation.length + ' nav items');

  console.log('Reading Main page...');
    const main = await buildPage(PAGE_MAIN);
    console.log('  ' + main.blocks.length + ' blocks');

  console.log('Reading About page...');
    const about = await buildPage(PAGE_ABOUT);
    console.log('  ' + about.blocks.length + ' blocks');

  const site = { settings, navigation, pages: { main, about } };
    fs.writeFileSync('site.json', JSON.stringify(site, null, 2));
    console.log('Wrote site.json');
}

main().catch(err => { console.error(err); process.exit(1); });
