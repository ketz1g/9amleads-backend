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
// Force a promise to resolve within ms (prevents a hung Apify call from blocking
// the whole area loop — the worker was dying after the first area because a
// subsequent run-sync never resolved).
function withTimeout(promise, ms, label) {
  return new Promise(function(resolve) {
    var done = false;
    var t = setTimeout(function() {
      if (done) return;
      done = true;
      console.log('[DEEP-SCRAPE] TIMEOUT ' + (label || '') + ' after ' + ms + 'ms — continuing');
      resolve(null);
    }, ms);
    Promise.resolve(promise).then(function(v) {
      if (done) return;
      done = true;
      clearTimeout(t);
      resolve(v);
    }).catch(function(e) {
      if (done) return;
      done = true;
      clearTimeout(t);
      console.log('[DEEP-SCRAPE] ' + (label || '') + ' error: ' + e.message);
      resolve(null);
    });
  });
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
    // Exact Rightmove location IDs for EVERY postcode area customers sign up for.
    // REGION ids come from Rightmove's own city pages (Liverpool/Ilford/Preston/etc)
    // so each customer area is scraped DIRECTLY - no more missing supply for areas
    // that fall back to a broad region and get deduped (IG/RM/DA/CM/AL/KT/CR/PR...).
    var KNOWN_LOCATION = {
      L: 'REGION%5E813', M: 'REGION%5E904', WA: 'REGION%5E1403', CH: 'REGION%5E313', WN: 'REGION%5E1452',
      IG: 'REGION%5E674', RM: 'REGION%5E1138', DA: 'REGION%5E407', CM: 'REGION%5E307',
      AL: 'REGION%5E1244', KT: 'REGION%5E746', CR: 'REGION%5E391', PR: 'REGION%5E1097',
      // SCOTLAND (verified city region ids 2026-08-24 — the old 87492 was Battersea!)
      G: 'REGION%5E550', EH: 'REGION%5E475', DD: 'REGION%5E452', KY: 'REGION%5E754', FK: 'REGION%5E501',
      AB: 'REGION%5E4', DG: 'REGION%5E448', IV: 'REGION%5E687', KA: 'REGION%5E740', ML: 'REGION%5E958',
      PA: 'REGION%5E1040', PH: 'REGION%5E1060', TD: 'REGION%5E540',
      // YORKSHIRE & HUMBER (verified 2026-08-24 — old 87488 was a Dundee neighbourhood)
      LS: 'REGION%5E787', S: 'REGION%5E1195', DN: 'REGION%5E430', HU: 'REGION%5E665', WF: 'REGION%5E1386',
      BD: 'REGION%5E198', HD: 'REGION%5E664', HG: 'REGION%5E598', HX: 'REGION%5E664', YO: 'REGION%5E1498',
      // WEST MIDLANDS (verified 2026-08-24 — old 87491 was Acton Green, West London)
      B: 'REGION%5E162', CV: 'REGION%5E368', DY: 'REGION%5E443', WS: 'REGION%5E1392', WV: 'REGION%5E1476',
      ST: 'REGION%5E1271', WR: 'REGION%5E162', TF: 'REGION%5E1476'
    };
    var locId = KNOWN_LOCATION[areaCode] || null;
    if (!locId) {
      if (outcodeId) locId = 'OUTCODE%5E' + outcodeId;
      else {
      // Region fallback - the correct Rightmove CITY region id for the area.
      // IMPORTANT (2026-08-24): the old "UK region" ids 87486-87497 are WRONG —
      // they resolve to small London/Dundee neighbourhoods (87492=Battersea,
      // 87488=Ethiebeaton Dundee, 87491=Acton Green), so Scotland/Yorkshire/Midlands
      // fell back to them and produced ZERO in-area supply. These city ids are
      // verified against Rightmove's own city pages.
      var REGION_MAP = {
        'E':'87490','EC':'87490','N':'87490','NW':'87490','SE':'87490','SW':'87490','W':'87490','WC':'87490',
        'EN':'93950','HA':'599','BR':'225','CR':'391','DA':'407','KT':'746','RM':'1138','SM':'87490',
        'TW':'87490','UB':'87490','IG':'674','WD':'1408','SL':'1217','GU':'580','RG':'1114',
        'AL':'1244','SG':'1263','CM':'307','SS':'1232','CO':'347','HP':'637','LU':'876','MK':'940',
        'TN':'1366','ME':'897','CT':'279','BN':'93554','RH':'580','SO':'1231','PO':'1089','SP':'1165','OX':'1036',
        'BA':'116','BS':'219','GL':'556','SN':'1306','TA':'1317','DT':'194','BH':'194','EX':'494','PL':'1073','TQ':'1350','TR':'1365',
        'B':'162','CV':'368','DY':'443','HR':'162','ST':'1271','SY':'162','TF':'1476','WR':'162','WS':'1392','WV':'1476',
        'DE':'418','DN':'430','LE':'789','LN':'804','NG':'1019','NN':'1014','PE':'1061',
        'CB':'274','IP':'689','NR':'1018',
        'M':'904','L':'813','BL':'182','OL':'1025','SK':'1268','WA':'1403','WN':'1452','CH':'313','CW':'313','PR':'1097','BB':'167','FY':'168','LA':'1097',
        'HD':'664','HG':'598','HU':'665','HX':'664','LS':'787','S':'1195','WF':'1386','YO':'1498','BD':'198',
        'DH':'460','DL':'406','NE':'984','SR':'1295','TS':'933',
        'AB':'4','DD':'452','DG':'448','EH':'475','FK':'501','G':'550','HS':'687','IV':'687','KA':'740','KW':'687','KY':'754','ML':'958','PA':'1040','PH':'1060','TD':'540','ZE':'687',
        'CF':'281','LD':'824','LL':'824','NP':'991','SA':'1305','SY':'162'
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
      path: '/v2/acts/dhrumil~rightmove-scraper/run-sync-get-dataset-items?token=' + APIFY_KEY + '&memory=256&timeout=180',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'application/json' },
      timeout: 210000
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
    req.setTimeout(210000, function() { req.destroy(); resolve([]); });
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
  //    COST CONTROL: only scrape COMMERCIAL when at least one active moving account
  //    wants commercial leads - otherwise we'd pay Apify 2x runs for data nobody
  //    is subscribed to.
  var wantCommercial = false;
  try {
    var dbC = loadJson(DB_FILE);
    (dbC && dbC.customers || []).forEach(function(c) {
      if (c.product !== 'moving' && !((c.biz_field3 || '').indexOf('moving') !== -1)) return;
      var mt = c.moving_type;
      try { var cfgC = JSON.parse(c.product_config || '{}'); mt = (cfgC.moving && cfgC.moving.moving_type) || mt; } catch(e) {}
      if (mt === 'commercial' || mt === 'both') wantCommercial = true;
    });
  } catch(e) {}
  var allLeads = [];
  var types = wantCommercial ? ['residential', 'commercial'] : ['residential'];
  log('[DEEP-SCRAPE] commercial wanted: ' + wantCommercial + ' (types=' + types.join(',') + ')');
  // WRITE-POOL HELPER: merge freshly scraped leads into the existing fresh pool
  // and persist immediately. Running this after EVERY area means a crash or kill
  // part-way through (observed: worker dies after the first area and the old code
  // only wrote at the very END, losing everything) still leaves the scraped areas
  // in the pool for delivery.
  var poolFreshCutoff = require('./freshness').getFreshCutoffIso();
  function isFresh(l) {
    var d = l.scrapedAt || l.firstVisibleDate || l.updateDate || l.incorporationDate || l.publishedDate || l.receivedDate || l.createdAt || l.created_at || '';
    return !!d && d >= poolFreshCutoff;
  }
  function writePoolNow() {
    try {
      var prevPool = loadJson(POOL_FILE) || [];
      if (!Array.isArray(prevPool)) prevPool = [];
      var seen = new Set();
      var merged = [];
      allLeads.forEach(function(l) { var k = l.id || l.address || l.postcode || ''; if (k && !seen.has(k)) { seen.add(k); merged.push(l); } });
      // Keep FRESH previous-pool leads first, then older leads as FALLBACK so a
      // 0-result or low-freshness scrape can NEVER empty the pool (an empty pool
      // means no 9am delivery). Fresh leads are prioritized; older valid leads are
      // kept as a safety net for the fallback delivery path.
      var freshPrev = [];
      var olderPrev = [];
      prevPool.forEach(function(l) {
        var k = l.id || l.address || l.postcode || '';
        if (!k || seen.has(k)) return;
        if (isFresh(l)) freshPrev.push(l); else olderPrev.push(l);
      });
      freshPrev.forEach(function(l) { var k = l.id || l.address || l.postcode || ''; if (!seen.has(k)) { seen.add(k); merged.push(l); } });
      olderPrev.forEach(function(l) { var k = l.id || l.address || l.postcode || ''; if (!seen.has(k)) { seen.add(k); merged.push(l); } });
      // Cap at 6000 total; never empty unless the pool genuinely has nothing.
      if (merged.length > 6000) merged = merged.slice(0, 6000);
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(POOL_FILE, JSON.stringify(merged, null, 2));
      log('[DEEP-SCRAPE] pool written: ' + merged.length + ' leads (new=' + allLeads.length + ', prev-fresh=' + freshPrev.length + ', prev-older=' + olderPrev.length + ')');
      return merged;
    } catch(wErr) { log('[DEEP-SCRAPE] pool write error: ' + wErr.message); return null; }
  }
  for (var i = 0; i < areas.length; i++) {
    try {
      // Try to resolve the exact Rightmove outcode; if it fails, fall back to the
      // region scrape (which works and returns leads incl. some in the target area).
      var resolvedId = await withTimeout(resolveOutcodeId(areas[i]), 95000, 'typeahead');
      var useId = resolvedId || null;
      if (!resolvedId) log('[DEEP-SCRAPE] ' + areas[i] + ': no outcode resolved, falling back to region scrape');
      for (var t = 0; t < types.length; t++) {
        // HARD PER-AREA TIMEOUT: an Apify run-sync that hangs must never block the
        // whole worker (it was dying after the first area). Force-resolve after
        // 220s so the loop always advances to the next area.
        var leads = await withTimeout(scrapeAreaApify(areas[i], useId, maxProps, types[t]), 220000, 'area scrape');
        log('[DEEP-SCRAPE] ' + areas[i] + '[' + types[t] + '] returned ' + (leads ? leads.length : 0) + ' leads');
        allLeads = allLeads.concat(leads || []);
        await new Promise(function(r){ setTimeout(r, 800); });
      }
    } catch(aErr) {
      // One bad area must never kill the whole worker (it was dying after the
      // first area, losing ALL areas' leads). Log + keep going.
      log('[DEEP-SCRAPE] area ' + areas[i] + ' error: ' + aErr.message);
    }
    // Persist after every area so a mid-run crash keeps the completed areas.
    writePoolNow();
    // Small delay between areas (politeness + avoids Apify throttling that was
    // likely killing the worker after the first area).
    await new Promise(function(r){ setTimeout(r, 800); });
  }
  log('[DEEP-SCRAPE] Scraped ' + allLeads.length + ' total from ' + areas.length + ' areas (residential + commercial via Rightmove)');

  // 3. Final merge with existing fresh pool, dedupe, keep fresh (48h; Monday extends
  //    to Saturday 00:00 so weekend scrapes fill Monday's accounts)
  var merged = writePoolNow() || [];
  if (!Array.isArray(merged)) merged = [];

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

// CRASH GUARDS: the worker runs detached (spawned, stdio ignore, unref'd). If it
// dies on an uncaught error AFTER scraping a few areas, the old code lost everything
// because the pool was only written at the very end. The loop now writes the pool
// after each area, and these handlers ensure a stray unhandled rejection/exception
// is logged (and the partial pool kept) instead of silently killing the process.
process.on('unhandledRejection', function(reason) {
  try { fs.appendFileSync(path.join(DATA_DIR, 'deep-scrape.log'), '[' + new Date().toISOString() + '] [DEEP-SCRAPE] unhandledRejection: ' + (reason && reason.message || reason) + '\n'); } catch(e) {}
  console.log('[DEEP-SCRAPE] unhandledRejection:', reason);
});
process.on('uncaughtException', function(err) {
  try { fs.appendFileSync(path.join(DATA_DIR, 'deep-scrape.log'), '[' + new Date().toISOString() + '] [DEEP-SCRAPE] uncaughtException: ' + (err && err.stack || err) + '\n'); } catch(e) {}
  console.log('[DEEP-SCRAPE] uncaughtException:', err && err.message);
});
