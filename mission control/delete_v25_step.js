// delete_v25_step.js <step>  - deletes all Brevo drafts named "<x> Buyers - Demo <step> - ..."
// Waits out Brevo's rate limit automatically. Usage: node delete_v25_step.js 2
const https = require('https');
const fs = require('fs');

const ENV = fs.readFileSync('C:/Users/ketzm/.env', 'utf8');
const KEY = (ENV.split(/\r?\n/).find(l => l.startsWith('BREVO_API_KEY=')) || '').replace('BREVO_API_KEY=', '').trim();
const STEP = process.argv[2];
if (!STEP) { console.log('Usage: node delete_v25_step.js <step>'); process.exit(1); }

function req(method, urlPath, body) {
  return new Promise(r => {
    const d = body ? JSON.stringify(body) : '';
    const o = { hostname: 'api.brevo.com', path: urlPath, method, headers: { 'api-key': KEY, accept: 'application/json' }, timeout: 45000 };
    if (d) { o.headers['content-type'] = 'application/json'; o.headers['content-length'] = Buffer.byteLength(d); }
    const q = https.request(o, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ s: res.statusCode, b })); });
    q.on('error', e => r({ s: 0, b: String(e) }));
    if (d) q.write(d); q.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withRetry(fn, label, log) {
  for (let a = 0; a < 80; a++) {
    const r = await fn();
    if (r.s >= 200 && r.s < 300) return r;
    if (r.s === 429 || r.s === 0) { log('  [rate-limit] ' + label + ' waiting 60s...'); await sleep(60000); continue; }
    return r;
  }
  return { s: 0, b: 'gave up' };
}

(async () => {
  const log = (m) => console.log(new Date().toISOString().slice(11, 19) + ' ' + m);
  let all = [];
  for (const off of [0, 100, 200]) {
    const r = await withRetry(() => req('GET', '/v3/emailCampaigns?limit=100&offset=' + off), 'list ' + off, log);
    try { all = all.concat((JSON.parse(r.b).campaigns || [])); } catch (e) { log('list ' + off + ' failed ' + r.s); }
  }
  const re = new RegExp(' Buyers - Demo ' + STEP + ' - ');
  const targets = all.filter(c => re.test(c.name));
  log('campaigns loaded: ' + all.length + ' | matching Demo ' + STEP + ': ' + targets.length);
  for (const c of targets) {
    const r = await withRetry(() => req('DELETE', '/v3/emailCampaigns/' + c.id), c.name, log);
    log((r.s >= 200 && r.s < 300 ? 'DELETED ' : 'DELETE FAILED ' + r.s + ' ') + c.name);
    await sleep(800);
  }
  log('DONE');
})();
