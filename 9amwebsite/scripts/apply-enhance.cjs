/* Apply the light theme + layout polish to the current site's public pages, and
 * repair common character-encoding damage. Idempotent: safe to run repeatedly.
 * Run: node scripts/apply-enhance.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const skipDirs = /^(node_modules|dist|site|scripts|_docs|data|investors|creative|vidamotor|vidalisting|\..*)$/;
// These are intentionally dark-designed pages; leaving them untouched keeps their text readable.
const skipFiles = new Set(['affiliates.html', 'affiliate-compare.html', 'affiliate-terms.html']);
const linkTag = '<link rel="stylesheet" href="/site-enhance.css">';
const lightScript = '<script>try{if(!localStorage.getItem("theme"))localStorage.setItem("theme","light");}catch(e){}</script>';

function textFixes(html) {
  return html
    .replace(/\uFFFD25/g, '£25')
    .replace(/\uFFFD\s?-\s?/g, '→ ')
    .replace(/\uFFFD-\uFFFD\uFE0F/g, '')
    .replace(/\uFFFD\uFE0F?/g, '·')
    .replace(/\?{5,}/g, '★★★★★')
    .replace(/ZERO COMPETITION/g, 'FRESH EVERY MORNING');
}

function enhance(file) {
  let html = fs.readFileSync(file, 'utf8');
  const original = html;
  html = textFixes(html);
  if (!html.includes('site-enhance.css')) html = html.replace(/<\/head>/i, linkTag + '</head>');
  if (!html.includes('localStorage.setItem("theme","light")') && !html.includes("localStorage.setItem('theme','light')")) {
    html = html.replace(/<head([^>]*)>/i, (m) => m + lightScript);
  }
  if (html !== original) { fs.writeFileSync(file, html); return true; }
  return false;
}

let count = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!skipDirs.test(entry.name)) walk(path.join(dir, entry.name)); continue; }
    if (!entry.name.endsWith('.html') || skipFiles.has(entry.name)) continue;
    if (enhance(path.join(dir, entry.name))) count++;
  }
})(root);
console.log(`Enhanced ${count} HTML pages (light theme link, light default, text fixes).`);
