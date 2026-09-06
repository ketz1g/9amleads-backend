// Plota Planning Applications API Provider
// Implements the Planning Provider Interface using Plota's API.
//
// Requires PLOTA_API_KEY env var.
// Pricing: £49/mo Starter (20k req), £149/mo Pro (100k req)
// Docs: https://www.plota.co.uk/api-docs

const https = require('https');
const planningProvider = require('./planning_provider');

const BASE = 'api.plota.co.uk';
const API_KEY = process.env.PLOTA_API_KEY || '';

// Trade categorisation from proposal descriptions
const TRADE_KEYWORDS = {
  builders: ['new dwelling','extension','loft conversion','garage conversion','new build','house','flat','apartment','dormer','storey','storey rear','two storey','single storey'],
  roofers: ['roof','roofing','roof light','skylight','dormer'],
  electricians: ['electrical','lighting','wiring','electrics','consumer unit','smart home'],
  plumbers: ['plumbing','heating','boiler','radiator','underfloor heating','bathroom','wet room','shower'],
  landscapers: ['landscaping','garden','patio','decking','fencing','driveway','paving','turf','planting','shed','greenhouse','pergola','trees','tree'],
  architects: ['architect','design','planning application','listed building','conservation area','heritage statement','design and access'],
  surveyors: ['survey','structural','damp','timber','party wall','boundary','measured survey'],
  'window companies': ['window','double glazing','glazing','bi-fold','sliding door','patio door','conservatory'],
  'solar installers': ['solar','photovoltaic','pv','renewable','energy','battery storage','heat pump','ev charger'],
  'commercial fit-out': ['shop front','retail','office fit','commercial','warehouse','industrial unit','change of use','a3','a1','a2','d1','d2']
};

// Make an API request to Plota
function apiRequest(path) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) { resolve({ data: [], meta: { count: 0, error: 'No PLOTA_API_KEY set' } }); return; }
    https.get({ hostname: BASE, path: path, headers: { 'Authorization': 'Bearer ' + API_KEY, 'Accept': 'application/json' }, timeout: 30000 }, (res) => {
      var body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve({ data: [], meta: { count: 0 } }); }
      });
    }).on('error', (e) => { resolve({ data: [], meta: { count: 0 } }); });
  });
}

// Categorise a planning application by trade based on proposal description
function categoriseTrade(description, category) {
  var text = (description || '').toLowerCase();
  var categories = [];
  for (var trade in TRADE_KEYWORDS) {
    var keywords = TRADE_KEYWORDS[trade];
    for (var ki = 0; ki < keywords.length; ki++) {
      if (text.includes(keywords[ki])) { categories.push(trade); break; }
    }
  }
  // If no trade detected, use Plota's category as a fallback
  if (categories.length === 0 && category) {
    var catText = (category || '').toLowerCase();
    if (catText.includes('extensions') || catText.includes('new homes')) categories.push('builders');
    else if (catText.includes('trees')) categories.push('landscapers');
    else if (catText.includes('solar') || catText.includes('renewables')) categories.push('solar installers');
    else if (catText.includes('commercial') || catText.includes('change of use')) categories.push('commercial fit-out');
    else categories.push('other');
  }
  if (categories.length === 0) categories.push('other');
  return categories;
}

// Calculate freshness badge
function freshnessBadge(receivedDate, validatedDate) {
  var today = new Date().toISOString().split('T')[0];
  var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (receivedDate === today) return 'added today';
  if (validatedDate === today) return 'validated today';
  if (receivedDate === yesterday) return 'received yesterday';
  if (validatedDate === yesterday) return 'validated yesterday';
  return 'published within 48h';
}

// Map a county (or "Greater London") to the postcode DISTRICTS inside it. Plota
// accepts district/sector postcodes (L1, SW11) but REJECTS single-letter areas
// (E, L, WA) with HTTP 400 - so we always query at district level.
var COUNTY_DISTRICTS = {
  'Greater London': ['E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12','E13','E14','E15','E16','E17','E18','EC1','EC2','EC3','EC4','N1','N2','N3','N4','N5','N6','N7','N8','N9','N10','N11','N12','N13','N14','N15','N16','N17','N18','N19','N20','N21','N22','NW1','NW2','NW3','NW4','NW5','NW6','NW7','NW8','NW9','NW10','NW11','SE1','SE2','SE3','SE4','SE5','SE6','SE7','SE8','SE9','SE10','SE11','SE12','SE13','SE14','SE15','SE16','SE17','SE18','SE19','SE20','SE21','SE22','SE23','SE24','SE25','SE26','SE27','SE28','SW1','SW2','SW3','SW4','SW5','SW6','SW7','SW8','SW9','SW10','SW11','SW12','SW13','SW14','SW15','SW16','SW17','SW18','SW19','SW20','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','W13','W14','WC1','WC2','BR1','BR2','BR3','BR4','BR5','BR6','BR7','BR8','CR0','CR2','CR3','CR4','CR5','CR6','CR7','CR8','DA1','DA2','DA3','DA4','DA5','DA6','DA7','DA8','DA14','DA15','DA16','DA17','DA18','EN1','EN2','EN3','EN4','EN5','EN6','EN7','EN8','EN9','EN10','EN11','HA0','HA1','HA2','HA3','HA4','HA5','HA6','HA7','HA8','HA9','IG1','IG2','IG3','IG4','IG5','IG6','IG7','IG8','IG9','IG10','IG11','KT1','KT2','KT3','KT4','KT5','KT6','KT7','KT8','KT9','KT10','KT11','KT12','KT13','KT14','KT15','KT16','KT17','KT18','KT19','KT20','KT21','KT22','KT23','KT24','RM1','RM2','RM3','RM4','RM5','RM6','RM7','RM8','RM9','RM10','RM11','RM12','RM13','RM14','RM15','RM16','RM17','RM18','RM19','RM20','SM1','SM2','SM3','SM4','SM5','SM6','SM7','TW1','TW2','TW3','TW4','TW5','TW6','TW7','TW8','TW9','TW10','TW11','TW12','TW13','TW14','TW15','TW16','TW17','TW18','TW19','TW20','UB1','UB2','UB3','UB4','UB5','UB6','UB7','UB8','UB9','UB10','UB11','WD1','WD2','WD3','WD4','WD5','WD6','WD7','WD17','WD18','WD19','WD23','WD24','WD25'],
  'Essex': ['CM1','CM2','CM3','CM4','CM5','CM6','CM7','CM8','CM9','CM11','CM12','CM13','CM14','CM15','CM16','CM17','CM18','CM19','CM20','CM21','CM22','CM23','CM24','CO1','CO2','CO3','CO4','CO5','CO6','CO7','CO8','CO9','CO10','CO11','CO12','CO13','CO14','CO15','CO16','SS1','SS2','SS3','SS4','SS5','SS6','SS7','SS8','SS9','SS10','SS11','SS12','SS13','SS14','SS15','SS16','SS17','RM17','RM18','RM19','RM20','IG1','IG2','IG3','IG4','IG5','IG6','IG7','IG8','IG9','IG10','IG11'],
  'Herefordshire': ['HR1','HR2','HR3','HR4','HR5','HR6','HR7','HR8','HR9'],
  'Merseyside': ['L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12','L13','L14','L15','L16','L17','L18','L19','L20','L21','L22','L23','L24','L25','L26','L27','L28','L29','L30','L31','L32','L33','L34','L35','L36','L37','L38','L39','L40','CH41','CH42','CH43','CH44','CH45','CH46','CH47','CH48','CH49','CH60','CH61','CH62','CH63','CH64','CH65','CH66','WA8','WA9','WA10','WA11'],
  'Lancashire': ['BB1','BB2','BB3','BB4','BB5','BB6','BB7','BB8','BB9','BB10','BB11','BB12','BB18','BL0','BL1','BL2','BL3','BL4','BL5','BL6','BL7','BL8','BL9','FY1','FY2','FY3','FY4','FY5','FY6','FY7','FY8','LA1','LA2','LA3','LA4','LA5','LA6','LA7','LA8','LA9','PR1','PR2','PR3','PR4','PR5','PR6','PR7','PR8','PR9','PR25','PR26'],
  'North East England': ['DH1','DH2','DH3','DH4','DH5','DH6','DH7','DH8','DH9','NE1','NE2','NE3','NE4','NE5','NE6','NE7','NE8','NE9','NE10','NE11','NE12','NE13','NE15','NE16','NE17','NE18','NE19','NE20','NE21','NE22','NE23','NE24','NE25','NE26','NE27','NE28','NE29','NE30','NE31','NE32','NE33','NE34','NE35','NE36','NE37','NE38','NE39','NE40','NE41','NE42','NE43','NE44','NE45','NE46','NE47','NE48','NE49','NE61','NE62','NE63','NE64','NE65','NE66','NE67','NE68','NE69','NE70','NE71','SR1','SR2','SR3','SR4','SR5','SR6','SR7','SR8','SR9','TS1','TS2','TS3','TS4','TS5','TS6','TS7','TS8','TS9','TS10','TS11','TS12','TS13','TS14','TS15','TS16','TS17','TS18','TS19','TS20','TS21','TS22','TS23','TS24','TS25','TS26','TS27','TS28','TS29'],
  'Yorkshire and the Humber': ['DN1','DN2','DN3','DN4','DN5','DN6','DN7','DN8','DN9','DN10','DN11','DN12','DN13','DN14','DN15','DN16','DN17','DN18','DN19','DN20','DN21','DN22','DN31','DN32','DN33','DN34','DN35','DN36','DN37','DN38','DN39','DN40','DN41','HD1','HD2','HD3','HD4','HD5','HD6','HD7','HD8','HD9','HG1','HG2','HG3','HG4','HG5','HU1','HU2','HU3','HU4','HU5','HU6','HU7','HU8','HU9','HU10','HU11','HU12','HU13','HU14','HU15','HU16','HU17','HU18','HU19','HU20','HX1','HX2','HX3','HX4','HX5','HX6','HX7','LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9','LS10','LS11','LS12','LS13','LS14','LS15','LS16','LS17','LS18','LS19','LS20','LS21','LS22','LS23','LS24','LS25','LS26','LS27','LS28','LS29','S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13','S14','S17','S18','S19','S20','S21','S25','S26','S35','S36','S40','S41','S42','S43','S44','S45','S48','S49','S60','S61','S62','S63','S64','S65','S66','S70','S71','S72','S73','S74','S75','S80','S81','WF1','WF2','WF3','WF4','WF5','WF6','WF7','WF8','WF9','WF10','WF11','WF12','WF13','WF14','WF15','WF16','WF17','YO1','YO2','YO3','YO4','YO5','YO6','YO7','YO8','YO10','YO11','YO12','YO13','YO14','YO15','YO16','YO17','YO18','YO19','YO21','YO22','YO23','YO24','YO25','YO26','YO30','YO31','YO32','YO41','YO42','YO43','YO51','YO60','YO61','YO62'],
  'Hertfordshire': ['AL1','AL2','AL3','AL4','AL5','AL6','AL7','AL8','AL9','AL10','AL11','CM15','CM20','CM21','CM22','CM23','CM24','EN1','EN2','EN3','EN4','EN5','EN6','EN7','EN8','EN9','EN10','EN11','HP1','HP2','HP3','HP4','HP5','HP6','HP7','HP8','HP9','HP10','HP11','HP12','HP13','HP14','HP15','HP16','HP17','HP18','HP19','HP20','HP21','HP22','HP23','HP27','SG1','SG2','SG3','SG4','SG5','SG6','SG7','SG8','SG9','SG10','SG11','SG12','SG13','SG14','SG15','SG16','SG17','SG18','SG19','WD1','WD2','WD3','WD4','WD5','WD6','WD7','WD17','WD18','WD19','WD23','WD24','WD25']
};

// Resolve an arbitrary area name (county/region/city/postcode) to district codes.
function resolveDistricts(area) {
  var a = String(area || '').trim();
  if (!a) return [];
  var key = a.charAt(0).toUpperCase() + a.slice(1);
  if (COUNTY_DISTRICTS[key]) return COUNTY_DISTRICTS[key].slice();
  // Already a district/sector-looking code (e.g. "L1", "SW11") -> use as-is.
  if (/^[A-Z]{1,2}\d/.test(a)) return [a.toUpperCase()];
  return [];
}

// Collect fresh planning applications from Plota for the ACTIVE customers'
// counties/areas only (Plota is a paid API, so we don't sweep the whole country
// - we query the districts inside the areas people actually want).
async function collectFresh(config) {
  if (!API_KEY) {
    console.log('[PLOTA] No API key configured — set PLOTA_API_KEY');
    return { leads: [], status: 'no_key', message: 'PLOTA_API_KEY not set' };
  }
  config = config || {};
  var freshnessHours = config.freshnessHours || 48;
  var now = new Date();
  var cutoff = new Date(now - freshnessHours * 3600000);
  var dateFrom = cutoff.toISOString().split('T')[0];
  // The counties/areas to collect for. If none passed, fall back to the customer
  // counties map used by the planning collector. (No more single-letter area codes
  // - Plota rejects them with HTTP 400.)
  var rawAreas = config.counties || config.areas || [];
  var districts = [];
  (Array.isArray(rawAreas) ? rawAreas : [rawAreas]).forEach(function(ar) {
    var d = resolveDistricts(ar);
    if (d.length) districts = districts.concat(d);
  });
  if (districts.length === 0) {
    // No explicit areas -> collect a broad but district-level national sweep so a
    // fresh customer's county is never starved. (Covers the main UK districts.)
    districts = [];
    Object.keys(COUNTY_DISTRICTS).forEach(function(c) { districts = districts.concat(COUNTY_DISTRICTS[c]); });
    // de-dup
    districts = districts.filter(function(v, i, s) { return s.indexOf(v) === i; });
  }

  var allApps = [];
  for (var ari = 0; ari < districts.length; ari++) {
    try {
      var dataPage = await apiRequest('/v1/applications?postcode=' + districts[ari] + '&date_from=' + dateFrom + '&limit=50');
      if (dataPage && dataPage.data && dataPage.data.length > 0) {
        allApps = allApps.concat(dataPage.data);
      }
      // Gentle pacing (Plota rate limit + paid credits).
      if (ari % 5 === 4) await new Promise(function(r) { setTimeout(r, 600); });
    } catch(ae) { /* skip a district that errors */ }
  }

  // Dedup by reference + council
  var seen = new Set();
  var leads = [];

  for (var ai = 0; ai < allApps.length; ai++) {
    var a = allApps[ai];
    var dedupKey = (a.authority ? a.authority.slug : '') + ':' + (a.reference || '');
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    var receivedDate = a.date_received || '';
    var validatedDate = a.date_validated || '';
    var pubDate = receivedDate || validatedDate;

    // Freshness check (server-side)
    if (pubDate && pubDate < dateFrom) continue;

    // Map category to trade
    var catLabel = a.category ? a.category.label : '';
    var trades = categoriseTrade(a.description, catLabel);

    leads.push({
      id: 'PLOTA_' + a.id,
      reference: a.reference || '',
      council: a.authority ? a.authority.name : '',
      address: a.address || '',
      postcode: a.postcode || '',
      proposal: (a.description || '').substring(0, 500),
      applicationType: a.planning_route || (a.category ? a.category.label : ''),
      category: a.category ? a.category.label : '',
      receivedDate: receivedDate,
      validatedDate: validatedDate,
      status: a.status || '',
      stage: a.stage || '',
      sourceUrl: a.links ? a.links.council || '' : '',
      plotaUrl: '',
      trades: trades,
      freshnessBadge: freshnessBadge(receivedDate, validatedDate),
      source: 'Planning Portal',
      location: a.location || null,
      scrapedAt: new Date().toISOString()
    });
  }

  console.log('[PLOTA] Total collected: ' + leads.length + ' applications (districts: ' + districts.length + ')');
  return { leads: leads, status: 'ok', message: leads.length + ' applications collected' };
}

// Health check
async function healthCheck() {
  if (!API_KEY) return { connected: false, message: 'No API key' };
  var result = await apiRequest('/v1/councils?limit=1');
  var ok = result && result.data && result.data.length > 0;
  return { connected: ok, message: ok ? 'Connected' : 'API returned unexpected response', councils: ok ? result.data.length : 0 };
}

// Register this provider
planningProvider.register('plota', { collectFresh, healthCheck });

module.exports = { collectFresh, healthCheck };
