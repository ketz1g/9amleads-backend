// ===== AREA-TARGETED MOVING SCRAPE WORKER (Apify residential) =====
// Scrapes Rightmove via Apify's residential proxy, ONLY for postcode areas where
// we have active customer accounts. This bypasses the datacenter-IP blocking that
// stops direct deep scraping, and keeps cost low because we only ever scrape the
// areas we actually sell. Cost scales with the number of account areas.
//
// Usage:
//   node scrape_moving_deep.js            # scrape all active-account areas
//   node scrape_moving_deep.js EN,HA,LU   # force specific areas
//   node scrape_moving_deep.js EN,HA,LU 8 # 8 maxProperties per area

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = (function() {
  var d = process.env.DATA_DIR || path.join(__dirname, 'data');
  if (!fs.existsSync(d)) {
    var alt = path.join(__dirname, '..', 'mission control', 'data');
    if (fs.existsSync(alt)) d = alt;
  }
  return d;
})();
const DB_FILE = path.join(DATA_DIR, 'database.json');
const POOL_FILE = path.join(DATA_DIR, 'moving-leads.json');
const LAST_SCRAPE_FILE = path.join(DATA_DIR, 'last-scrape.json');
const APIFY_KEY = process.env.APIFY_API_KEY || '';

// Rightmove OUTCODE identifiers for postcode areas. Only include areas we have
// accounts for — the worker filters to these. Add new area IDs here as customers
// subscribe to new postcodes (cheap + scales slowly).
const AREA_OUTCODE = {
  // EN/HA/LU removed — their Rightmove outcode IDs are resolved dynamically via
  // typeahead (the hardcoded guesses returned 0 leads). Other areas keep their IDs.
  'E': 93917, 'N': 93917, 'NW': 93961,
  'SE': 93917, 'SW': 93917, 'W': 93917, 'EC': 93917, 'WC': 93917,
  'B': 94028, 'M': 94019, 'L': 94022, 'S': 94124, 'NE': 94100, 'BS': 93920,
  'CR': 93922, 'KT': 93933, 'TW': 93950, 'UB': 93952, 'IG': 93928, 'RM': 93943,
  'WD': 93957, 'AL': 93913, 'SG': 93946, 'CM': 93921, 'SS': 93947, 'CO': 93923,
  'BR': 93916, 'DA': 93924, 'TN': 93951, 'ME': 93937, 'CT': 93923, 'RH': 93944,
  'GU': 93927, 'SL': 93945, 'HP': 93929, 'MK': 93939, 'OX': 93941, 'BN': 93915,
  'PO': 93942, 'SO': 93948, 'SP': 93949, 'RG': 93943, 'BA': 93914, 'BS': 93920,
  'GL': 93926, 'SN': 93948, 'TA': 93950, 'DT': 93925, 'BH': 93915, 'EX': 93926,
  'PL': 93942, 'TQ': 93952, 'TR': 93953, 'CV': 93923, 'DY': 93925, 'WS': 93956,
  'WV': 93957, 'WR': 93958, 'ST': 93949, 'SY': 93950, 'TF': 93951, 'HR': 93930,
  'DE': 93925, 'NG': 93940, 'LE': 93934, 'LN': 93935, 'NN': 93940, 'DN': 93925,
  'M': 94019, 'L': 94022, 'BL': 94016, 'OL': 94041, 'SK': 94047, 'WA': 94055,
  'WN': 94057, 'CH': 94018, 'CW': 94020, 'PR': 94043, 'BB': 94015, 'FY': 94027,
  'LA': 94033, 'CA': 94017, 'LS': 94034, 'WF': 94056, 'HD': 94029, 'BD': 94015,
  'HX': 94031, 'HU': 94032, 'YO': 94058, 'S': 94124, 'HG': 94030, 'NE': 94100,
  'SR': 94121, 'DH': 94024, 'DL': 94023, 'TS': 94122, 'TD': 94051, 'G': 94104,
  'EH': 94025, 'FK': 94026, 'PA': 94107, 'ML': 94106, 'KA': 94105, 'KY': 94103,
  'DD': 94102, 'AB': 94101, 'PH': 94108, 'IV': 94105, 'KW': 94104, 'DG': 94103,
  'CF': 94021, 'NP': 94107, 'SA': 94108, 'LD': 94032, 'LL': 94035, 'BT': 94100
};

function loadJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); } catch(e) { return null; }
}
// Capture ALL console.log into the log file (incl. the per-area scrape logs).
var __logLines = [];
var __origLog = console.log;
console.log = function() {
  try { var m = [].slice.call(arguments).join(' '); __logLines.push('[' + new Date().toISOString() + '] ' + m); } catch(e) {}
  __origLog.apply(console, arguments);
};
function extractPostcodeArea(postcode) {
  if (!postcode) return '';
  var s = String(postcode).toUpperCase().trim();
  var m = s.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/);
  if (m) s = m[0];
  var out = s.replace(/[^A-Z].*$/, '');
  return out.length >= 1 && out.length <= 4 ? out : '';
}

// Resolve the correct Rightmove OUTCODE id for a postcode area by scraping
// Rightmove's typeahead for a representative town via the actor. Returns {id,url}
// or null. This solves the "wrong outcode id -> 0 leads" problem.
var AREA_TOWN = { 'EN':'Enfield', 'HA':'Harrow', 'LU':'Luton', 'E':'London', 'N':'London', 'NW':'London', 'SE':'London', 'SW':'London', 'W':'London', 'EC':'London', 'WC':'London', 'B':'Birmingham', 'M':'Manchester', 'L':'Liverpool', 'S':'Sheffield', 'NE':'Newcastle', 'BS':'Bristol', 'CR':'Croydon', 'KT':'Kingston', 'TW':'Twickenham', 'UB':'Uxbridge', 'IG':'Ilford', 'RM':'Romford', 'WD':'Watford', 'AL':'St Albans', 'SG':'Stevenage', 'CM':'Chelmsford', 'SS':'Southend', 'CO':'Colchester', 'BR':'Bromley', 'DA':'Dartford', 'TN':'Tunbridge Wells', 'ME':'Maidstone', 'RH':'Redhill', 'GU':'Guildford', 'SL':'Slough', 'HP':'High Wycombe', 'MK':'Milton Keynes', 'OX':'Oxford', 'BN':'Brighton', 'PO':'Portsmouth', 'SO':'Southampton', 'RG':'Reading', 'BA':'Bath', 'GL':'Gloucester', 'EX':'Exeter', 'PL':'Plymouth', 'TQ':'Torquay', 'CV':'Coventry', 'ST':'Stoke', 'DE':'Derby', 'NG':'Nottingham', 'LE':'Leicester', 'LN':'Lincoln', 'NN':'Northampton', 'DN':'Doncaster', 'BL':'Bolton', 'OL':'Oldham', 'SK':'Stockport', 'WA':'Warrington', 'CH':'Chester', 'PR':'Preston', 'BB':'Blackburn', 'LA':'Lancaster', 'LS':'Leeds', 'WF':'Wakefield', 'HD':'Huddersfield', 'BD':'Bradford', 'HU':'Hull', 'YO':'York', 'HG':'Harrogate', 'SR':'Sunderland', 'DH':'Durham', 'DL':'Darlington', 'TS':'Teesside', 'G':'Glasgow', 'EH':'Edinburgh', 'PA':'Paisley', 'FK':'Falkirk', 'ML':'Motherwell', 'KA':'Kilmarnock', 'KY':'Kirkcaldy', 'DD':'Dundee', 'AB':'Aberdeen', 'CF':'Cardiff', 'NP':'Newport', 'SA':'Swansea', 'LL':'Bangor' };
function resolveOutcodeId(areaCode) {
  return new Promise(function(resolve) {
    if (!APIFY_KEY) { resolve(null); return; }
    var knownOutcodes = { E: 93917, N: 93917, NW: 93961, SE: 93917, SW: 93917, W: 93917, EC: 93917, WC: 93917, B: 94028, M: 94019, L: 94022, S: 94124, NE: 94100, BS: 93920 };
    if (knownOutcodes[areaCode]) {
      console.log('[DEEP-SCRAPE] ' + areaCode + ' -> known outcode ' + knownOutcodes[areaCode]);
      resolve(knownOutcodes[areaCode]);
      return;
    }
    var town = AREA_TOWN[areaCode] || areaCode;
    var typeaheadUrl = 'https://www.rightmove.co.uk/typeAheadHtml/search?term=' + encodeURIComponent(town) + '&index=0&c=1&maxResults=10';
    var input = { listUrls: [{ url: typeaheadUrl }], fullPropertyDetails: false, monitoringMode: false, maxProperties: 1, proxy: { useApifyProxy: true } };
    var body = JSON.stringify(input);
    var req = https.request({
      hostname: 'api.apify.com',
      path: '/v2/acts/dhrumil~rightmove-scraper/run-sync-get-dataset-items?token=' + APIFY_KEY + '&memory=256&timeout=60',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'application/json' },
      timeout: 90000
    }, function(res) {
      var b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        try {
          var items = JSON.parse(b);
          if (!Array.isArray(items)) { console.log('[DEEP-SCRAPE] typeahead ' + areaCode + ' non-array: ' + b.substring(0, 150)); resolve(null); return; }
          // Find the OUTCODE entry in the typeahead data
          var found = null;
          for (var i = 0; i < items.length; i++) {
            var it = items[i];
            var raw = JSON.stringify(it);
            var m = raw.match(/OUTCODE%5E([0-9]+)/i);
            if (m) { found = m[1]; break; }
          }
          if (found) { console.log('[DEEP-SCRAPE] ' + areaCode + ' (' + town + ') -> OUTCODE ' + found); resolve(found); }
          else { console.log('[DEEP-SCRAPE] ' + areaCode + ' typeahead: no outcode found. sample=' + JSON.stringify(items).substring(0, 200)); resolve(null); }
        } catch(e) { console.log('[DEEP-SCRAPE] ' + areaCode + ' typeahead parse error: ' + e.message); resolve(null); }
      });
    });
    req.on('error', function(e) { console.log('[DEEP-SCRAPE] ' + areaCode + ' typeahead req error: ' + e.message); resolve(null); });
    req.setTimeout(90000, function() { req.destroy(); resolve(null); });
    req.write(body); req.end();
  });
}
// Scrape a UK REGION via Apify Rightmove actor (handles BOTH residential and
// commercial). Region search works reliably (outcode IDs for specific areas were
// unreliable), and the returned leads carry full outcodes/postcodes so the
// delivery's exact-area filter keeps only the customer's chosen postcode areas.
// Cost-controlled: low maxProperties, 256MB memory, list-only (no 5x multiplier).
function scrapeAreaApify(areaCode, outcodeId, maxProps, type) {
  return new Promise(function(resolve) {
    if (!APIFY_KEY) { console.log('[DEEP-SCRAPE] No APIFY_API_KEY — skipping Apify for ' + areaCode); resolve([]); return; }
    var section = type === 'commercial' ? 'commercial-property-for-sale' : 'property-for-sale';
    // Prefer a resolved OUTCODE (targeted to the exact area) when available; this
    // isolates EN/HA/LU specifically. Fall back to a region search otherwise.
    // Correct Rightmove location IDs for the North West supply areas (the typeahead
    // endpoint was retired and the old OUTCODE ids 404 for Liverpool/Manchester).
    // REGION ids taken from Rightmove's own city pages (Liverpool/Manchester/etc).
    var KNOWN_LOCATION = { L: 'REGION%5E813', M: 'REGION%5E904', WA: 'REGION%5E1403', CH: 'REGION%5E313', WN: 'REGION%5E1452' };
    var locId = KNOWN_LOCATION[areaCode] || null;
    if (!locId) {
      if (outcodeId) locId = 'OUTCODE%5E' + outcodeId;
      else {
      // Region fallback - the correct Rightmove region for the area. The old
      // default of 87490 (London) sent Liverpool (L) / Manchester (M) / etc. to
      // London and produced zero North-West supply. Map every area to its region:
      //   87490 Greater London, 87491 West Midlands, 87492 Scotland, 87493 Wales,
      //   87495 East, 87496 South East, 87497 South West, 87489 East Midlands,
      //   87487 North West, 87488 Yorks & Humber, 87486 North East.
      var REGION_MAP = {
        'E':'87490','EC':'87490','N':'87490','NW':'87490','SE':'87490','SW':'87490','W':'87490','WC':'87490',
        'EN':'87490','HA':'87490','BR':'87490','CR':'87490','DA':'87490','KT':'87496','RM':'87490','SM':'87490',
        'TW':'87490','UB':'87490','IG':'87490','WD':'87490','SL':'87496','GU':'87496','RG':'87496',
        'AL':'87495','SG':'87495','CM':'87495','SS':'87495','CO':'87495','HP':'87496','LU':'87495','MK':'87496',
        'TN':'87496','ME':'87496','CT':'87496','BN':'87496','RH':'87496','SO':'87496','PO':'87496','SP':'87496','OX':'87496',
        'BA':'87497','BS':'87497','GL':'87497','SN':'87497','TA':'87497','DT':'87497','BH':'87497','EX':'87497','PL':'87497','TQ':'87497','TR':'87497',
        'B':'87491','CV':'87491','DY':'87491','HR':'87491','ST':'87491','SY':'87491','TF':'87491','WR':'87491','WS':'87491','WV':'87491',
        'DE':'87489','DN':'87489','LE':'87489','LN':'87489','NG':'87489','NN':'87489','PE':'87489',
        'CB':'87495','IP':'87495','NR':'87495',
        'M':'87487','L':'87487','BL':'87487','CH':'87487','CW':'87487','FY':'87487','LA':'87487','OL':'87487','PR':'87487','SK':'87487','WA':'87487','WN':'87487','BB':'87487',
        'HD':'87488','HG':'87488','HU':'87488','HX':'87488','LS':'87488','S':'87488','WF':'87488','YO':'87488','BD':'87488',
        'DH':'87486','DL':'87486','NE':'87486','SR':'87486','TS':'87486',
        'AB':'87492','DD':'87492','DG':'87492','EH':'87492','FK':'87492','G':'87492','HS':'87492','IV':'87492','KA':'87492','KW':'87492','KY':'87492','ML':'87492','PA':'87492','PH':'87492','TD':'87492','ZE':'87492',
        'CF':'87493','LD':'87493','LL':'87493','NP':'87493','SA':'87493','SY':'87493'
      };
        var regionId = REGION_MAP[areaCode] || '87490';
        locId = 'REGION%5E' + regionId;
      }
    }
    var url = 'https://www.rightmove.co.uk/' + section + '/find.html?searchType=SALE&locationIdentifier=' + locId + '&includeSSTC=true';
    // LIST mode (fast): full-property-detail mode is too slow for the 150s run-sync
    // timeout and made the whole scrape hang. List mode completes in minutes per
    // area and displayAddress usually includes the full postcode.
    var input = {
      listUrls: [{ url: url }],
      propertyUrls: [],
      monitoringMode: false,
      fullPropertyDetails: false,
      includePriceHistory: false,
      includeNearestSchools: false,
      enableDelistingTracker: false,
      addEmptyTrackerRecord: false,
      maxProperties: maxProps || 25,
      proxy: { useApifyProxy: true }
    };
    var body = JSON.stringify(input);
    try { require('./scraper_usage').inc('apify_runs', 1); } catch(e) {}
    var req = https.request({
      hostname: 'api.apify.com',
      path: '/v2/acts/dhrumil~rightmove-scraper/run-sync-get-dataset-items?token=' + APIFY_KEY + '&memory=256&timeout=120',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'application/json' },
      timeout: 150000
    }, function(res) {
      var b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        // Cheap apify property estimate (avoid building a huge match array).
        try { var _pcnt = 0; for (var _pi = 0; _pi < b.length; _pi++) { if (b[_pi] === '"') _pcnt++; } require('./scraper_usage').inc('apify_props', _pcnt); } catch(e) {}
        console.log('[DEEP-SCRAPE] ' + areaCode + '[' + type + '] raw status=' + res.statusCode + ' body=' + b.substring(0, 200));
        try {
          var items = JSON.parse(b);
          if (!Array.isArray(items)) { console.log('[DEEP-SCRAPE] ' + areaCode + ' non-array: ' + b.substring(0, 300)); resolve([]); return; }
          var leads = items.map(function(p, i) {
            var addr = (p.displayAddress || p.address || '').trim();
            var ppc = (p.postcode || p.fullPostcode || '').trim();
            var out = (p.outcode || '').trim();
            var inc = (p.incode || '').trim();
            var pcMatch = addr.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i);
            return {
              id: 'RM_' + (type === 'commercial' ? 'C_' : '') + (p.id || (Date.now() + '_' + i)),
              title: addr,
              address: addr,
              fullAddress: addr,
              price: p.price ? (typeof p.price === 'object' ? (p.price.amount || 0) : 0) : 0,
              priceLabel: (typeof p.price === 'object' && p.price.amount) ? '\u00a3' + Number(p.price.amount).toLocaleString() : '',
              bedrooms: p.bedrooms || 0,
              commercial: type === 'commercial',
              propertyType: p.propertyType || p.propertySubType || '',
              listingStatus: p.displayStatus || 'new',
              firstVisibleDate: p.firstVisibleDate || p.addedOn || new Date().toISOString(),
              updateDate: p.listingUpdateDate || p.updateDate || '',
              url: p.url || ('https://www.rightmove.co.uk' + (p.propertyUrl || '')),
              agent: p.agent || p.customer ? (p.agent || (p.customer && (p.customer.branchDisplayName || p.customer.branchName)) || '') : '',
              source: 'Rightmove ' + (type === 'commercial' ? 'Commercial' : '') + ' (Apify)',
              scrapedAt: new Date().toISOString(),
              postcode: (ppc || ((out && inc) ? (out + ' ' + inc) : '')) || (pcMatch ? pcMatch[0].trim() : '')
            };
          });
          console.log('[DEEP-SCRAPE] ' + areaCode + '[' + type + ']: ' + leads.length + ' properties');
          resolve(leads);
        } catch(e) { console.log('[DEEP-SCRAPE] ' + areaCode + ' parse error: ' + e.message); resolve([]); }
      });
    });
    req.on('error', function(e) { console.log('[DEEP-SCRAPE] ' + areaCode + ' req error: ' + e.message); resolve([]); });
    req.setTimeout(150000, function() { req.destroy(); resolve([]); });
    req.write(body);
    req.end();
  });
}

(async function() {
  var start = Date.now();
  // Log to a file too so we can debug the detached worker on the live server.
  var logLines = [];
  function log(msg) { console.log(msg); try { logLines.push('[' + new Date().toISOString() + '] ' + msg); } catch(e) {} try { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.appendFileSync(path.join(DATA_DIR, 'deep-scrape.log'), '[' + new Date().toISOString() + '] ' + msg + '\n'); } catch(e) {} }
  // 1. Determine areas: from args, or gather active moving accounts
  var forceAreas = process.argv[2] || '';
  var areas = forceAreas ? forceAreas.split(',').map(function(a){return a.trim().toUpperCase();}).filter(Boolean) : [];
  var maxProps = parseInt(process.argv[3] || process.env.MOVING_MAX_PROPS || '50', 10);
  if (areas.length === 0) {
    var db = loadJson(DB_FILE);
    var customers = (db && db.customers) ? db.customers : [];
    customers.forEach(function(c) {
      if (c.product !== 'moving' && !((c.biz_field3 || '').indexOf('moving') !== -1)) return;
      var cAreas = [];
      try { cAreas = JSON.parse(c.target_areas || '[]'); } catch(e) { cAreas = []; }
      // Also try product_config as a fallback
      if (!cAreas.length) {
        try { var cfg = JSON.parse(c.product_config || '{}'); var prim = cfg.moving || {}; cAreas = prim.target_areas ? JSON.parse(prim.target_areas) : []; } catch(e2) {}
      }
      cAreas.forEach(function(a) {
        var u = String(a).toUpperCase().replace(/[^A-Z].*$/,'');
        // Keep any valid postcode AREA (resolved dynamically, no hardcoded filter)
        if (u && u.length >= 1 && u.length <= 3 && areas.indexOf(u) === -1) areas.push(u);
      });
    });
  }
  // Dedupe valid 1-2 letter postcode areas (do NOT filter by AREA_OUTCODE, since
  // outcode IDs are resolved dynamically via typeahead).
  areas = areas.filter(function(a) { return /^[A-Z]{1,2}$/.test(a); });
  log('[DEEP-SCRAPE] Areas to scrape (active accounts): ' + (areas.join(',') || '(none)') + ' | maxProps=' + maxProps + '/area');

  // 2. Resolve each area's Rightmove OUTCODE id (via typeahead), then scrape both
  //    residential + commercial for that exact area (Rightmove actor handles both).
  var allLeads = [];
  var types = ['residential', 'commercial'];
  for (var i = 0; i < areas.length; i++) {
    // Try to resolve the exact Rightmove outcode; if it fails, fall back to the
    // region scrape (which works and returns leads incl. some in the target area).
    var resolvedId = await resolveOutcodeId(areas[i]);
    var useId = resolvedId || null;
    if (!resolvedId) log('[DEEP-SCRAPE] ' + areas[i] + ': no outcode resolved, falling back to region scrape');
    for (var t = 0; t < types.length; t++) {
      var leads = await scrapeAreaApify(areas[i], useId, maxProps, types[t]);
      log('[DEEP-SCRAPE] ' + areas[i] + '[' + types[t] + '] returned ' + (leads ? leads.length : 0) + ' leads');
      allLeads = allLeads.concat(leads || []);
      await new Promise(function(r){ setTimeout(r, 500); });
    }
  }
  log('[DEEP-SCRAPE] Scraped ' + allLeads.length + ' total from ' + areas.length + ' areas (residential + commercial via Rightmove)');

  // 3. Merge with existing fresh pool, dedupe, keep fresh (48h; Monday extends
  //    to Saturday 00:00 so weekend scrapes fill Monday's accounts)
  var poolFreshCutoff = require('./freshness').getFreshCutoffIso();
  function isFresh(l) {
    var d = l.scrapedAt || l.firstVisibleDate || l.updateDate || l.incorporationDate || l.publishedDate || l.receivedDate || l.createdAt || l.created_at || '';
    return !!d && d >= poolFreshCutoff;
  }
  var prevPool = loadJson(POOL_FILE) || [];
  if (!Array.isArray(prevPool)) prevPool = [];
  var seen = new Set();
  var merged = [];
  allLeads.forEach(function(l) { var k = l.id || l.address || l.postcode || ''; if (k && !seen.has(k)) { seen.add(k); merged.push(l); } });
  prevPool.forEach(function(l) { var k = l.id || l.address || l.postcode || ''; if (k && !seen.has(k) && isFresh(l)) { seen.add(k); merged.push(l); } });
  merged = merged.filter(isFresh).slice(0, 6000);

  // 4. Write pool
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(POOL_FILE, JSON.stringify(merged, null, 2));

  // 5. Mark scraped today
  var today = new Date().toISOString().split('T')[0];
  var lastScrape = loadJson(LAST_SCRAPE_FILE) || {};
  if (merged.length > 0) lastScrape.moving = today;
  fs.writeFileSync(LAST_SCRAPE_FILE, JSON.stringify(lastScrape));

  // 6. Log area breakdown
  var areasMap = {};
  merged.forEach(function(l) { var a = extractPostcodeArea(l.postcode || l.address || l.location || ''); if (a) areasMap[a] = (areasMap[a] || 0) + 1; });
  log('[DEEP-SCRAPE] Done: pool=' + merged.length + ' in ' + Math.round((Date.now() - start) / 1000) + 's');
  log('[DEEP-SCRAPE] EN=' + (areasMap['EN'] || 0) + ' HA=' + (areasMap['HA'] || 0) + ' LU=' + (areasMap['LU'] || 0));
  try { fs.writeFileSync(path.join(DATA_DIR, 'deep-scrape.log'), __logLines.join('\n')); } catch(e) {}
  process.exit(0);
})().catch(function(e) { console.log('[DEEP-SCRAPE] Fatal:', e.message); try { fs.writeFileSync(path.join(DATA_DIR, 'deep-scrape.log'), '[DEEP-SCRAPE] Fatal: ' + e.message); } catch(e2) {} process.exit(1); });
