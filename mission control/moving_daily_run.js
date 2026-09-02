// Moving daily run — executed by GitHub Actions (free tier) every weekday.
// Rightmove blocks Render's datacenter IP but NOT GitHub Actions' IPs, so this job
// scrapes Rightmove for fresh properties in the moving customers' postcode areas
// (plus a broad national default) and imports them into Render's moving pool,
// topping up OnTheMarket's automated supply at no cost.
require('dotenv').config();
const https = require('https');
const rm = require('./rightmove_scraper_v2.js');

function apiGet(path) {
  return new Promise(function(resolve) {
    const req = https.request({ hostname: 'nineamleads-backend.onrender.com', path: path, method: 'GET', headers: { 'Authorization': 'Bearer ' + process.env.ADMIN_PASSWORD, 'User-Agent': '9amLeads-daily' }, timeout: 40000 }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() { try { resolve(JSON.parse(d)); } catch (e) { resolve(null); } });
    });
    req.on('error', function() { resolve(null); }); req.setTimeout(40000, function() { req.destroy(); resolve(null); }); req.end();
  });
}
function apiPost(path, obj) {
  return new Promise(function(resolve) {
    const body = JSON.stringify(obj);
    const req = https.request({ hostname: 'nineamleads-backend.onrender.com', path: path, method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.ADMIN_PASSWORD, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: 90000 }, function(res) {
      let d = ''; res.on('data', function(c) { d += c; }); res.on('end', function() { resolve({ code: res.statusCode, body: d }); });
    });
    req.on('error', function(e) { resolve({ code: 0, body: e.message }); }); req.setTimeout(90000, function() { req.destroy(); resolve({ code: 0, body: 'timeout' }); }); req.write(body); req.end();
  });
}

async function main() {
  console.log('[MOVING-DAILY] starting ' + new Date().toISOString());
  // 1. Gather the postcode AREAS of active moving customers (delivery is area-filtered).
  var areas = ['L', 'WA', 'CH', 'WN', 'PR', 'E', 'IG', 'RM', 'DA', 'CM', 'CR', 'SW', 'SE', 'KT', 'SM', 'N', 'NW', 'HA', 'EN', 'UB', 'TW', 'BR', 'B', 'M', 'SK', 'OL', 'BL', 'WN', 'WA'];
  try {
    var cust = await apiGet('/api/admin/customers?limit=1000');
    var movingCusts = (cust && cust.customers || []).filter(function(c) { return c.product === 'moving'; });
    movingCusts.forEach(function(c) {
      var ca = [];
      try { ca = JSON.parse(c.target_areas || '[]'); } catch (e) { ca = []; }
      ca.forEach(function(a) { var k = String(a).toUpperCase().replace(/\s+/g, '').trim(); if (k && /^[A-Z]{1,2}$/.test(k) && areas.indexOf(k) === -1) areas.push(k); });
    });
    console.log('[MOVING-DAILY] moving customer areas: ' + movingCusts.map(function(c){return c.email;}).join(',') + ' -> ' + areas.join(','));
  } catch (e) { console.log('[MOVING-DAILY] area fetch note: ' + e.message); }
  // 2. Scrape Rightmove (retry once for the WAF).
  var leads = [];
  for (var attempt = 1; attempt <= 3 && leads.length === 0; attempt++) {
    try {
      leads = await rm.collectMovingLeads({ areas: areas, residential: true, maxProperties: 500, allowCommercial: false });
    } catch (e) { console.log('[MOVING-DAILY] scrape error (attempt ' + attempt + '): ' + e.message); }
    if (leads.length === 0 && attempt < 3) { console.log('[MOVING-DAILY] empty, waiting ' + (attempt * 20) + 's...'); await new Promise(function(r) { setTimeout(r, attempt * 20000); }); }
  }
  console.log('[MOVING-DAILY] scraped ' + (leads || []).length + ' properties');
  if (!leads || !leads.length) { console.log('[MOVING-DAILY] nothing to import'); return; }
  var withPc = leads.filter(function(l) { return /^[A-Z]{1,2}[0-9]/.test(String(l.postcode || l.address || '')); }).length;
  console.log('[MOVING-DAILY] with postcode: ' + withPc);
  // 3. Import into the moving pool (pool/import forces freshness + dedup by id).
  var result = await apiPost('/api/admin/pool/import', { product: 'moving', leads: leads });
  console.log('[MOVING-DAILY] import HTTP ' + result.code + ': ' + String(result.body || '').substring(0, 250));
  if (result.code !== 200) process.exit(2);
}
main().catch(function(e) { console.error('[MOVING-DAILY] ERR ' + e.message); process.exit(1); });
