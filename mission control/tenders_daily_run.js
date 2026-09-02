// Tenders daily run — executed by GitHub Actions (free tier) every weekday.
// Contracts Finder / Find a Tender intermittently block Render's datacenter IP but
// NOT GitHub Actions' IPs, so this job scrapes the UK's public tender notices from
// Actions and imports them into Render's tenders pool before the 9am delivery.
require('dotenv').config();
const https = require('https');
const sc = require('./tenders_scraper.js');

async function main() {
  console.log('[TENDERS-DAILY] starting ' + new Date().toISOString());
  let leads = [];
  for (var attempt = 1; attempt <= 4 && leads.length === 0; attempt++) {
    try {
      leads = await sc.collectTendersLeads({ maxCount: 800 });
    } catch (e) { console.log('[TENDERS-DAILY] scrape error (attempt ' + attempt + '): ' + e.message); }
    if (leads.length === 0 && attempt < 4) {
      console.log('[TENDERS-DAILY] empty on attempt ' + attempt + ', waiting ' + (attempt * 20) + 's...');
      await new Promise(function(r) { setTimeout(r, attempt * 20000); });
    }
  }
  console.log('[TENDERS-DAILY] collected ' + (leads || []).length + ' tenders');
  if (!leads || !leads.length) { console.log('[TENDERS-DAILY] nothing to import'); return; }
  // Ensure fresh + a stable id so the pool dedup works.
  const nowIso = new Date().toISOString();
  leads.forEach(function(l, i) { l.scrapedAt = nowIso; l.firstVisibleDate = nowIso; if (!l.id) l.id = 'TEND_' + Date.now() + '_' + i; });
  const body = JSON.stringify({ product: 'tenders', leads: leads });
  const key = process.env.ADMIN_PASSWORD;
  const host = process.env.RENDER_HOST || 'nineamleads-backend.onrender.com';
  const result = await new Promise(function(resolve) {
    const req = https.request({ hostname: host, path: '/api/admin/pool/import', method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 90000 }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() { resolve({ code: res.statusCode, body: d }); });
    });
    req.on('error', function(e) { resolve({ code: 0, body: e.message }); });
    req.setTimeout(90000, function() { req.destroy(); resolve({ code: 0, body: 'timeout' }); });
    req.write(body); req.end();
  });
  console.log('[TENDERS-DAILY] import HTTP ' + result.code + ': ' + String(result.body || '').substring(0, 250));
  if (result.code !== 200) process.exit(2);
}
main().catch(function(e) { console.error('[TENDERS-DAILY] ERR ' + e.message); process.exit(1); });
