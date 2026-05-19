# cmo.bio — Architecture & Developer Notes

## Architecture

```
Notion (content)
    ↓ webhook
Cloudflare Worker → GitHub repository_dispatch
    ↓
GitHub Actions (.github/workflows/sync.yml)
    ↓ node .github/scripts/sync.js
site.json (repo root)
    ↓
GitHub Pages → cmo.bio
app.js reads site.json and renders the page
```

**GitHub repo:** `startupmarketing-creator/cmo-maria`

---

## Project Files

| File | Purpose |
|------|---------|
| `.github/scripts/sync.js` | Fetches data from Notion, writes `site.json` |
| `app.js` | Reads `site.json`, builds page HTML in the browser |
| `style.css` | All site styles |
| `site.json` | Site data (auto-generated — do not edit manually) |
| `index.html` | Single HTML file, imports `app.js` and `style.css` |

---

## Notion — What is Managed Where

| Notion ID | What it is |
|-----------|-----------|
| `357ca93d844180c3a965db01e49db981` | SETTINGS_DB — CSS variables (colors, fonts) |
| `357ca93d84418097a8a5d51b59771f55` | NAV_DB — navigation (logo, menu, contacts) |
| `357ca93d84418080b90ec9d1bb0a596f` | PAGE_MAIN — home page |
| `357ca93d84418082ae87dc96bb3d7dd5` | PAGE_ABOUT — About page |

### Nav item types in NAV_DB

| Type | Role |
|------|------|
| `logo` | Logo link (left side of nav) |
| `page` | Main menu item |
| `social` | Contact link (email, telegram, linkedin, etc.) |

---

## Critical: Notion SDK v5

The project uses **`@notionhq/client@^5`**.

- To query databases: **`notion.dataSources.query`** + **`getDataSourceId()`**
- `notion.databases.query` does **not** work in v5
- Pages and blocks work normally: `notion.pages.retrieve`, `notion.blocks.children.list`

```js
// Correct way to query a database in SDK v5:
const dsId = await getDataSourceId(databaseId); // resolves to data_sources[0].id
const rows = await notion.dataSources.query({ data_source_id: dsId });
```

---

## site.json Structure

```json
{
  "settings": { "key": "value" },
  "navigation": [
    {
      "id": "...",
      "label": "...",
      "url": "...",
      "type": "logo | page | social",
      "visible": true,
      "order": 1
    }
  ],
  "pages": {
    "main":  { "blocks": [...] },
    "about": { "blocks": [...] }
  }
}
```

### Block types in pages.blocks

`heading_1`, `heading_2`, `heading_3`, `paragraph`, `quote`, `divider`, `callout`, `image`, `table`, `gallery`, `embed`, `bulleted_list_item`, `numbered_list_item`

### gallery block (Work database)

Each card:

```json
{
  "cover":      "https://...",
  "date":       "2025-08-01",
  "endDate":    "2026-04-30",
  "jobTitle":   "Chief Marketing Officer",
  "company":    "Regional E-commerce Marketplace",
  "desc":       "Short description...",
  "body":       "<p>Full HTML content...</p>",
  "references": ["Name 1", "Name 2"]
}
```

**Column mapping in Work DB:**
- `title`-type property → `company` (company name)
- `"Position "` (rich_text, trailing space) → `jobTitle`
- `"References"` (relation type) → `references` (fetches page titles from linked records)

---

## How to Add a New Page

1. **Notion** — create a new page, copy its ID from the URL (last 32 chars)
2. **sync.js** — add the ID as a constant and call `buildPage()`:

```js
const PAGE_BLOG = 'your-page-id-here';
// ...
const blog = await buildPage(PAGE_BLOG);
const site = { settings, navigation, pages: { main, about, blog } };
```

3. **NAV_DB in Notion** — add a nav item with URL `/blog` and type `page`
4. **Run sync** — the new page appears at `cmo.bio/#blog`

---

## How to Run Sync Manually

GitHub → **Actions** → **"Sync from Notion"** → **Run workflow** → **Run workflow** (green button)

---

## How to Edit Files Safely

Most reliable approach (avoids GitHub search bar focus issues):

```js
// 1. Copy new file content to clipboard in browser console:
navigator.clipboard.writeText(newContent);

// 2. Open the editor:
// github.com/startupmarketing-creator/cmo-maria/edit/main/FILENAME

// 3. Click into editor → Ctrl+A → Ctrl+V → Commit changes
```

---

## Current nav HTML Structure (app.js → buildNav)

```html
<div class="nav-inner">
  <div class="nav-logo">...</div>
  <div class="nav-menu">[pages][social]</div>
</div>
```

---

## Known Issues & Limitations

| Issue | Details |
|-------|---------|
| "Untitled" database | ID `364ca93d-8441-80a0-bf39-e6966bd58994` — not connected to integration, shows yellow callout. Fix: open in Notion → ••• → Connections → add integration |
| Callout icons | File/image icons not rendered — only emoji icons work (API limitation) |
| References in Work cards | Type is `relation` — the linked people database also needs the Notion integration connected |
| Date end fields | Add end date in Notion Date field to show "Month YYYY — Month YYYY" instead of "Month YYYY — Present" |
