const { Client } = require('@notionhq/client');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SETTINGS_DB = '357ca93d844180c3a965db01e49db981';
const NAV_DB      = '357ca93d84418097a8a5d51b59771f55';
const PAGE_MAIN   = '357ca93d84418080b90ec9d1bb0a596f';
const PAGE_ABOUT  = '357ca93d84418082ae87dc96bb3d7dd5';

// Extract plain text from a property (title or rich_text)
function getText(prop) {
  if (!prop) return '';
  if (prop.type === 'title') return prop.title.map(t => t.plain_text).join('');
  if (prop.type === 'rich_text') return prop.rich_text.map(t => t.plain_text).join('');
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
    if (a.bold) s = '<strong>' + s + '</strong>';
    if (a.italic) s = '<em>' + s + '</em>';
    if (a.code) s = '<code>' + s + '</code>';
    if (a.color && a.color !== 'default') {
      const color = a.color.replace('_background', '');
      const cssColor = color === 'blue' ? 'var(--accent-color)' : color;
      const isBg = a.color.endsWith('_background');
      s = isBg
        ? '<span style="background:' + cssColor + '">' + s + '</span>'
        : '<span style="color:' + cssColor + '">' + s + '</span>';
    }
    if (t.href) s = '<a href="' + t.href + '">' + s + '</a>';
    return s;
  }).join('');
}

// Convert a Notion block to a simple object for site.json
function blockToObj(block) {
  const type = block.type;
  const content = block[type];
  if (!content) return null;
  const text = richTextToHtml(content.rich_text || []);
  switch (type) {
    case 'heading_1': return { type: 'heading_1', text };
    case 'heading_2': return { type: 'heading_2', text };
    case 'heading_3': return { type: 'heading_3', text };
    case 'paragraph': return text ? { type: 'paragraph', text } : null;
    case 'quote': return { type: 'quote', text };
    case 'divider': return { type: 'divider' };
    case 'bulleted_list_item': return { type: 'bulleted_list_item', text };
    case 'numbered_list_item': return { type: 'numbered_list_item', text };
    default: return null;
  }
}

// Fetch all child blocks of a page (handles pagination)
async function fetchBlocks(pageId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({ block_id: pageId, start_cursor: cursor });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

// Fetch all rows from a database (handles pagination)
async function fetchDb(dbId) {
  const rows = [];
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: dbId, start_cursor: cursor });
    rows.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return rows;
}

async function buildSettings() {
  const rows = await fetchDb(SETTINGS_DB);
  const settings = {};
  for (const row of rows) {
    const key = getText(row.properties.Key);
    const value = getText(row.properties.Value);
    if (key) settings[key] = value;
  }
  return settings;
}

async function buildNavigation() {
  const rows = await fetchDb(NAV_DB);
  const items = rows.map(row => {
    const p = row.properties;
    return {
      id: getText(p.ID),
      label: getText(p.Label),
      url: getText(p.URL),
      order: p.Order && p.Order.number != null ? p.Order.number : 999,
      visible: p.Visible && p.Visible.checkbox === true,
      type: p.Type && p.Type.select ? p.Type.select.name : 'page'
    };
  });
  items.sort((a, b) => a.order - b.order);
  return items;
}

async function buildPage(pageId) {
  const blocks = await fetchBlocks(pageId);
  const out = blocks.map(blockToObj).filter(Boolean);
  return { blocks: out };
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
