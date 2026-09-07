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
  // FRESHNESS = the notice's REAL publication date, NOT our scrape time. Contracts
  // Finder keeps months/years-old standing notices (DPS frameworks, renewals) in
  // its live results; stamping every lead's firstVisibleDate="now" made those old
  // notices look "fresh today" and get delivered to 24/48h subscribers. The pool
  // import honours sourceListedDate and the delivery freshness gate rejects
  // anything older than the cutoff (48h, or Friday-9am UK on a Monday).
  const nowIso = new Date().toISOString();
  function realPubDate(l) {
    // publishedDate arrives as a display string like "31 May 2023" or an ISO date.
    var raw = String(l.publishedDate || l.publicationDate || l.datePublished || '').trim();
    if (!raw) return '';
    var iso = (/^\d{4}-\d{2}-\d{2}/.test(raw)) ? raw : null;
    if (!iso) {
      var m = raw.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
      if (m) {
        var months = { january:0, february:1, march:2, april:3, may:4, june:5, july:6, august:7, september:8, october:9, november:10, december:11, jan:0, feb:1, mar:2, apr:3, jun:5, jul:6, aug:7, sep:8, oct:9, nov:10, dec:11 };
        var mon = months[String(m[2]).toLowerCase()];
        if (mon !== undefined) { var d = new Date(Date.UTC(parseInt(m[3],10), mon, parseInt(m[1],10))); if (!isNaN(d.getTime())) iso = d.toISOString(); }
      }
    }
    return iso || '';
  }
  leads.forEach(function(l, i) {
    l.scrapedAt = nowIso;
    var realPub = realPubDate(l);
    // Only fall back to "now" when the source gives NO publication date at all.
    l.firstVisibleDate = realPub || nowIso;
    l.sourceListedDate = l.firstVisibleDate;
    if (!l.id) l.id = 'TEND_' + Date.now() + '_' + i;
  });
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
