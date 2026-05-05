// CMO-Maria — reads site.json and builds the page

async function loadSite() {
  const res = await fetch('site.json?t=' + Date.now());
  const data = await res.json();
  applySettings(data.settings || {});
  buildNav(data.navigation || []);
  buildPage(data.pages || {});
  window.addEventListener('hashchange', () => buildPage(data.pages || {}));
}

// Apply settings as CSS variables on :root
function applySettings(settings) {
  const root = document.documentElement;
  Object.entries(settings).forEach(([key, value]) => {
    const cssVar = '--' + key.replace(/_/g, '-');
    root.style.setProperty(cssVar, value);
  });
}

// Convert Notion URL into a hash-based URL
function toHash(url) {
  if (!url) return '#';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url === '/') return '#';
  if (url.startsWith('/')) return '#' + url.slice(1);
  return url;
}

// Determine if a nav URL is external
function isExternal(url) {
  return url && (url.startsWith('http://') || url.startsWith('https://'));
}

// Build the top navigation bar
function buildNav(navItems) {
  const nav = document.getElementById('nav');
  if (!nav) return;
  const visible = navItems.filter(i => i.visible);
  const logo = visible.find(i => i.type === 'logo');
  const pages = visible.filter(i => i.type === 'page');
  const social = visible.filter(i => i.type === 'social');

  const renderLink = (item) => {
    const href = isExternal(item.url) ? item.url : toHash(item.url);
    const target = isExternal(item.url) ? ' target="_blank" rel="noopener"' : '';
    return '<a href="' + href + '"' + target + '>' + (item.label || '') + '</a>';
  };

  nav.innerHTML =
    '<div class="nav-inner">' +
      '<div class="nav-logo">' +
        (logo ? renderLink(logo) : '') +
      '</div>' +
      '<div class="nav-menu">' +
        pages.map(renderLink).join('') +
        social.map(renderLink).join('') +
      '</div>' +
    '</div>';
}

// Render a single block from site.json into HTML
function renderBlock(block) {
  switch (block.type) {
    case 'heading_1': return '<h1>' + block.text + '</h1>';
    case 'heading_2': return '<h2>' + block.text + '</h2>';
    case 'heading_3': return '<h3>' + block.text + '</h3>';
    case 'paragraph': return '<p>' + block.text + '</p>';
    case 'quote': return '<blockquote>' + block.text + '</blockquote>';
    case 'divider': return '<hr/>';
    case 'bulleted_list_item': return '<li>' + block.text + '</li>';
    case 'numbered_list_item': return '<li>' + block.text + '</li>';
    default: return '';
  }
}

// Group consecutive list items into a single <ul> or <ol>
function renderBlocks(blocks) {
  let html = '';
  let listOpen = null;
  for (const b of blocks) {
    const isBul = b.type === 'bulleted_list_item';
    const isNum = b.type === 'numbered_list_item';
    const wantsList = isBul ? 'ul' : isNum ? 'ol' : null;
    if (wantsList !== listOpen) {
      if (listOpen) html += '</' + listOpen + '>';
      if (wantsList) html += '<' + wantsList + '>';
      listOpen = wantsList;
    }
    html += renderBlock(b);
  }
  if (listOpen) html += '</' + listOpen + '>';
  return html;
}

// Pick which page to render based on the URL hash
function getCurrentPageKey() {
  const hash = (location.hash || '').replace(/^#\/?/, '').toLowerCase();
  if (hash === '' || hash === '/') return 'main';
  return hash;
}

// Build the main page content
function buildPage(pages) {
  const container = document.getElementById('main-content');
  if (!container) return;
  const key = getCurrentPageKey();
  const page = pages[key] || pages.main;
  if (!page) {
    container.innerHTML = '<p>Page not found.</p>';
    return;
  }
  container.innerHTML = renderBlocks(page.blocks || []);
}

// Boot
loadSite().catch(err => {
  console.error('Failed to load site:', err);
  const c = document.getElementById('main-content');
  if (c) c.innerHTML = '<p>Failed to load content. Try refreshing.</p>';
});
