// deploy-9amwebsite.js — one-command deploy of the live marketing site (9amwebsite folder)
// to Netlify via the deploy API. This is a DIRECT content upload: it does NOT touch the
// site's linked git repo, the Render backend, or anything else live. It only publishes
// the local 9amwebsite/ folder (the same files served at www.9amleads.com).
//
// Usage:
//   node deploy-9amwebsite.js            -> zip + upload 9amwebsite -> Netlify, wait until ready
//   node deploy-9amwebsite.js --check    -> verify the Netlify token + site are reachable (no deploy)
//   node deploy-9amwebsite.js --draft    -> create a draft deploy (visible at preview URL, NOT live)
//
// Requires: NETLIFY_AUTH_TOKEN + the site id below (read from .env NETLIFY_AUTH_TOKEN).
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { execSync } = require('child_process');

const SITE_ID = 'ecdfca23-68e0-476b-a93d-7efb21b1f3c7'; // lucent-lolly-e82191 (www.9amleads.com)
const SITE_FOLDER = path.join(__dirname, '9amwebsite');
const EXCLUDE = /node_modules|\.netlify|Screenshots 1|\\\.git/;

function loadToken() {
  const envFile = path.join(__dirname, '.env');
  try {
    const txt = fs.readFileSync(envFile, 'utf-8');
    const m = txt.match(/^NETLIFY_AUTH_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch (e) {}
  return process.env.NETLIFY_AUTH_TOKEN || '';
}

function req(method, urlPath, body, headers) {
  return new Promise((resolve) => {
    const r = https.request({
      hostname: 'api.netlify.com', path: urlPath, method,
      headers: Object.assign({ Authorization: 'Bearer ' + token, Accept: 'application/json' }, headers || {})
    }, (resp) => {
      const chunks = [];
      resp.on('data', (c) => chunks.push(c));
      resp.on('end', () => resolve({ s: resp.statusCode, b: Buffer.concat(chunks).toString('utf-8') }));
    });
    r.on('error', (e) => resolve({ s: 0, b: String(e) }));
    if (body) r.write(body);
    r.end();
  });
}

const args = process.argv.slice(2);
const mode = args.indexOf('--draft') > -1 ? 'draft' : (args.indexOf('--check') > -1 ? 'check' : 'deploy');
const token = loadToken();

if (!token) { console.error('ERROR: NETLIFY_AUTH_TOKEN not found (add to .env or env)'); process.exit(1); }

(async () => {
  // 1. Verify connectivity + site
  const site = await req('GET', '/api/v1/sites/' + SITE_ID);
  let siteJson = null;
  try { siteJson = JSON.parse(site.b); } catch (e) {}
  if (site.s !== 200 || !siteJson) { console.error('ERROR: cannot reach Netlify site (HTTP ' + site.s + ')', site.b.slice(0, 200)); process.exit(1); }
  console.log('Netlify site OK:', siteJson.name, '|', siteJson.ssl_url || siteJson.url);

  if (mode === 'check') { console.log('--check passed (no deploy). Token + site reachable.'); process.exit(0); }

  // 2. Build the file digest (path -> sha1) for everything in 9amwebsite
  const files = {};
  function walk(dir, base) {
    for (const name of fs.readdirSync(dir)) {
      if (EXCLUDE.test(name)) continue;
      const p = path.join(dir, name);
      const rel = (base + '/' + name).replace(/\\/g, '/');
      if (fs.statSync(p).isDirectory()) walk(p, rel);
      else files[rel] = sha1(p);
    }
  }
  function sha1(p) {
    // Node >= 12.17
    const { createHash } = require('crypto');
    return createHash('sha1').update(fs.readFileSync(p)).digest('hex');
  }
  if (!fs.existsSync(SITE_FOLDER)) { console.error('ERROR: folder not found:', SITE_FOLDER); process.exit(1); }
  walk(SITE_FOLDER, '');
  console.log('Files to deploy:', Object.keys(files).length);

  // 3. Create the deploy (digest). Netlify tells us which files it already has.
  const body = JSON.stringify({ files: files, draft: mode === 'draft' });
  const created = await req('POST', '/api/v1/sites/' + SITE_ID + '/deploys', body, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  let dep = null;
  try { dep = JSON.parse(created.b); } catch (e) {}
  if (created.s !== 200 && created.s !== 201 || !dep || !dep.id) { console.error('ERROR creating deploy (HTTP ' + created.s + ')', created.b.slice(0, 400)); process.exit(1); }
  console.log('Deploy created:', dep.id, 'state=' + dep.state, mode === 'draft' ? '(DRAFT - not live)' : '');

  // 4. Upload only the files Netlify still needs. The `required` list contains SHA1
  //    hashes; map each back to its path via the digest map, then upload by path.
  const hashToPath = {};
  Object.keys(files).forEach((rel) => { hashToPath[files[rel]] = rel; });
  const required = dep.required || [];
  let up = 0;
  for (const hash of required) {
    const rel = hashToPath[hash];
    if (!rel) { console.error('WARN: required hash not in local digest:', hash); continue; }
    const src = path.join(SITE_FOLDER, rel.split('/').join(path.sep));
    if (!fs.existsSync(src)) { console.error('WARN: required file missing locally:', rel); continue; }
    const enc = encodeURIComponent(rel).replace(/%2F/g, '/');
    const buf = fs.readFileSync(src);
    const u = await req('PUT', '/api/v1/deploys/' + dep.id + '/files/' + enc, buf, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length });
    if (u.s !== 200) { console.error('WARN upload failed for', rel, 'HTTP', u.s); }
    else up++;
  }
  console.log('Uploaded', up, 'of', required.length, 'required files');

  // 5. Poll until ready
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const got = await req('GET', '/api/v1/deploys/' + dep.id);
    let g = null;
    try { g = JSON.parse(got.b); } catch (e) {}
    if (g && g.state === 'ready') {
      console.log('DEPLOY LIVE:', g.deploy_url || ('https://' + siteJson.name + '.netlify.app'));
      console.log('Production:', siteJson.ssl_url || siteJson.url);
      process.exit(0);
    }
    if (g && (g.state === 'error' || g.state === 'failed')) { console.error('Deploy failed state:', g.state, (g.error_message || '').slice(0, 300)); process.exit(1); }
  }
  console.error('Timed out waiting for deploy to become ready. Check Netlify dashboard.');
  process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
