/* Replace remaining stock content photos (blog images, testimonial avatars)
 * with original on-brand SVG placeholders. Idempotent.
 * Run: node scripts/replace-photos.cjs
 */
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const assetDir = path.join(root, 'assets');
const avatarDir = path.join(assetDir, 'avatars');
const imgDir = path.join(assetDir, 'img');

const avatarTints = [['#1c93d6', '#0d5f92'], ['#7950b1', '#4f2f80'], ['#2fa9bd', '#146b7a'], ['#3f9d78', '#1f6b4e'], ['#5f6ad0', '#393f96']];
const insightTints = [
  { accent: '#1896d6', soft: '#eaf5fb' },
  { accent: '#ef8443', soft: '#fef1e8' },
  { accent: '#8f68c4', soft: '#f4edfc' },
  { accent: '#2fa9bd', soft: '#e9f7fa' },
  { accent: '#3f9d78', soft: '#e9f7ef' }
];

function avatar(c1, c2, i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80" width="80" height="80" role="img" aria-label="Customer"><defs><linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><clipPath id="c${i}"><circle cx="40" cy="40" r="40"/></clipPath></defs><g clip-path="url(#c${i})"><rect width="80" height="80" fill="url(#g${i})"/><circle cx="40" cy="31" r="13.5" fill="#fff" fill-opacity=".94"/><path d="M12 78c1.5-16 13.5-26 28-26s26.5 10 28 26Z" fill="#fff" fill-opacity=".94"/></g></svg>`;
}
function insight(t, i) {
  const line = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="9" rx="4.5" fill="#c9d6e0"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500" role="img" aria-label="9amLeads illustration"><defs><linearGradient id="b${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fbfd"/><stop offset="1" stop-color="${t.soft}"/></linearGradient></defs><rect width="800" height="500" fill="url(#b${i})"/><circle cx="650" cy="80" r="150" fill="${t.accent}" opacity=".08"/><circle cx="110" cy="440" r="120" fill="${t.accent}" opacity=".06"/><rect x="70" y="110" width="330" height="280" rx="22" fill="#fff" stroke="#e4e9ee"/><rect x="100" y="146" width="120" height="14" rx="7" fill="${t.accent}"/><rect x="100" y="178" width="270" height="26" rx="8" fill="#eef3f7"/>${line(100, 224, 240)}${line(100, 252, 210)}${line(100, 280, 250)}<rect x="100" y="318" width="150" height="34" rx="10" fill="${t.accent}"/><rect x="360" y="200" width="370" height="190" rx="20" fill="#fff" stroke="#e4e9ee"/><rect x="392" y="236" width="110" height="13" rx="6" fill="${t.accent}"/>${line(392, 268, 280)}${line(392, 296, 240)}<circle cx="690" cy="150" r="34" fill="${t.accent}" opacity=".14"/><circle cx="690" cy="150" r="16" fill="${t.accent}"/></svg>`;
}

fs.mkdirSync(avatarDir, { recursive: true });
fs.mkdirSync(imgDir, { recursive: true });
avatarTints.forEach(([a, b], i) => fs.writeFileSync(path.join(avatarDir, `avatar-${i + 1}.svg`), avatar(a, b, i + 1)));
insightTints.forEach((t, i) => fs.writeFileSync(path.join(imgDir, `insight-${i + 1}.svg`), insight(t, i + 1)));

const skipDirs = /^(node_modules|dist|site|scripts|_docs|data|investors|creative|email_campaigns|vidamotor|vidalisting|\.)/;
let a = 0, b = 0, replaced = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!skipDirs.test(entry.name)) walk(path.join(dir, entry.name)); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const file = path.join(dir, entry.name);
    let html = fs.readFileSync(file, 'utf8');
    const out = html.replace(/<img([^>]*?)src=("|')https:\/\/images\.unsplash\.com[^"']*\2([^>]*)>/gi, (m, pre, q, post) => {
      const attrs = pre + post;
      const isAvatar = /w=(\d+)/.test(m) && Number((m.match(/w=(\d+)/) || [])[1]) <= 200;
      if (isAvatar) { a++; return `<img${pre}src="/assets/avatars/avatar-${(a - 1) % avatarTints.length + 1}.svg"${post}>`; }
      b++; return `<img${pre}src="/assets/img/insight-${(b - 1) % insightTints.length + 1}.svg"${post}>`;
    });
    if (out !== html) { fs.writeFileSync(file, out); replaced++; }
  }
})(root);
console.log(`Generated ${avatarTints.length} avatars and ${insightTints.length} illustrations; updated ${replaced} pages (${a} avatars, ${b} images).`);
