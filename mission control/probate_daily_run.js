// Probate daily run — executed by GitHub Actions (free tier) every weekday.
// The Gazette blocks Render's datacenter IP (HTTP 403) but NOT GitHub Actions' IPs,
// so this job scrapes the REAL UK Gazette probate notices from Actions and imports
// them into Render's probate pool before the 9am delivery. Uses executor capture +
// home/solicitor classification from the enhanced scraper.
require('dotenv').config();
const https = require('https');
const sc = require('./probate_leads_scraper.js');

async function main() {
  console.log('[PROBATE-DAILY] starting ' + new Date().toISOString());
  let leads = [];
  // RETRY LOOP: the Gazette WAF intermittently 403s datacenter IPs (Render, GitHub
  // Actions). Retry with backoff a few times — a pause often clears the block.
  for (var attempt = 1; attempt <= 4 && leads.length === 0; attempt++) {
    try {
      leads = await sc.collectProbateLeads({ maxItems: 60, useApifyFirst: false });
    } catch (e) { console.log('[PROBATE-DAILY] scrape error (attempt ' + attempt + '): ' + e.message); }
    if (leads.length === 0 && attempt < 4) {
      console.log('[PROBATE-DAILY] empty on attempt ' + attempt + ', waiting ' + (attempt * 20) + 's before retry...');
      await new Promise(function(r) { setTimeout(r, attempt * 20000); });
    }
  }
  console.log('[PROBATE-DAILY] collected ' + (leads || []).length + ' probate leads');
  let home = 0, sol = 0, withPc = 0, withName = 0;
  (leads || []).forEach(function(l) {
    if (l.executorType === 'home') home++;
    if (l.executorType === 'solicitor') sol++;
    if (l.executorName) withName++;
    if (/^[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}$/i.test(String(l.postcode || ''))) withPc++;
  });
  console.log('[PROBATE-DAILY] stats: executor_home=' + home + ' via_solicitor=' + sol + ' with_postcode=' + withPc);
  // PRODUCT RULE: probate leads must be EXECUTOR-DIRECT (the executor applied in
  // person and their HOME address is published) so the customer writes straight to
  // the executor. Solicitor-routed notices are DROPPED — never imported.
  var homeOnly = (leads || []).filter(function(l) { return l.executorType === 'home'; });
  console.log('[PROBATE-DAILY] executor-home leads only: ' + homeOnly.length + ' (dropped ' + (leads.length - homeOnly.length) + ' solicitor/no-executor)');
  if (!homeOnly.length) { console.log('[PROBATE-DAILY] no executor-home leads today'); return; }
  const body = JSON.stringify({ product: 'probate', leads: homeOnly });
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
  console.log('[PROBATE-DAILY] import HTTP ' + result.code + ': ' + String(result.body || '').substring(0, 250));
  if (result.code !== 200) process.exit(2);
}
main().catch(function(e) { console.error('[PROBATE-DAILY] ERR ' + e.message); process.exit(1); });
