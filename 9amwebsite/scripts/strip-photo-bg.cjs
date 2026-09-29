/* Remove leftover Unsplash background URLs from inline styles. Idempotent.
 * Run: node scripts/strip-photo-bg.cjs
 */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const skipDirs = /^(node_modules|dist|site|scripts|_docs|data|investors|creative|email_campaigns|vidamotor|vidalisting|\.)/;
const URLRE = /url\(\s*(['"])?https:\/\/images\.unsplash\.com[^)]*?\1\s*\)/gi;
let files = 0, count = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!skipDirs.test(entry.name)) walk(path.join(dir, entry.name)); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const f = path.join(dir, entry.name);
    let html = fs.readFileSync(f, 'utf8');
    const before = (html.match(URLRE) || []).length;
    if (!before) continue;
    html = html.replace(new RegExp('background-image\\s*:\\s*' + URLRE.source, 'gi'), 'background-image:none');
    html = html.replace(/,?\s*url\(\s*([\'"])?https:\/\/images\.unsplash\.com[^)]*?\1\s*\)/gi, '');
    html = html.replace(URLRE, 'none');
    if (html !== fs.readFileSync(f, 'utf8')) { fs.writeFileSync(f, html); files++; count += before; }
  }
})(root);
console.log(`Stripped ${count} photo background URLs across ${files} pages.`);
