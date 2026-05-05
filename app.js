// CMO-Maria — reads site.json and builds the page

async function loadSite() {
    const res = await fetch('site.json?t=' + Date.now());
    const data = await res.json();
    applySettings(data.settings || {});
    buildNav(data.navigation || []);
    buildPage(data.pages || {});
}

function applySettings(settings) {
    const root = document.documentElement;
    Object.entries(settings).forEach(([key, value]) => {
          const cssVar = '--' + key.replace(/_/g, '-');
          root.style.setProperty(cssVar, value);
    });
}

function buildNav(navItems) {
    const nav = document.getElementById('nav');
    if (!nav) return;
    const sorted = navItems.sort((a, b) => (a.order || 0) - (b.order || 0));
    const logo = sorted.find(i => i.type === 'logo');
    const pages = sorted.filter(i => i.type === 'page' && i.visible);
    const socials = sorted.filter(i => i.type === 'social' && i.visible);
    nav.innerHTML = `
        <div class="nav-inner">
              <div class="nav-logo">
                      ${logo ? `<a href="${logo.url || '/'}">${logo.label || ''}</a>` : ''}
                            </div>
                                  <button class="nav-burger" onclick="toggleMenu()" aria-label="Menu">&#9776;</button>
                                        <div class="nav-menu" id="nav-m
