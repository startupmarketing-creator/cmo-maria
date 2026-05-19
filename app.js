// CMO-Maria — reads site.json and builds the page

async function loadSite() {
      const res  = await fetch('site.json?t=' + Date.now());
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
      const logo    = visible.find(i => i.type === 'logo');
      const pages   = visible.filter(i => i.type === 'page');
      const social  = visible.filter(i => i.type === 'social');

  const renderLink = (item) => {
          const href   = isExternal(item.url) ? item.url : toHash(item.url);
          const target = isExternal(item.url) ? ' target="_blank" rel="noopener"' : '';
          return '<a href="' + href + '"' + target + '>' + (item.label || '') + '</a>';
  };

  nav.innerHTML =
          '<div class="nav-inner">' +
            '<div class="nav-logo">' + (logo ? renderLink(logo) : '') + '</div>' +
            '<div class="nav-menu">' + pages.map(renderLink).join('') + social.map(renderLink).join('') + '</div>' +
          '</div>';
}

// ── Block renderers ──────────────────────────────────────────────────────────

function renderTable(block) {
      if (!block.rows || !block.rows.length) return '';
      let html = '<div class="notion-table-wrap"><table class="notion-table">';
      block.rows.forEach((row, i) => {
              html += '<tr>';
              row.forEach(cell => {
                        const tag = (i === 0 && block.has_header) ? 'th' : 'td';
                        html += '<' + tag + '>' + (cell || '') + '</' + tag + '>';
              });
              html += '</tr>';
      });
      html += '</table></div>';
      return html;
}

// Format a date string like "2025-08-01" to "August 2025"
function formatDate(dateStr) {
      if (!dateStr) return '';
      try {
              const d = new Date(dateStr + 'T00:00:00');
              return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      } catch (e) {
              return dateStr;
      }
}

function renderGallery(block) {
      if (!block.cards || !block.cards.length) return '';
      // Store cards globally so onclick handlers can reference them
      window._galleryCards = block.cards;
      let html = '<div class="notion-gallery">';
      block.cards.forEach(function(card, idx) {
              html += '<div class="gallery-card" role="button" tabindex="0"' +
                      ' onclick="openModal(window._galleryCards[' + idx + '])">';
              if (card.cover) {
                      html += '<div class="gallery-card-cover"><img src="' + card.cover + '" alt="" loading="lazy"></div>';
              } else {
                      html += '<div class="gallery-card-cover gallery-card-cover--empty"></div>';
              }
              html += '<div class="gallery-card-body">';
              if (card.jobTitle) html += '<p class="gallery-card-company">' + card.jobTitle + '</p>';
              if (card.company)  html += '<p class="gallery-card-title">' + card.company + '</p>';
              if (card.date)     html += '<p class="gallery-card-date">' + formatDate(card.date) + '</p>';
              if (card.desc)     html += '<p class="gallery-card-desc">' + card.desc + '</p>';
              html += '</div></div>';
      });
      html += '</div>';
      return html;
}

function renderBlock(block) {
      switch (block.type) {
          case 'heading_1': return '<h1>' + block.text + '</h1>';
          case 'heading_2': return '<h2>' + block.text + '</h2>';
          case 'heading_3': return '<h3>' + block.text + '</h3>';
          case 'paragraph': return '<p>'  + block.text + '</p>';
          case 'quote':     return '<blockquote><p>' + block.text + '</p></blockquote>';
          case 'divider':   return '<hr/>';
          case 'bulleted_list_item': return '<li>' + block.text + '</li>';
          case 'numbered_list_item': return '<li>' + block.text + '</li>';

          case 'callout':
                    return '<div class="notion-callout" style="background:' + (block.color || 'var(--bg-tertiary)') + '">' +
                                (block.icon ? '<span class="callout-icon">' + block.icon + '</span>' : '') +
                                '<div class="callout-text">' + block.text + '</div>' +
                              '</div>';

          case 'image':
                    return '<figure class="notion-image">' +
                                '<img src="' + block.url + '" alt="' + (block.caption || '') + '" loading="lazy">' +
                                (block.caption ? '<figcaption>' + block.caption + '</figcaption>' : '') +
                              '</figure>';

          case 'table':
                    return renderTable(block);

          case 'gallery':
                    return renderGallery(block);

          case 'embed':
                    return '<div class="notion-embed">' +
                                '<iframe src="' + block.url + '" frameborder="0" allowfullscreen loading="lazy"></iframe>' +
                              '</div>';

          default: return '';
      }
}

// Group consecutive list items into a single <ul> or <ol>
function renderBlocks(blocks) {
      let html = '';
      let listOpen = null;
      for (const b of blocks) {
              const isBul    = b.type === 'bulleted_list_item';
              const isNum    = b.type === 'numbered_list_item';
              const wantsList = isBul ? 'ul' : isNum ? 'ol' : null;
              if (wantsList !== listOpen) {
                        if (listOpen)   html += '</' + listOpen + '>';
                        if (wantsList)  html += '<' + wantsList + '>';
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
      const key  = getCurrentPageKey();
      const page = pages[key] || pages.main;
      if (!page) { container.innerHTML = '<p>Page not found.</p>'; return; }
      container.innerHTML = renderBlocks(page.blocks || []);
}


// ── Modal ────────────────────────────────────────────────────────────────────

function buildModal() {
      if (document.getElementById('work-modal')) return;
      const el = document.createElement('div');
      el.id = 'work-modal';
      el.className = 'work-modal-overlay';
      el.innerHTML =
              '<div class="work-modal">' +
                      '<button class="work-modal-close" onclick="closeModal()" aria-label="Close">&times;</button>' +
                      '<div class="work-modal-cover" id="modal-cover"></div>' +
                      '<div class="work-modal-body">' +
                              '<p class="work-modal-company" id="modal-company"></p>' +
                              '<h2 class="work-modal-title" id="modal-title"></h2>' +
                              '<p class="work-modal-date" id="modal-date"></p>' +
                              '<div class="work-modal-content" id="modal-content"></div>' +
                      '</div>' +
              '</div>';
      el.addEventListener('click', function(e) { if (e.target === el) closeModal(); });
      document.addEventListener('keydown', function(e) { if (e.key === 'Escape') closeModal(); });
      document.body.appendChild(el);
}

function openModal(card) {
      buildModal();
      const modal = document.getElementById('work-modal');
      document.getElementById('modal-company').innerHTML = card.jobTitle || '';
      document.getElementById('modal-title').innerHTML   = card.company  || '';
      document.getElementById('modal-date').textContent  = card.date ? formatDate(card.date) : '';
      document.getElementById('modal-content').innerHTML = card.body || ('<p>' + (card.desc || '') + '</p>');
      const coverEl = document.getElementById('modal-cover');
      coverEl.innerHTML = card.cover ? '<img src="' + card.cover + '" alt="">' : '';
      coverEl.style.display = card.cover ? 'block' : 'none';
      modal.classList.add('is-open');
      document.body.classList.add('modal-open');
}

function closeModal() {
      const modal = document.getElementById('work-modal');
      if (modal) modal.classList.remove('is-open');
      document.body.classList.remove('modal-open');
}

// Boot
loadSite().catch(err => {
      console.error('Failed to load site:', err);
      const c = document.getElementById('main-content');
      if (c) c.innerHTML = '<p>Failed to load content. Try refreshing.</p>';
});
