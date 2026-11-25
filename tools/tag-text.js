// Marks every editable text block in the site's HTML pages with data-et="<id>" and writes admin-pages.json.
// Safe to re-run: existing ids are kept, new text blocks get new ids. Usage: node tools/tag-text.js [--dry]
const fs = require('fs');
const path = require('path');
const { parseDocument } = require('htmlparser2');
const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const SKIP_FILES = new Set(['admin.html', 'blog-post.html']);
const SKIP_TAGS = new Set(['script', 'style', 'svg', 'noscript', 'head', 'select', 'textarea', 'option', 'iframe', 'title', 'header', 'footer', 'nav', 'template', 'video', 'audio', 'canvas', 'code', 'pre']);
const UNIT_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'li', 'td', 'th', 'dt', 'dd', 'blockquote', 'figcaption', 'summary', 'label', 'button', 'a', 'span', 'div', 'strong', 'em', 'small', 'legend', 'caption', 'address']);
const INLINE = new Set(['a', 'strong', 'b', 'em', 'i', 'u', 'br', 'span', 'small', 'mark']);
const INLINE_ATTRS = new Set(['href', 'target', 'rel', 'class']);
const LETTER = /[A-Za-zÆØÅæøåÄÖÜäöüéèÉ]/;

const isEl = (n) => n.type === 'tag';
function excluded(el) {
  if (SKIP_TAGS.has(el.name)) return true;
  const a = el.attribs || {};
  if ('data-no-edit' in a) return true;
  const cls = a.class || '';
  return /\b(drawer|top-toolbar|lang-switch|site-footer|modal-overlay|bk-|cookie)/.test(cls);
}
function simpleInline(el) { // every descendant is plain inline markup
  for (const c of el.children || []) {
    if (c.type === 'text') continue;
    if (c.type === 'comment') continue;
    if (!isEl(c) || !INLINE.has(c.name)) return false;
    if (Object.keys(c.attribs || {}).some((k) => !INLINE_ATTRS.has(k))) return false;
    if (!simpleInline(c)) return false;
  }
  return true;
}
function textOf(n) { return n.type === 'text' ? n.data : (n.children || []).map(textOf).join(''); }
function startTagEnd(src, el) { // index just before the ">" (or "/>") closing the start tag
  let i = el.startIndex + 1, q = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (q) { if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === '>') break;
  }
  return src[i - 1] === '/' ? i - 1 : i;
}

const pages = [];
let totalNew = 0, totalAll = 0;
for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html') && !SKIP_FILES.has(x)).sort()) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const doc = parseDocument(src, { withStartIndices: true, withEndIndices: true });
  const existing = [...src.matchAll(/data-et="([a-z]\d+)"/g)].map((m) => +m[1].slice(1));
  let next = existing.length ? Math.max(...existing) + 1 : 1;
  const inserts = [];
  let count = 0;
  (function walk(node) {
    for (const el of node.children || []) {
      if (!isEl(el) || excluded(el)) continue;
      if (UNIT_TAGS.has(el.name) && simpleInline(el) && LETTER.test(textOf(el))) {
        count++;
        if (!('data-et' in el.attribs)) { inserts.push([startTagEnd(src, el), ' data-et="t' + next++ + '"']); }
        continue;
      }
      walk(el);
    }
  })(doc);
  totalAll += count; totalNew += inserts.length;
  let out = src;
  inserts.sort((a, b) => b[0] - a[0]).forEach(([pos, s]) => { out = out.slice(0, pos) + s + out.slice(pos); });
  if (!DRY && out !== src) fs.writeFileSync(path.join(ROOT, f), out);
  const title = ((src.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || f).replace(/\s*\|\s*Escape Copenhagen\s*$/i, '').replace(/\s+/g, ' ').trim();
  pages.push({ file: f, title, blocks: count });
}
if (!DRY) fs.writeFileSync(path.join(ROOT, 'admin-pages.json'), JSON.stringify({ pages }, null, 1));
console.log(pages.length + ' pages, ' + totalAll + ' editable text blocks (' + totalNew + ' newly tagged)');
