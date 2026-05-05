const { Client } = require('@notionhq/client');
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const SETTINGS_DB = '357ca93d844180c3a965db01e49db981';
const NAV_DB = '357ca93d84418097a8a5d51b59771f55';
const PAGE_MAIN = '357ca93d84418080b90ec9d1bb0a596f';
const PAGE_ABOUT = '357ca93d84418082ae87dc96bb3d7dd5';

function getText(prop) {
    if (!prop) return '';
    if (prop.type === 'title') return prop.title.map(t => t.plain_text).join('');
    if (prop.type === 'rich_text') return prop.rich_text.map(t => t.plain_text).join('');
    return '';
}

function blockToObj(block) {
    const type = block.type;
    const content = block[type];
    if (!content) return null;
    const richText = content.rich_text || [];
    const text = richText.map(t => {
          let s = t.plain_text;
          if (t.annotations.bold) s = '<strong>' + s + '</strong>';
          if (t.annotations.italic) s = '<em>' + s + '</em>';
          if (t.annotations.code) s = '<code>' + s + '</code>';
          if (t.annotations.color && t.annotations.color !== 'default') {
                  const color = t.annotations.color.replace('_background', '');
                  const cssColor = color === 'blue' ? 'var(--accent-color)' : color;
                  s = '<span style="color:' + cssColor + '">' + s + '</span>';
          }
          return s;
    }).join('');
    switch (type) {
      case 'heading_1': return { type: 'heading_1', text };
      case 'heading_2': return { type: 'heading_2', text };
      case 'heading_3': return { type: 'heading_3', text };
      case 'paragraph': return text ? { type: 'paragraph', text } : null;
      case 'quote': return { type: 'quote', text };
      case 'divider': return { type: 'divider' 
