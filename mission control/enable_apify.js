// ==========================================================
// ENABLE APIFY SCRAPERS (CHEAP ONLY)
// Run: node enable_apify.js
//
// Only enables CHEAP Apify actors. Expensive actors remain
// on free Companies House to control costs.
//
// Cheap: Rightmove (~$50/mo flat), Gazette Probate (~$0.15/mo)
// Free: Companies House for Planning, NewBiz, Tenders
// EXPENSIVE: REMOVED - UK Planning Monitor, Contracts Finder
// ==========================================================

var fs = require('fs');
var f = __dirname + '/production_api_server.js';
var c = fs.readFileSync(f, 'utf8');
var MAX = 5, MEM = 256;

// ===== MOVING (Rightmove - flat $50/mo) =====
var movingBlock = `
        } else if (product === 'moving') {
          try { var k = process.env.APIFY_API_KEY; leads = []; if (k) {
            leads = await new Promise(function(r) {
              var b = JSON.stringify({ location: 'London', maxResults: ${MAX}, radius: 100 });
              var req = require('https').request({ hostname: 'api.apify.com', method: 'POST', path: '/v2/acts/jKpgGfgRfzrGgEMa8/run-sync-get-dataset-items?token=' + k + '&memory=${MEM}&timeout=60', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), 'Accept': 'application/json' }, timeout: 90000 }, function(res) {
                var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                  try { var items = JSON.parse(body); if (!Array.isArray(items)) { r([]); return; }
                    r(items.map(function(p) { return { id: 'RM_' + (p.id || Date.now()), title: p.title || '', address: p.displayAddress || p.address || '', price: p.price || 0, bedrooms: p.bedrooms || 0, listingStatus: p.status || (p.soldDate ? 'SSTC' : 'Available'), url: p.url || '', source: 'Rightmove', scrapedAt: new Date().toISOString() }; }));
                  } catch(e) { r([]); }
                });
              });
              req.on('error', function() { r([]); }); req.setTimeout(90000, function() { req.destroy(); r([]); });
              req.write(b); req.end();
            });
            if (leads && leads.length > 0) console.log('[SCRAPER] Rightmove returned ' + leads.length);
            else { console.log('[SCRAPER] Rightmove 0, using CH fallback');
              var ck = process.env.COMPANIES_HOUSE_API_KEY || '8e6cae34-073b-4451-b4c8-e0b463ca4b21';
              leads = await new Promise(function(r) {
                var req = require('https').request({ hostname: 'api.company-information.service.gov.uk', path: '/search/companies?q=removals&size=30', method: 'GET', headers: { 'Authorization': 'Basic ' + Buffer.from(ck + ':').toString('base64'), 'Accept': 'application/json' } }, function(res) {
                  var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                    try { var d = JSON.parse(body); var items = d.items || []; r(items.filter(function(x){return x.title && x.company_number}).map(function(x) { var a = x.address || {}; return { id: 'CHMV_' + (x.company_number || Date.now()), name: (x.title || '').trim(), address: [a.address_line_1 || '', a.address_line_2 || '', a.locality || '', a.postal_code || ''].filter(Boolean).join(', '), source: 'CH Fallback', scrapedAt: new Date().toISOString() }; })); } catch(e) { r([]); }
                  });
                });
                req.on('error', function() { r([]); }); req.setTimeout(15000, function() { req.destroy(); r([]); }); req.end();
              });
              console.log('[SCRAPER] CH fallback ' + leads.length);
            }
          } catch(e) { console.log('[SCRAPER] Moving error:', e.message); leads = []; }
        `;

// ===== PROBATE (UK Gazette - cheap per-record) =====
var probateBlock = `
        } else if (product === 'probate') {
          try { var k = process.env.APIFY_API_KEY; leads = []; if (k) {
            leads = await new Promise(function(r) {
              var b = JSON.stringify({ sp_intended_usage: 'personal', sp_improvement_suggestions: 'testing', maxResults: ${MAX} });
              var req = require('https').request({ hostname: 'api.apify.com', method: 'POST', path: '/v2/acts/rcfzPm2dJk9vig8hp/run-sync-get-dataset-items?token=' + k + '&memory=${MEM}&timeout=60', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), 'Accept': 'application/json' }, timeout: 90000 }, function(res) {
                var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                  try { var items = JSON.parse(body); if (!Array.isArray(items)) { r([]); return; }
                    r(items.map(function(p) { return { id: 'PROB_' + (p.notice_id || Date.now()), name: p.decedent_name || '', deceasedName: p.decedent_name || '', address: p.decedent_address || '', postcode: (p.decedent_address || '').split(',').pop().trim(), estateValue: p.estate_value || '', dateOfDeath: p.decedent_dod || '', noticeUrl: p.notice_url || '', source: 'Gazette Probate', scrapedAt: new Date().toISOString() }; }));
                  } catch(e) { r([]); }
                });
              });
              req.on('error', function() { r([]); }); req.setTimeout(90000, function() { req.destroy(); r([]); });
              req.write(b); req.end();
            });
            if (leads && leads.length > 0) console.log('[SCRAPER] Probate returned ' + leads.length);
            else { console.log('[SCRAPER] Probate 0'); leads = []; }
          } catch(e) { console.log('[SCRAPER] Probate error:', e.message); leads = []; }
        `;

// ===== REPLACE =====
// Only replace Moving and Probate with Apify.
// Planning stays on Companies House Builders (free).
// Tenders stays on Companies House Contractors (free).
// New Business stays on Companies House (free).

function doReplace(startMarker, endMarker, block) {
  var s = c.indexOf(startMarker);
  var e = c.indexOf(endMarker, s + 5);
  if (s === -1 || e === -1) { console.log('❌ Markers not found:', startMarker.substring(0, 40)); process.exit(1); }
  c = c.substring(0, s) + block.trim() + c.substring(e);
  console.log('  ✅ ' + startMarker.match(/'([^']+)'/)[1]);
}

console.log('Replacing scrapers with CHEAP Apify actors only...');
doReplace("} else if (product === 'moving') {",  "} else if (product === 'probate') {",  movingBlock);
doReplace("} else if (product === 'probate') {", "fs.writeFileSync(path.join(DATA_DIR, config.file), JSON.stringify(leads, null, 2));", probateBlock);
console.log('  ✅ planning (kept free Companies House)');
console.log('  ✅ tenders (kept free Companies House)');
console.log('  ✅ newbusiness (kept free Companies House)');

fs.writeFileSync(f, c);
try { require('child_process').execSync('node --check "' + f + '"', { stdio: 'pipe' }); console.log('\n✅ Installed! Cost estimate:'); console.log('   Rightmove: ~$50/month flat (if you want property data)'); console.log('   Gazette Probate: ~$0.15/month (per-record)'); console.log('   Planning/Tenders/NewBiz: $0 (free Companies House)'); } catch(e) { console.log('❌', e.stderr.toString()); }
