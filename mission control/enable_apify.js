// RUN: node enable_apify.js
// TEST: maxResults=5, ~$0.03/day. PRODUCTION: edit MAX=1000 below.

var fs = require('fs'), f = __dirname + '/production_api_server.js', c = fs.readFileSync(f, 'utf8');
var MAX = 5, MEM = 256;

// ===== BLOCKS (same structure for each) =====
function makeBlock(name, actor, inputObj, mapFn) {
  var inputJSON = JSON.stringify(inputObj);
  return `\n        } else if (product === '${name}') {
          try { var k = process.env.APIFY_API_KEY; leads = []; if (k) {
            leads = await new Promise(function(r) {
              var b = ${inputJSON};
              var req = require('https').request({ hostname: 'api.apify.com', method: 'POST', path: '/v2/acts/${actor}/run-sync-get-dataset-items?token=' + k + '&memory=${MEM}&timeout=60', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(b), 'Accept': 'application/json' }, timeout: 90000 }, function(res) {
                var body = ''; res.on('data', function(c) { body += c; }); res.on('end', function() {
                  try { var items = JSON.parse(body); if (!Array.isArray(items)) { r([]); return; }
                    r(items.map(function(p,i) { return ${mapFn}; }));
                  } catch(e) { r([]); }
                });
              });
              req.on('error', function() { r([]); }); req.setTimeout(90000, function() { req.destroy(); r([]); });
              req.write(b); req.end();
            });
            if (leads && leads.length > 0) console.log('[SCRAPER] ${name} returned ' + leads.length);
            else { console.log('[SCRAPER] ${name} 0'); leads = []; }
          } catch(e) { console.log('[SCRAPER] ${name} error:', e.message); leads = []; }
        `;
}

var B = {
  moving: makeBlock('moving', 'jKpgGfgRfzrGgEMa8', { location: 'London', maxResults: MAX, radius: 100 },
    "{ id: 'RM_' + (p.id || Date.now()), title: p.title || '', address: p.displayAddress || p.address || '', price: p.price || 0, bedrooms: p.bedrooms || 0, listingStatus: p.status || (p.soldDate ? 'SSTC' : 'Available'), url: p.url || '', source: 'Rightmove', scrapedAt: new Date().toISOString() }"),
  planning: makeBlock('planning', 'rwURYayTtJ7mv9jFr', { location: 'UK', maxResults: MAX },
    "{ id: 'PLAN_' + (p.applicationRef || Date.now()), address: (p.address || '').trim(), postcode: p.postcode || '', description: p.proposal || p.description || '', council: p.councilName || p.council || '', applicationRef: p.applicationRef || '', applicationType: p.applicationType || 'Planning', status: p.status || '', source: 'UK Planning Apps', scrapedAt: new Date().toISOString() }"),
  probate: makeBlock('probate', 'rcfzPm2dJk9vig8hp', { sp_intended_usage: 'personal', sp_improvement_suggestions: 'testing', maxResults: MAX },
    "{ id: 'PROB_' + (p.notice_id || Date.now()), name: p.decedent_name || '', deceasedName: p.decedent_name || '', address: p.decedent_address || '', postcode: (p.decedent_address || '').split(',').pop().trim(), estateValue: p.estate_value || '', dateOfDeath: p.decedent_dod || '', noticeUrl: p.notice_url || '', source: 'Gazette Probate', scrapedAt: new Date().toISOString() }"),
  tenders: makeBlock('tenders', 'IDHZwbIUCGhlAGWbA', { maxResults: MAX },
    "{ id: 'CF_' + (t.noticeIdentifier || Date.now()), title: t.title || '', buyer: t.organisationName || t.buyerName || '', contractValue: t.valueHigh || t.valueLow || t.awardedValue || 0, description: (t.description || '').substring(0, 500), closingDate: t.closingDate || '', publishedDate: t.publishedDate || '', tenderNoticeId: t.noticeIdentifier || '', source: 'Contracts Finder', scrapedAt: new Date().toISOString() }")
};

// ===== REPLACE =====
// Each product appears ONCE in the scraper section (after newbusiness, before else {}).
// Find each by its unique start marker and its following product's start.

var pEnd = c.lastIndexOf("fs.writeFileSync(path.join(DATA_DIR, config.file), JSON.stringify(leads, null, 2));");
if (pEnd === -1) { console.log('❌ Cannot find save line'); process.exit(1); }

// Position markers (computed ONCE from original file)
var prods = ['tenders', 'planning', 'moving', 'probate'];
var next = { tenders: 'planning', planning: 'moving', moving: 'probate', probate: pEnd };
var pos = {};

for (var i = 0; i < prods.length; i++) {
  var p = prods[i];
  var start = 'product === \'' + p + '\')';
  var s = c.lastIndexOf(start, pEnd);
  if (s === -1) { console.log('❌ ' + p + ' start not found'); process.exit(1); }
  // Find the actual ELSE IF line start (go back to the }
  var s2 = c.lastIndexOf('\n', s - 5);
  s2 = c.lastIndexOf('\n', s2 - 1) + 1;
  // End marker: next product's ELSE IF
  var n = next[p];
  var e = typeof n === 'number' ? n : c.lastIndexOf('\n        } else if (product === \'' + n + '\') {', pEnd);
  if (e === -1) { console.log('❌ ' + p + ' end not found (' + n + ')'); process.exit(1); }
  pos[p] = { start: s2, end: e };
}

// Replace (all positions computed, now modify)
var parts = [];
var lastEnd = 0;
for (var i = 0; i < prods.length; i++) {
  var p = prods[i];
  parts.push(c.substring(lastEnd, pos[p].start));
  parts.push(B[p]);
  lastEnd = pos[p].end;
}
parts.push(c.substring(lastEnd));
c = parts.join('');

fs.writeFileSync(f, c);
try { require('child_process').execSync('node --check "' + f + '"', { stdio: 'pipe' }); console.log('✅ All Apify scrapers installed! maxResults=' + MAX + ' MB=' + MEM); } catch(e) { console.log('❌', e.stderr.toString()); }
