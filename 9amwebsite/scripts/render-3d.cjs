/* Render the shared 3D scenes to optimised images.
 * Local build tool: run `node scripts/render-3d.cjs` when the scene artwork changes,
 * then commit the generated files under assets/refresh/3d/. The deploy build only
 * copies these images, so no browser or GPU is needed on Netlify.
 */
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const sharp = require('sharp');

const root = path.resolve(__dirname, '..');
const threeDir = path.join(root, 'node_modules', 'three');
const threeSrc = path.join(__dirname, 'three');
const outDir = path.join(root, 'assets', 'refresh', '3d');
const names = process.env.RENDER_SCENES ? process.env.RENDER_SCENES.split(',') : ['morning', 'moving', 'probate', 'business', 'planning', 'tenders', 'post', 'map', 'connect'];
const W = 1400, H = 1220;
const W1 = 700, H1 = 610;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json' };

function serve() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file;
    if (url.pathname === '/' || url.pathname === '/render.html') file = path.join(threeSrc, 'render.html');
    else if (url.pathname === '/scenes.js') file = path.join(threeSrc, 'scenes.js');
    else if (url.pathname.startsWith('/vendor/three/')) file = path.join(threeDir, url.pathname.replace('/vendor/three/', ''));
    else { res.writeHead(404); res.end(); return; }
    if (!fs.existsSync(file)) { res.writeHead(404); res.end('Not found: ' + url.pathname); return; }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  });
}

(async () => {
  if (!fs.existsSync(threeDir)) throw new Error('three is not installed. Run: npm install --include=dev');
  fs.mkdirSync(outDir, { recursive: true });
  const server = serve();
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: W1, height: H1 }, deviceScaleFactor: 2 });
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE:', m.text()); });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__ready === true, { timeout: 20000 });
  for (const name of names) {
    const dataUrl = await page.evaluate(([n, w, h]) => window.renderScene(n, w, h), [name, W, H]);
    if (!dataUrl || !dataUrl.startsWith('data:image/png;base64,')) throw new Error('No render for ' + name);
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const base2 = path.join(outDir, name);
    const webp2 = await sharp(png).resize(W, H).webp({ quality: 86, effort: 5 }).toBuffer();
    const webp1 = await sharp(png).resize(W1, H1).webp({ quality: 84, effort: 5 }).toBuffer();
    const png1 = await sharp(png).resize(W1, H1).png({ compressionLevel: 9 }).toBuffer();
    fs.writeFileSync(base2 + '@2x.webp', webp2);
    fs.writeFileSync(base2 + '.webp', webp1);
    fs.writeFileSync(base2 + '.png', png1);
    console.log(`rendered ${name}: webp@2x ${(webp2.length / 1024).toFixed(0)}KB, webp ${(webp1.length / 1024).toFixed(0)}KB, png ${(png1.length / 1024).toFixed(0)}KB`);
  }
  await browser.close();
  server.close();
  console.log(`Rendered ${names.length} scenes into ${outDir}`);
})().catch(async error => { console.error(error); process.exit(1); });
