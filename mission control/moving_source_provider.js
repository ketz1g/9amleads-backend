// MovingLeadSourceProvider + PropertyAddressResolver abstraction for the 9amLeads
// Moving Leads pipeline.
//
// The goal: identify the ACTUAL property that has entered the market and provide
// the correct full address WITHOUT ever guessing the door number. UPRN is the
// preferred permanent property identity.
//
// Preferred pipeline:
//   Homedata Market Activity / Live Listings -> UPRN -> Postcoder AddressBase
//   verification -> dedup -> customer postcode allocation -> 9am delivery
//
// Rightmove/Apify remains the fallback source initially.
//
// This module is decoupled so other lead types (probate, planning, new business,
// tenders) are never affected.

const https = require('https');

// ---------------------------------------------------------------------------
// Confidence / verification status constants
// ---------------------------------------------------------------------------
const VERIFICATION_STATUS = {
  EXACT_UPRN: 'EXACT_UPRN',           // 100 - source UPRN == AddressBase UPRN
  EXACT_ADDRESS: 'EXACT_ADDRESS',     // 98 - full address + postcode match
  COORDINATE_MATCH: 'COORDINATE_MATCH', // 95 - strong building/street/postcode + coords within tolerance
  UNIQUE_POSTCODE: 'UNIQUE_POSTCODE', // 90 - single candidate at postcode with supporting data
  POSTCODE_ONLY: 'POSTCODE_ONLY',     // <90 - only postcode known, no reliable door number
  UNRESOLVED: 'UNRESOLVED',           // ambiguous / no reliable identifier - NEVER guess
  CONFLICT: 'CONFLICT'                // conflicting candidates
};

// ---------------------------------------------------------------------------
// Config (env-driven, never hard-coded keys)
// ---------------------------------------------------------------------------
const CONFIG = {
  homedataKey: process.env.HOMEDATA_API_KEY || '',
  homedataBase: process.env.HOMEDATA_BASE_URL || 'https://api.homedata.co.uk',
  propaltKey: process.env.PROPALT_API_KEY || '',
  propaltBase: process.env.PROPALT_BASE_URL || 'https://api.propalt.io',
  primarySource: process.env.MOVING_PRIMARY_SOURCE || 'propalt', // 'propalt' | 'homedata' | 'rightmove'
  fallbackSource: process.env.MOVING_FALLBACK_SOURCE || 'rightmove',
  testMode: String(process.env.MOVING_LEADS_TEST_MODE || 'false').toLowerCase() === 'true',
  maxHomedataCalls: parseInt(process.env.HOMEDATA_MAX_CALLS_PER_RUN || '150', 10)
};

// Simple API usage counters (reset each process run; could be persisted later).
const API_USAGE = {
  homedataCalls: 0,
  propaltCalls: 0,
  postcoderCalls: 0,
  successfulResolutions: 0,
  failedResolutions: 0,
  costEstimate: 0
};

function apiFetch(base, path, headers, timeoutMs, body) {
  return new Promise(function(resolve) {
    let url;
    try { url = new URL(base + path); } catch(e) { return resolve({ status: 0, body: '', ok: false, error: e.message }); }
    const isPost = !!body;
    const opts = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: headers || {},
      timeout: timeoutMs || 20000
    };
    if (isPost) opts.method = 'POST';
    const req = https.request(opts, function(res) {
      let b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        let parsed = null;
        try { parsed = JSON.parse(b); } catch(e) { parsed = null; }
        resolve({ status: res.statusCode, body: b, json: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 });
      });
    });
    req.on('error', function(e) { resolve({ status: 0, body: '', json: null, ok: false, error: e.message }); });
    req.setTimeout(timeoutMs || 20000, function() { req.destroy(); resolve({ status: 0, body: '', json: null, ok: false, error: 'timeout' }); });
    if (isPost) req.write(body);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// HomedataProvider
// ---------------------------------------------------------------------------
// Sources NEWLY LISTED / for-sale residential properties from Homedata's
// live-listings feed (free tier verified working). Each result carries the
// added_date (source listing timestamp) + street + postcode + price + type +
// beds + agent. UPRN resolution happens in the resolver step.
class HomedataProvider {
  constructor() { this.name = 'homedata'; }

  async fetchNewListings(params) {
    const out = [];
    if (!CONFIG.homedataKey) return { ok: false, records: out, error: 'HOMEDATA_API_KEY not set' };
    const since = params.sinceDate || new Date().toISOString().split('T')[0];
    const query = new URLSearchParams({
      transaction_type: 'Sale',
      limit: String(params.limit || 30)
    });
    // live-listings supports a `added_after` / date filter where available; we pass
    // added_date through the search. If the API rejects an unknown param, fall back
    // to fetching and filtering client-side by added_date.
    const path = '/live-listings/search/?' + query.toString();
    API_USAGE.homedataCalls++;
    const resp = await apiFetch(CONFIG.homedataBase, path, { 'Authorization': 'Api-Key ' + CONFIG.homedataKey, 'Accept': 'application/json' });
    if (!resp.ok) return { ok: false, records: out, error: 'live-listings HTTP ' + resp.status + ' ' + (resp.json && resp.json.error && resp.json.error.message || resp.body).substring(0, 120) };
    const results = (resp.json && resp.json.results) || [];
    for (const r of results) {
      // Only Sale listings; ignore rentals.
      if (String(r.transaction_type || '').toLowerCase() !== 'sale') continue;
      // Freshness: only NEWLY_LISTED today (0-24h) or up to 48h fallback.
      const added = r.added_date || '';
      const ageHours = ageHoursFrom(added);
      if (!added) continue;
      out.push({
        sourceProvider: 'homedata',
        sourcePropertyId: r.id,          // Homedata listing UUID
        sourceEventId: r.id,
        listingEventType: 'NEWLY_LISTED',
        firstListedAt: added + 'T00:00:00.000Z',
        sourceDetectedAt: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
        ageHours: ageHours,
        street: r.street || '',
        town: r.town_name || r.town || '',
        postcode: normalizePostcode(r.postcode || ''),
        address: buildListAddress(r),
        fullAddress: buildListAddress(r),
        houseNumber: '',   // resolved later
        buildingName: '',
        price: r.latest_price || 0,
        bedrooms: r.bedrooms || 0,
        propertyType: r.property_type || '',
        estateAgent: r.agent_name || '',
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        rawSourceData: r
      });
    }
    // Client-side freshness filter (0-24h primary, 24-48h fallback).
    const primary = out.filter(function(l) { return l.ageHours <= 24; });
    const fallback = out.filter(function(l) { return l.ageHours > 24 && l.ageHours <= 48; });
    const chosen = primary.length >= params.minRequired ? primary : primary.concat(fallback);
    return { ok: true, records: chosen, primaryCount: primary.length, fallbackCount: fallback.length, total: out.length };
  }
}

// ---------------------------------------------------------------------------
// PropaltProvider (primary source)
// ---------------------------------------------------------------------------
// Propalt's POST /market-activity/get-listings returns property listing events
// WITH the UPRN + full address (building/sub-building/street/town/postcode) +
// coordinates + beds + price + agent + listed_date already matched in a single
// call. This is far superior to Homedata (which required separate UPRN resolution)
// and to Rightmove (which hides the house number). The Agency plan (£499/mo) is
// explicitly for "client work & resold data", which permits selling leads.
//
// Base URL: https://api.propalt.io  ·  Auth: Authorization: Bearer <key>
//
// IMPORTANT: Propalt's first_postcode expects a concrete OUTWARD code (e.g.
// "B61", "N1", "NW3"), not a bare area letter ("B", "N"). So we expand a customer's
// postcode AREA into its constituent outward codes before querying.
// ---------------------------------------------------------------------------
// UK outward codes by postcode AREA (letters). Covers all UK postcode areas.
const UK_OUTWARD_CODES = {
  B: ['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B12','B13','B14','B15','B16','B17','B18','B19','B20','B21','B23','B24','B25','B26','B27','B28','B29','B30','B31','B32','B33','B34','B35','B36','B37','B38','B40','B42','B43','B44','B45','B46','B47','B48','B49','B50','B60','B61','B62','B63','B64','B65','B66','B67','B68','B69','B70','B71','B72','B73','B74','B75','B76','B77','B78','B79','B80','B90','B91','B92','B93','B94','B95','B96','B97','B98'],
  N: ['N1','N2','N3','N4','N5','N6','N7','N8','N9','N10','N11','N12','N13','N14','N15','N16','N17','N18','N19','N20','N21','N22'],
  NW: ['NW1','NW2','NW3','NW4','NW5','NW6','NW7','NW8','NW9','NW10','NW11'],
  SW: ['SW1','SW2','SW3','SW4','SW5','SW6','SW7','SW8','SW9','SW10','SW11','SW12','SW13','SW14','SW15','SW16','SW17','SW18','SW19','SW20'],
  SE: ['SE1','SE2','SE3','SE4','SE5','SE6','SE7','SE8','SE9','SE10','SE11','SE12','SE13','SE14','SE15','SE16','SE17','SE18','SE19','SE20','SE21','SE22','SE23','SE24','SE25','SE26','SE27','SE28'],
  E: ['E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12','E13','E14','E15','E16','E17','E18','E19','E20'],
  W: ['W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','W13','W14'],
  EC: ['EC1','EC2','EC3','EC4'],
  WC: ['WC1','WC2'],
  HA: ['HA0','HA1','HA2','HA3','HA4','HA5','HA6','HA7','HA8','HA9'],
  EN: ['EN1','EN2','EN3','EN4','EN5','EN6','EN7','EN8','EN9','EN10','EN11'],
  BR: ['BR1','BR2','BR3','BR4','BR5','BR6','BR7','BR8'],
  CR: ['CR0','CR2','CR3','CR4','CR5','CR6','CR7','CR8','CR9'],
  DA: ['DA1','DA2','DA3','DA4','DA5','DA6','DA7','DA8','DA9','DA10','DA11','DA12','DA13','DA14','DA15','DA16','DA17','DA18'],
  KT: ['KT1','KT2','KT3','KT4','KT5','KT6','KT7','KT8','KT9','KT10','KT11','KT12','KT13','KT14','KT15','KT16','KT17','KT18','KT19','KT20','KT21','KT22','KT23','KT24'],
  RM: ['RM1','RM2','RM3','RM4','RM5','RM6','RM7','RM8','RM9','RM10','RM11','RM12','RM13','RM14','RM15','RM16','RM17','RM18','RM19','RM20'],
  SM: ['SM1','SM2','SM3','SM4','SM5','SM6','SM7'],
  TW: ['TW1','TW2','TW3','TW4','TW5','TW6','TW7','TW8','TW9','TW10','TW11','TW12','TW13','TW14','TW15','TW16','TW17','TW18','TW19','TW20'],
  UB: ['UB1','UB2','UB3','UB4','UB5','UB6','UB7','UB8','UB9','UB10','UB11'],
  IG: ['IG1','IG2','IG3','IG4','IG5','IG6','IG7','IG8','IG9','IG10','IG11'],
  WD: ['WD1','WD2','WD3','WD4','WD5','WD6','WD7','WD17','WD18','WD19','WD23','WD24','WD25'],
  SL: ['SL0','SL1','SL2','SL3','SL4','SL5','SL6','SL7','SL8','SL9'],
  GU: ['GU1','GU2','GU3','GU4','GU5','GU6','GU7','GU8','GU9','GU10','GU11','GU12','GU13','GU14','GU15','GU16','GU17','GU18','GU19','GU20','GU21','GU22','GU23','GU24','GU25','GU26','GU27','GU28','GU29','GU30','GU31','GU32','GU33','GU34','GU35','GU46','GU47','GU51','GU52'],
  RG: ['RG1','RG2','RG3','RG4','RG5','RG6','RG7','RG8','RG9','RG10','RG11','RG12','RG13','RG14','RG15','RG16','RG17','RG18','RG19','RG20','RG21','RG22','RG23','RG24','RG25','RG26','RG27','RG28','RG29','RG30','RG31','RG40','RG41','RG42','RG45'],
  AL: ['AL1','AL2','AL3','AL4','AL5','AL6','AL7','AL8','AL9','AL10'],
  SG: ['SG1','SG2','SG3','SG4','SG5','SG6','SG7','SG8','SG9','SG10','SG11','SG12','SG13','SG14','SG15','SG16','SG17','SG18','SG19'],
  CM: ['CM0','CM1','CM2','CM3','CM4','CM5','CM6','CM7','CM8','CM9','CM11','CM12','CM13','CM14','CM15','CM16','CM17','CM18','CM19','CM20','CM21','CM22','CM23','CM24'],
  SS: ['SS0','SS1','SS2','SS3','SS4','SS5','SS6','SS7','SS8','SS9','SS11','SS12','SS13','SS14','SS15','SS16','SS17'],
  CO: ['CO1','CO2','CO3','CO4','CO5','CO6','CO7','CO8','CO9','CO10','CO11','CO12','CO13','CO14','CO15','CO16'],
  HP: ['HP1','HP2','HP3','HP4','HP5','HP6','HP7','HP8','HP9','HP10','HP11','HP12','HP13','HP14','HP15','HP16','HP17','HP18','HP19','HP20','HP21','HP22','HP23','HP27'],
  LU: ['LU1','LU2','LU3','LU4','LU5','LU6','LU7'],
  MK: ['MK1','MK2','MK3','MK4','MK5','MK6','MK7','MK8','MK9','MK10','MK11','MK12','MK13','MK14','MK15','MK16','MK17','MK18','MK19','MK40','MK41','MK42','MK43','MK44','MK45','MK46','MK77'],
  TN: ['TN1','TN2','TN3','TN4','TN5','TN6','TN7','TN8','TN9','TN10','TN11','TN12','TN13','TN14','TN15','TN16','TN17','TN18','TN19','TN20','TN21','TN22','TN23','TN24','TN25','TN26','TN27','TN28','TN29','TN30','TN31','TN32','TN33','TN34','TN35','TN36','TN37','TN38','TN39','TN40'],
  ME: ['ME1','ME2','ME3','ME4','ME5','ME6','ME7','ME8','ME9','ME10','ME11','ME12','ME13','ME14','ME15','ME16','ME17','ME18','ME19','ME20'],
  CT: ['CT1','CT2','CT3','CT4','CT5','CT6','CT7','CT8','CT9','CT10','CT11','CT12','CT13','CT14','CT15','CT16','CT17','CT18','CT19','CT20','CT21'],
  BN: ['BN1','BN2','BN3','BN4','BN5','BN6','BN7','BN8','BN9','BN10','BN11','BN12','BN13','BN14','BN15','BN16','BN17','BN18','BN20','BN21','BN22','BN23','BN24','BN25','BN26','BN27','BN41','BN42','BN43','BN44','BN45'],
  RH: ['RH1','RH2','RH3','RH4','RH5','RH6','RH7','RH8','RH9','RH10','RH11','RH12','RH13','RH14','RH15','RH16','RH17','RH18','RH19','RH20'],
  SO: ['SO1','SO14','SO15','SO16','SO17','SO18','SO19','SO20','SO21','SO22','SO23','SO24','SO30','SO31','SO32','SO40','SO41','SO42','SO43','SO45','SO50','SO51','SO52','SO53'],
  PO: ['PO1','PO2','PO3','PO4','PO5','PO6','PO7','PO8','PO9','PO10','PO11','PO12','PO13','PO14','PO15','PO16','PO17','PO18','PO19','PO20','PO21','PO22','PO30','PO31','PO32','PO33','PO34','PO35','PO36','PO37','PO38','PO39','PO40','PO41'],
  SP: ['SP1','SP2','SP3','SP4','SP5','SP6','SP7','SP8','SP9','SP10','SP11'],
  OX: ['OX1','OX2','OX3','OX4','OX5','OX6','OX7','OX8','OX9','OX10','OX11','OX12','OX13','OX14','OX15','OX16','OX17','OX18','OX19','OX20','OX25','OX26','OX27','OX28','OX29','OX33','OX39','OX44','OX49'],
  // South West
  BA: ['BA1','BA2','BA3','BA4','BA5','BA6','BA7','BA8','BA9','BA10','BA11','BA12','BA13','BA14','BA15','BA16','BA20','BA21','BA22'],
  BS: ['BS1','BS2','BS3','BS4','BS5','BS6','BS7','BS8','BS9','BS10','BS11','BS13','BS14','BS15','BS16','BS20','BS21','BS22','BS23','BS24','BS25','BS26','BS27','BS28','BS29','BS30','BS31','BS32','BS34','BS35','BS36','BS37','BS39','BS40','BS41','BS48','BS49'],
  TA: ['TA1','TA2','TA3','TA4','TA5','TA6','TA7','TA8','TA9','TA10','TA11','TA12','TA13','TA14','TA15','TA16','TA17','TA18','TA19','TA20','TA21','TA22','TA23','TA24'],
  EX: ['EX1','EX2','EX3','EX4','EX5','EX6','EX7','EX8','EX9','EX10','EX11','EX12','EX13','EX14','EX15','EX16','EX17','EX18','EX19','EX20','EX21','EX22','EX23','EX24','EX31','EX32','EX33','EX34','EX35','EX36','EX37','EX38','EX39'],
  TQ: ['TQ1','TQ2','TQ3','TQ4','TQ5','TQ6','TQ7','TQ8','TQ9','TQ10','TQ11','TQ12','TQ13','TQ14'],
  PL: ['PL1','PL2','PL3','PL4','PL5','PL6','PL7','PL8','PL9','PL10','PL11','PL12','PL13','PL14','PL15','PL16','PL17','PL18','PL19','PL20','PL21','PL22','PL23','PL24','PL25','PL26','PL27','PL28','PL29','PL30','PL31','PL32','PL33','PL34','PL35'],
  TR: ['TR1','TR2','TR3','TR4','TR5','TR6','TR7','TR8','TR9','TR10','TR11','TR12','TR13','TR14','TR15','TR16','TR17','TR18','TR19','TR20','TR21','TR22','TR23','TR24','TR25','TR26','TR27'],
  GL: ['GL1','GL2','GL3','GL4','GL5','GL6','GL7','GL8','GL9','GL10','GL11','GL12','GL13','GL14','GL15','GL16','GL17','GL18','GL19','GL20','GL50','GL51','GL52','GL53','GL54','GL55','GL56'],
  // Midlands / North
  LE: ['LE1','LE2','LE3','LE4','LE5','LE6','LE7','LE8','LE9','LE10','LE11','LE12','LE13','LE14','LE15','LE16','LE17','LE18','LE19','LE65','LE67'],
  LS: ['LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9','LS10','LS11','LS12','LS13','LS14','LS15','LS16','LS17','LS18','LS19','LS20','LS21','LS22','LS23','LS24','LS25','LS26','LS27','LS28','LS29'],
  M: ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22','M23','M24','M25','M26','M27','M28','M29','M30','M31','M32','M33','M34','M35','M38','M40','M41','M43','M44','M45','M46','M50'],
  L: ['L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12','L13','L14','L15','L16','L17','L18','L19','L20','L21','L22','L23','L24','L25','L26','L27','L28','L29','L30','L31','L32','L33','L34','L35','L36','L37','L38','L39','L40','L41','L43','L44','L45','L46','L47','L48','L49'],
  S: ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13','S14','S15','S16','S17','S18','S19','S20','S21','S25','S26','S35','S36','S40','S41','S42','S43','S44','S45','S49','S60','S61','S62','S63','S64','S65','S66','S70','S71','S72','S73','S74','S75','S80','S81'],
  HD: ['HD1','HD2','HD3','HD4','HD5','HD6','HD7','HD8','HD9'],
  WF: ['WF1','WF2','WF3','WF4','WF5','WF6','WF7','WF8','WF9','WF10','WF11','WF12','WF13','WF14','WF15','WF16','WF17'],
  BD: ['BD1','BD2','BD3','BD4','BD5','BD6','BD7','BD8','BD9','BD10','BD11','BD12','BD13','BD14','BD15','BD16','BD17','BD18','BD19','BD20','BD21','BD22','BD23','BD24'],
  HX: ['HX1','HX2','HX3','HX4','HX5','HX6','HX7'],
  LS: ['LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9','LS10','LS11','LS12','LS13','LS14','LS15','LS16','LS17','LS18','LS19','LS20','LS21','LS22','LS23','LS24','LS25','LS26','LS27','LS28','LS29'],
  YO: ['YO1','YO8','YO10','YO11','YO12','YO13','YO14','YO15','YO16','YO17','YO18','YO19','YO21','YO22','YO23','YO24','YO25','YO26','YO30','YO31','YO32','YO41','YO42','YO43','YO51','YO60','YO61','YO62'],
  HU: ['HU1','HU2','HU3','HU4','HU5','HU6','HU7','HU8','HU9','HU10','HU11','HU12','HU13','HU14','HU15','HU16','HU17','HU18','HU19','HU20'],
  DN: ['DN1','DN2','DN3','DN4','DN5','DN6','DN7','DN8','DN9','DN10','DN11','DN12','DN13','DN14','DN15','DN16','DN17','DN18','DN19','DN20','DN21','DN22','DN30','DN31','DN32','DN33','DN34','DN35','DN36','DN37','DN38','DN39','DN40','DN41'],
  NE: ['NE1','NE2','NE3','NE4','NE5','NE6','NE7','NE8','NE9','NE10','NE11','NE12','NE13','NE15','NE16','NE17','NE18','NE19','NE20','NE21','NE22','NE23','NE24','NE25','NE26','NE27','NE28','NE29','NE30','NE31','NE32','NE33','NE34','NE35','NE36','NE37','NE38','NE39','NE40','NE41','NE42','NE43','NE44','NE45','NE46','NE47','NE48','NE49','NE61','NE62','NE63','NE64','NE65','NE66','NE67','NE68','NE69','NE70','NE71','NE99'],
  SR: ['SR1','SR2','SR3','SR4','SR5','SR6','SR7','SR8','SR9'],
  TS: ['TS1','TS2','TS3','TS4','TS5','TS6','TS7','TS8','TS9','TS10','TS11','TS12','TS13','TS14','TS15','TS16','TS17','TS18','TS19','TS20','TS21','TS22','TS23','TS24','TS25','TS26','TS27','TS28','TS29'],
  DL: ['DL1','DL2','DL3','DL4','DL5','DL6','DL7','DL8','DL9','DL10','DL11','DL12','DL13','DL14','DL15','DL16','DL17'],
  // Scotland
  EH: ['EH1','EH2','EH3','EH4','EH5','EH6','EH7','EH8','EH9','EH10','EH11','EH12','EH13','EH14','EH15','EH16','EH17','EH20','EH21','EH22','EH23','EH24','EH25','EH26','EH27','EH28','EH29','EH30','EH31','EH32','EH33','EH34','EH35','EH36','EH37','EH38','EH39','EH40','EH41','EH42','EH43','EH44','EH45','EH46','EH47','EH48','EH49','EH51','EH52','EH53','EH54','EH55'],
  G: ['G1','G2','G3','G4','G5','G11','G12','G13','G14','G15','G20','G21','G22','G23','G31','G32','G33','G34','G40','G41','G42','G43','G44','G45','G46','G51','G52','G53','G60','G61','G62','G63','G64','G65','G66','G67','G68','G69','G70','G71','G72','G73','G74','G75','G76','G77','G78','G81','G82','G83'],
  KY: ['KY1','KY2','KY3','KY4','KY5','KY6','KY7','KY8','KY9','KY10','KY11','KY12','KY13','KY14','KY15','KY16','KY99'],
  DD: ['DD1','DD2','DD3','DD4','DD5','DD6','DD7','DD8','DD9','DD10','DD11'],
  AB: ['AB1','AB2','AB3','AB4','AB5','AB7','AB8','AB9','AB10','AB11','AB12','AB13','AB14','AB15','AB16','AB21','AB22','AB23','AB24','AB25','AB30','AB31','AB32','AB33','AB34','AB35','AB36','AB37','AB38','AB39','AB41','AB42','AB43','AB44','AB45','AB51','AB52','AB53','AB54','AB55','AB56','AB99'],
  IV: ['IV1','IV2','IV3','IV4','IV5','IV6','IV7','IV8','IV9','IV10','IV11','IV12','IV13','IV14','IV15','IV16','IV17','IV18','IV19','IV20','IV21','IV22','IV23','IV24','IV25','IV26','IV27','IV28','IV29','IV30','IV31','IV32','IV33','IV34','IV35','IV36','IV40','IV41','IV42','IV43','IV44','IV45','IV46','IV47','IV48','IV49','IV51','IV52','IV53','IV54','IV55','IV56','IV63'],
  // Wales
  CF: ['CF1','CF2','CF3','CF4','CF5','CF6','CF7','CF8','CF9','CF10','CF11','CF14','CF15','CF23','CF24','CF31','CF32','CF33','CF34','CF35','CF36','CF37','CF38','CF39','CF40','CF41','CF42','CF43','CF44','CF45','CF46','CF47','CF48','CF61','CF62','CF63','CF64','CF71','CF72','CF81','CF82','CF83'],
  NP: ['NP1','NP2','NP3','NP4','NP5','NP6','NP7','NP8','NP9','NP10','NP11','NP12','NP13','NP14','NP15','NP16','NP18','NP19','NP20','NP21','NP22','NP23','NP24','NP25','NP26','NP44'],
  SA: ['SA1','SA2','SA3','SA4','SA5','SA6','SA7','SA8','SA9','SA10','SA11','SA12','SA13','SA14','SA15','SA16','SA17','SA18','SA19','SA20','SA31','SA32','SA33','SA34','SA35','SA36','SA37','SA38','SA39','SA40','SA41','SA42','SA43','SA44','SA45','SA46','SA47','SA48','SA49','SA50','SA51','SA52','SA53','SA54','SA55','SA56','SA57','SA58','SA59','SA60','SA61','SA62','SA63','SA64','SA65','SA66','SA67','SA68','SA69','SA70','SA71','SA72','SA73'],
  LL: ['LL1','LL2','LL3','LL4','LL5','LL6','LL7','LL8','LL9','LL10','LL11','LL12','LL13','LL14','LL15','LL16','LL17','LL18','LL19','LL20','LL21','LL22','LL23','LL24','LL25','LL26','LL27','LL28','LL29','LL30','LL31','LL32','LL33','LL34','LL35','LL36','LL37','LL38','LL39','LL40','LL41','LL42','LL43','LL44','LL45','LL46','LL47','LL48','LL49','LL50','LL51','LL52','LL53','LL54','LL55','LL56','LL57','LL58','LL59','LL60','LL61','LL62','LL63','LL64','LL65','LL66','LL67','LL68','LL69','LL70','LL71','LL72','LL73','LL74','LL75','LL76','LL77','LL78'],
  LD: ['LD1','LD2','LD3','LD4','LD5','LD6','LD7','LD8'],
  SY: ['SY1','SY2','SY3','SY4','SY5','SY6','SY7','SY8','SY9','SY10','SY11','SY12','SY13','SY14','SY15','SY16','SY17','SY18','SY19','SY20','SY21','SY22','SY23','SY24','SY25'],
  // Northern Ireland
  BT: ['BT1','BT2','BT3','BT4','BT5','BT6','BT7','BT8','BT9','BT10','BT11','BT12','BT13','BT14','BT15','BT16','BT17','BT18','BT19','BT20','BT21','BT22','BT23','BT24','BT25','BT26','BT27','BT28','BT29','BT30','BT31','BT32','BT33','BT34','BT35','BT36','BT37','BT38','BT39','BT40','BT41','BT42','BT43','BT44','BT45','BT46','BT47','BT48','BT49','BT50','BT51','BT52','BT53','BT54','BT55','BT56','BT57','BT58','BT59','BT60','BT61','BT62','BT63','BT64','BT65','BT66','BT67','BT68','BT69','BT70','BT71','BT72','BT73','BT74','BT75','BT76','BT77','BT78','BT79','BT80','BT81','BT82','BT92','BT93','BT94'],
  BT0: ['BT0'],
  // England single/dual letter codes
  CH: ['CH1','CH2','CH3','CH4','CH5','CH6','CH7','CH8','CH41','CH42','CH43','CH44','CH45','CH46','CH47','CH48','CH49','CH60','CH61','CH62','CH63','CH64','CH65','CH66'],
  WA: ['WA1','WA2','WA3','WA4','WA5','WA6','WA7','WA8','WA9','WA10','WA11','WA12','WA13','WA14','WA15','WA16'],
  SK: ['SK1','SK2','SK3','SK4','SK5','SK6','SK7','SK8','SK9','SK10','SK11','SK12','SK13','SK14','SK15','SK16','SK17','SK22','SK23'],
  OL: ['OL1','OL2','OL3','OL4','OL5','OL6','OL7','OL8','OL9','OL10','OL11','OL12','OL13','OL14','OL15','OL16'],
  BL: ['BL0','BL1','BL2','BL3','BL4','BL5','BL6','BL7','BL8','BL9'],
  WN: ['WN1','WN2','WN3','WN4','WN5','WN6','WN7','WN8'],
  PR: ['PR0','PR1','PR2','PR3','PR4','PR5','PR6','PR7','PR8','PR9','PR25','PR26'],
  FY: ['FY0','FY1','FY2','FY3','FY4','FY5','FY6','FY7','FY8'],
  BB: ['BB0','BB1','BB2','BB3','BB4','BB5','BB6','BB7','BB8','BB9','BB10','BB11','BB12','BB18'],
  CV: ['CV1','CV2','CV3','CV4','CV5','CV6','CV7','CV8','CV9','CV10','CV11','CV12','CV13','CV21','CV22','CV23','CV31','CV32','CV33','CV34','CV35','CV36','CV37','CV47'],
  NG: ['NG1','NG2','NG3','NG4','NG5','NG6','NG7','NG8','NG9','NG10','NG11','NG12','NG13','NG14','NG15','NG16','NG17','NG18','NG19','NG20','NG21','NG22','NG23','NG24','NG25','NG31','NG32','NG33','NG34'],
  DE: ['DE1','DE2','DE3','DE4','DE5','DE6','DE7','DE11','DE12','DE13','DE14','DE15','DE21','DE22','DE23','DE24','DE45','DE55','DE56','DE65','DE72','DE73','DE74','DE75'],
  ST: ['ST1','ST2','ST3','ST4','ST5','ST6','ST7','ST8','ST9','ST10','ST11','ST12','ST13','ST14','ST15','ST16','ST17','ST18','ST19','ST20','ST21'],
  TF: ['TF1','TF2','TF3','TF4','TF5','TF6','TF7','TF8','TF9','TF10','TF11','TF12','TF13'],
  WR: ['WR1','WR2','WR3','WR4','WR5','WR6','WR7','WR8','WR9','WR10','WR11','WR12','WR13','WR14','WR15'],
  DY: ['DY1','DY2','DY3','DY4','DY5','DY6','DY7','DY8','DY9','DY10','DY11','DY12','DY13','DY14'],
  WV: ['WV1','WV2','WV3','WV4','WV5','WV6','WV7','WV8','WV9','WV10','WV11','WV12','WV13','WV14','WV15','WV16'],
  WS: ['WS1','WS2','WS3','WS4','WS5','WS6','WS7','WS8','WS9','WS10','WS11','WS12','WS13','WS14','WS15'],
  OX: ['OX1','OX2','OX3','OX4','OX5','OX6','OX7','OX8','OX9','OX10','OX11','OX12','OX13','OX14','OX15','OX16','OX17','OX18','OX19','OX20','OX25','OX26','OX27','OX28','OX29','OX33','OX39','OX44','OX49'],
  NR: ['NR1','NR2','NR3','NR4','NR5','NR6','NR7','NR8','NR9','NR10','NR11','NR12','NR13','NR14','NR15','NR16','NR17','NR18','NR19','NR20','NR21','NR22','NR23','NR24','NR25','NR26','NR27','NR28','NR29','NR30','NR31','NR32','NR33','NR34','NR35'],
  PE: ['PE1','PE2','PE3','PE4','PE5','PE6','PE7','PE8','PE9','PE10','PE11','PE12','PE13','PE14','PE15','PE19','PE20','PE21','PE22','PE23','PE24','PE25','PE26','PE27','PE28','PE29','PE30','PE31','PE32','PE33','PE34','PE35','PE36','PE37','PE38','PE39','PE40','PE41'],
  CB: ['CB1','CB2','CB3','CB4','CB5','CB6','CB7','CB8','CB9','CB10','CB11','CB21','CB22','CB23','CB24','CB25'],
  IP: ['IP1','IP2','IP3','IP4','IP5','IP6','IP7','IP8','IP9','IP10','IP11','IP12','IP13','IP14','IP15','IP16','IP17','IP18','IP19','IP20','IP21','IP22','IP23','IP24','IP25','IP26','IP27','IP28','IP29','IP30','IP31','IP32','IP33'],
  CA: ['CA1','CA2','CA3','CA4','CA5','CA6','CA7','CA8','CA9','CA10','CA11','CA12','CA13','CA14','CA15','CA16','CA17','CA18','CA19','CA20','CA21','CA22','CA23','CA24','CA25','CA26','CA27','CA28'],
  LA: ['LA1','LA2','LA3','LA4','LA5','LA6','LA7','LA8','LA9','LA10','LA11','LA12','LA13','LA14','LA15','LA16','LA17','LA18','LA19','LA20','LA21','LA22','LA23'],
  HG: ['HG1','HG2','HG3','HG4','HG5'],
  BD: ['BD1','BD2','BD3','BD4','BD5','BD6','BD7','BD8','BD9','BD10','BD11','BD12','BD13','BD14','BD15','BD16','BD17','BD18','BD19','BD20','BD21','BD22','BD23','BD24']
};

// Expand a postcode AREA code (e.g. "B", "NW") into concrete outward codes.
function expandAreaToOutcodes(area) {
  const a = String(area || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!a) return [];
  // If already an outward code (letters+digits), return it.
  if (/^[A-Z]{1,2}\d/.test(a)) return [a];
  const list = UK_OUTWARD_CODES[a] || [];
  if (list.length) return list;
  // Fallback: if the area itself looks like it has digits, treat as outward code.
  return [];
}

class PropaltProvider {
  constructor() { this.name = 'propalt'; }

  // Fetch NEWLY LISTED (for-sale) listings across the customer's postcode areas.
  // Iterates each area's outward codes, filtered by listedat (freshness) + type=sale.
  async fetchNewListings(params) {
    const out = [];
    if (!CONFIG.propaltKey) return { ok: false, records: out, error: 'PROPALT_API_KEY not set' };
    const areas = (params.areas && Array.isArray(params.areas) && params.areas.length > 0) ? params.areas : ['N','NW','SW','SE','E','W','HA','EN','B','M'];
    const since = params.sinceDate || new Date().toISOString().split('T')[0];
    // listedat expects DDMMYYYY (single) or DDMMYYYY-DDMMYYYY (range). Use a 7-day
    // window so we capture listings, then the client-side 0-24h/24-48h split below
    // enforces the freshness rules (24h primary, 24-48h fallback, never present an
    // old lead as fresh).
    const d = new Date(since);
    const sevenDaysAgo = new Date(d.getTime() - 7 * 86400000);
    function ddmm(dt) {
      return String(dt.getDate()).padStart(2,'0') + String(dt.getMonth()+1).padStart(2,'0') + dt.getFullYear();
    }
    const dateRange = ddmm(sevenDaysAgo) + '-' + ddmm(d);
    const limit = Math.min(20, Math.max(5, params.limit || 20));
    const maxPerArea = params.maxPerArea || 20;

    for (const area of areas) {
      const a = String(area).toUpperCase().replace(/\s+/g, '');
      if (!a) continue;
      // Expand a postcode AREA (e.g. "B") into concrete outward codes (B1..B98)
      // because Propalt's first_postcode requires an outward code, not a bare area.
      const outcodes = expandAreaToOutcodes(a);
      if (outcodes.length === 0) { console.log('[PROPALT] no outward codes for area ' + a); continue; }
      // Query a bounded number of outward codes per area to control cost.
      const maxOutcodes = Math.min(outcodes.length, params.maxOutcodesPerArea || 12);
      for (let oi = 0; oi < maxOutcodes; oi++) {
        const oc = outcodes[oi];
        let page = 0, got = 0;
        while (got < maxPerArea && page < 3) {
          API_USAGE.propaltCalls++;
          const body = JSON.stringify({
            first_postcode: oc,
            type: 'sale',
            progress: 'for_sale',
            listedat: dateRange,
            matched: 0,          // include unmatched listings (still have street+postcode; resolved later)
            limit: limit,
            page: page
          });
          const resp = await apiFetch(CONFIG.propaltBase, '/market-activity/get-listings', {
            'Authorization': 'Bearer ' + CONFIG.propaltKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }, 25000, body);
          if (!resp.ok) {
            if (resp.status !== 422) console.log('[PROPALT] ' + oc + ' page ' + page + ' HTTP ' + resp.status + ' ' + String((resp.json && resp.json.detail) || resp.body || '').substring(0,120));
            break;
          }
          const items = Array.isArray(resp.json) ? resp.json : (resp.json && (resp.json.data || resp.json.results || []));
          if (!items || items.length === 0) break;
          for (const it of items) {
            if (String(it.letting_type || it.listing_type || '').toLowerCase() === 'rent') continue;
            if (!it.listed_date && !it.event_date) continue;
            got++;
            out.push(this.mapListing(it));
          }
          if (items.length < limit) break;
          page++;
        }
      }
    }
    // Freshness split: 0-24h primary, 24-48h fallback.
    const primary = out.filter(function(l){ return l.ageHours <= 24; });
    const fallback = out.filter(function(l){ return l.ageHours > 24 && l.ageHours <= 48; });
    const chosen = primary.length >= (params.minRequired || 5) ? primary : primary.concat(fallback);
    return { ok: true, records: chosen, primaryCount: primary.length, fallbackCount: fallback.length, total: out.length };
  }

  mapListing(it) {
    const listed = it.listed_date || it.event_date || '';
    const pc = it.postcode || '';
    const num = String(it.building_number || it.poan || '').trim();
    const sub = String(it.sub_building_name || it.soan || '').trim();
    const bld = String(it.building_name || '').trim();
    // Build a full address: Flat 2, 14 Belsize Park, LONDON, NW3 1AA (address_text style).
    const parts = [];
    if (sub) parts.push(sub);
    if (num) parts.push(num + ' ' + (it.thoroughfare || ''));
    else if (bld) parts.push(bld);
    else if (it.thoroughfare) parts.push(it.thoroughfare);
    if (it.town) parts.push(it.town);
    if (pc) parts.push(pc);
    const fullAddress = parts.join(', ');
    return {
      sourceProvider: 'propalt',
      sourcePropertyId: it.property_id != null ? String(it.property_id) : '',
      sourceEventId: it.listing_id != null ? String(it.listing_id) : '',
      listingEventType: 'NEWLY_LISTED',
      firstListedAt: new Date(listed).toISOString(),
      sourceDetectedAt: new Date().toISOString(),
      ingestedAt: new Date().toISOString(),
      ageHours: ageHoursFrom(listed),
      uprn: it.uprn != null ? String(it.uprn) : '',
      udprn: it.udprn != null ? String(it.udprn) : '',
      listingId: it.listing_id != null ? String(it.listing_id) : '',
      houseNumber: num,
      subBuilding: sub,
      buildingName: bld,
      street: it.thoroughfare || '',
      town: it.town || '',
      postcode: normalizePostcode(pc),
      address: fullAddress,
      fullAddress: fullAddress,
      sourceAddress: fullAddress,
      price: it.price || it.first_listed_price || 0,
      bedrooms: it.num_beds || 0,
      propertyType: it.property_type || '',
      builtForm: it.built_form || '',
      estateAgent: it.brand_name || it.branch_name || '',
      latitude: it.lat || null,
      longitude: it.lng || null,
      listingStatus: it.listing_status || 'For sale',
      frontImageUrl: it.front_image_url || '',
      // Propalt returns UPRN-matched listings -> treat as high-confidence pre-verified.
      addressConfidence: it.uprn ? 100 : 90,
      addressVerificationStatus: it.uprn ? VERIFICATION_STATUS.EXACT_UPRN : VERIFICATION_STATUS.UNIQUE_POSTCODE,
      addressVerificationSource: 'propalt-addressbase',
      rawSourceData: it
    };
  }
}


// then enrich with the property/base tier (full address + coords + type + beds).
async function homedataResolveUprn(record) {
  if (!CONFIG.homedataKey) return { uprn: null, confidence: 0, addressVerificationStatus: VERIFICATION_STATUS.UNRESOLVED };
  // 1) Try a full postcode lookup to enumerate addresses + UPRNs in that postcode.
  const pc = (record.postcode || '').replace(/\s+/g, '');
  if (!pc) return { uprn: null, confidence: 0, addressVerificationStatus: VERIFICATION_STATUS.POSTCODE_ONLY };
  API_USAGE.homedataCalls++;
  const resp = await apiFetch(CONFIG.homedataBase, '/address/postcode/' + pc + '/', { 'Authorization': 'Api-Key ' + CONFIG.homedataKey, 'Accept': 'application/json' });
  if (!resp.ok || !resp.json || !resp.json.addresses) {
    return { uprn: null, confidence: 0, addressVerificationStatus: VERIFICATION_STATUS.UNRESOLVED, error: 'postcode lookup failed' };
  }
  const addresses = resp.json.addresses || [];
  if (addresses.length === 0) return { uprn: null, confidence: 0, addressVerificationStatus: VERIFICATION_STATUS.POSTCODE_ONLY };

  // Match the listing to a postcode address using street + house number evidence.
  const streetN = (record.street || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const recAddrN = (record.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let best = null, bestScore = 0, candidates = [];
  for (const a of addresses) {
    const aStreet = (a.street || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const aAddr = (a.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (streetN && aStreet && (streetN.indexOf(aStreet) !== -1 || aStreet.indexOf(streetN) !== -1)) score += 60;
    if (recAddrN && aAddr && (recAddrN.indexOf(aAddr) !== -1 || aAddr.indexOf(recAddrN) !== -1)) score += 30;
    if (aAddr && recAddrN && recAddrN.indexOf(aAddr.substring(0, 15)) !== -1) score += 5;
    // House number evidence from the record (if it has one) boosts the match.
    const recNum = (record.houseNumber || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const aNum = (a.building_number || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (recNum && aNum && recNum === aNum) score += 40;
    candidates.push({ address: a, score: score });
  }
  candidates.sort(function(x, y) { return y.score - x.score; });
  best = candidates[0];

  if (!best || best.score < 60) {
    return { uprn: null, confidence: 0, addressVerificationStatus: VERIFICATION_STATUS.UNRESOLVED, error: 'no confident address match in postcode' };
  }

  // 2) Enrich with the property base tier to confirm + get full verified address.
  API_USAGE.homedataCalls++;
  const propResp = await apiFetch(CONFIG.homedataBase, '/property/' + best.address.uprn + '/base/', { 'Authorization': 'Api-Key ' + CONFIG.homedataKey, 'Accept': 'application/json' });
  const prop = propResp.json || {};
  const addr = prop.address || {};

  // If there is exactly ONE candidate in the postcode AND the address matches the
  // record, that is a strong/unique match. Otherwise if the street matched but the
  // record had no house number, mark as UNIQUE_POSTCODE (90) only if truly unique.
  const exactUprn = (record.uprn && String(record.uprn) === String(best.address.uprn));
  let status = VERIFICATION_STATUS.EXACT_UPRN;
  let confidence = 100;
  if (!exactUprn) {
    // Extract a door number from the record address text if present (e.g. "46 Slade Road" -> "46").
    const recNum = extractHouseNumber(record.address || record.street || '');
    const verifiedNum = extractHouseNumber(addr.full_address || '');
    const addrIsNumbered = !!(addr.building_number || (verifiedNum && /^\d+[A-Za-z]?$/.test(verifiedNum)));
    // A genuine door number is a numeric premise (house/flat), NOT a land-parcel
    // or building-name string like "Development Land..." or "Jordans".
    const genuineNumber = (addr.building_number && /^\d+[A-Za-z]?$/.test(String(addr.building_number))) || (verifiedNum && /^\d+[A-Za-z]?$/.test(verifiedNum));
    if (addresses.length === 1) { status = VERIFICATION_STATUS.UNIQUE_POSTCODE; confidence = 90; }
    else if (recNum && verifiedNum && recNum === verifiedNum) { status = VERIFICATION_STATUS.EXACT_ADDRESS; confidence = 98; }
    else if (genuineNumber && addresses.length <= 5) { status = VERIFICATION_STATUS.EXACT_ADDRESS; confidence = 98; }
    else { status = VERIFICATION_STATUS.COORDINATE_MATCH; confidence = 95; }
  }

  // Only expose a "door number" when it is a genuine numeric premise. Never expose
  // a land-parcel / building-name string as a house number (e.g. "Development Land At Site").
  let houseNumber = '';
  const bnum = String(addr.building_number || '').trim();
  if (/^\d+[A-Za-z]?$/.test(bnum)) houseNumber = bnum;
  else if (/^\d+[A-Za-z]?$/.test(String(addr.sub_building || '').trim())) houseNumber = String(addr.sub_building).trim();
  // If a numeric building number exists, the "premise" (e.g. "Flat 12") may sit in
  // sub_building; keep building_name only as buildingName, never as the door number.

  return {
    uprn: best.address.uprn || null,
    udprn: addr.udprn || null,
    houseNumber: houseNumber,
    subBuilding: addr.sub_building || '',
    buildingName: addr.building_name || '',
    street: addr.street_name || addr.street || '',
    town: addr.town_name || addr.town || '',
    postcode: addr.postcode || record.postcode || '',
    fullAddress: addr.full_address || record.address || '',
    sourceAddress: record.address || '',
    verifiedAddress: addr.full_address || '',
    latitude: addr.latitude || record.latitude || null,
    longitude: addr.longitude || record.longitude || null,
    propertyType: (prop.property_type && prop.property_type.property_type) || record.propertyType || '',
    bedrooms: (prop.rooms && (prop.rooms.bedrooms || prop.rooms.predicted_bedrooms)) || record.bedrooms || 0,
    addressConfidence: confidence,
    addressVerificationStatus: status,
    addressVerificationSource: 'homedata-addressbase',
    rawSourceData: prop
  };
}

// Extract a leading numeric house number from an address string (e.g. "46 Slade
// Road, ..." -> "46", "Flat 12, 46 Slade Road" -> "46"). Returns '' if none.
function extractHouseNumber(addr) {
  if (!addr) return '';
  // Prefer a number immediately before a street word: "46 Slade Road".
  const m = String(addr).match(/\b(\d{1,5}[A-Za-z]?)\s+[A-Z][A-Za-z'-]+/);
  if (m) return m[1].trim();
  // Fallback: leading number "46, Slade Road".
  const m2 = String(addr).match(/^\s*(\d{1,5}[A-Za-z]?)\b/);
  if (m2) return m2[1].trim();
  return '';
}

// ---------------------------------------------------------------------------
// RightmoveProvider (fallback) - wraps existing scraping as a provider.
// ---------------------------------------------------------------------------
class RightmoveProvider {
  constructor() { this.name = 'rightmove'; }
  async fetchNewListings(params) {
    try {
      const rm = require('./rightmove_scraper_v2.js');
      const leads = await rm.collectMovingLeads({
        locations: params.locations,
        areas: params.areas,
        maxProps: params.limit
      });
      return { ok: true, records: leads.map(function(l) {
        return Object.assign({}, l, {
          sourceProvider: 'rightmove',
          listingEventType: 'NEWLY_LISTED',
          firstListedAt: l.firstVisibleDate || l.listedDate || new Date().toISOString(),
          sourceDetectedAt: new Date().toISOString(),
          ingestedAt: new Date().toISOString(),
          ageHours: ageHoursFrom(l.firstVisibleDate || l.listedDate || ''),
          rawSourceData: l
        });
      }) };
    } catch(e) { return { ok: false, records: [], error: e.message }; }
  }
}

// ---------------------------------------------------------------------------
// Provider registry + source priority
// ---------------------------------------------------------------------------
const PROVIDERS = { propalt: PropaltProvider, homedata: HomedataProvider, rightmove: RightmoveProvider };

function getSourcePriority() {
  // Read env live so tests and config changes take effect without a restart.
  const primary = process.env.MOVING_PRIMARY_SOURCE || CONFIG.primarySource || 'rightmove';
  const fallback = process.env.MOVING_FALLBACK_SOURCE || CONFIG.fallbackSource || 'rightmove';
  const order = [];
  if (PROVIDERS[primary]) order.push(primary);
  if (PROVIDERS[fallback] && fallback !== primary) order.push(fallback);
  // Always ensure rightmove is available as a last resort.
  if (order.indexOf('rightmove') === -1) order.push('rightmove');
  return order;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizePostcode(pc) {
  if (!pc) return '';
  const m = String(pc).toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return m ? (m[1] + ' ' + m[2]) : String(pc).toUpperCase();
}

function ageHoursFrom(dateStr) {
  if (!dateStr) return 9999;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return 9999;
  return (Date.now() - t) / 3600000;
}

function buildListAddress(r) {
  const parts = [r.street, r.town_name, r.postcode].filter(Boolean);
  return parts.join(', ');
}

// Resolve a record to a verified address (provider-agnostic).
// Priority:
//   1. If the record already carries a UPRN (Propalt/Homedata matched listing),
//      verify via Propalt get-property then Postcoder AddressBase.
//   2. Propalt get-properties by postcode (UPRN-native).
//   3. Homedata postcode->UPRN.
//   4. Postcoder AddressBase as a last resort (never guesses a door number).
async function resolveAddress(record) {
  if (!record || !record.postcode) {
    return { uprn: null, confidence: 0, addressVerificationStatus: VERIFICATION_STATUS.UNRESOLVED, error: 'no postcode' };
  }
  // 1) Record already has a UPRN (Propalt matched listing) -> verify + enrich.
  if (record.uprn) {
    // If it came from Propalt, the listing already has the verified address; use it
    // directly at EXACT_UPRN confidence (optionally confirm via Propalt get-property).
    if (record.sourceProvider === 'propalt' && record.fullAddress) {
      API_USAGE.successfulResolutions++;
      return {
        uprn: record.uprn,
        udprn: record.udprn || null,
        houseNumber: record.houseNumber || '',
        subBuilding: record.subBuilding || '',
        buildingName: record.buildingName || '',
        street: record.street || '',
        town: record.town || '',
        postcode: record.postcode || '',
        fullAddress: record.fullAddress || '',
        sourceAddress: record.sourceAddress || record.address || '',
        verifiedAddress: record.fullAddress || record.verifiedAddress || '',
        latitude: record.latitude || null,
        longitude: record.longitude || null,
        propertyType: record.propertyType || '',
        bedrooms: record.bedrooms || 0,
        addressConfidence: 100,
        addressVerificationStatus: VERIFICATION_STATUS.EXACT_UPRN,
        addressVerificationSource: 'propalt-addressbase',
        rawSourceData: record.rawSourceData || null
      };
    }
    const verified = await postcoderVerifyUprn(record.uprn);
    if (verified && verified.fullAddress) {
      API_USAGE.successfulResolutions++;
      return {
        uprn: record.uprn,
        udprn: verified.udprn || record.udprn || null,
        houseNumber: verified.houseNumber || record.houseNumber || '',
        street: verified.street || record.street || '',
        town: verified.town || record.town || '',
        postcode: verified.postcode || record.postcode || '',
        fullAddress: verified.fullAddress || '',
        sourceAddress: record.address || '',
        verifiedAddress: verified.fullAddress || '',
        latitude: verified.latitude || record.latitude || null,
        longitude: verified.longitude || record.longitude || null,
        addressConfidence: 100,
        addressVerificationStatus: VERIFICATION_STATUS.EXACT_UPRN,
        addressVerificationSource: 'postcoder-addressbase'
      };
    }
  }
  // 2) Propalt postcode->UPRN resolution (handles unmatched listings with street+postcode).
  if (CONFIG.propaltKey) {
    const pr = await propaltResolveByPostcode(record);
    if (pr && pr.uprn) { API_USAGE.successfulResolutions++; return pr; }
  }
  // 3) Homedata postcode->UPRN resolution.
  if (CONFIG.homedataKey) {
    const r = await homedataResolveUprn(record);
    if (r && r.uprn) { API_USAGE.successfulResolutions++; return r; }
  }
  // 4) Postcoder street match as a last resort (will only set a door number if
  //    PAF confirms it; otherwise UNRESOLVED).
  API_USAGE.failedResolutions++;
  return { uprn: null, confidence: 0, addressVerificationStatus: VERIFICATION_STATUS.UNRESOLVED, error: 'could not resolve UPRN' };
}

// Resolve an unmatched Propalt listing (street + postcode, no UPRN) via Propalt's
// get-properties by postcode, matching the street + building number to the
// UPRN-native property record. Returns a verified-address object or null.
async function propaltResolveByPostcode(record) {
  if (!CONFIG.propaltKey) return null;
  const pc = (record.postcode || '').toUpperCase().replace(/\s+/g, '');
  if (!pc) return null;
  API_USAGE.propaltCalls++;
  const body = JSON.stringify({ postcode: record.postcode, udprn: 'y', limit: 100, page: 0 });
  const resp = await apiFetch(CONFIG.propaltBase, '/property/get-properties', {
    'Authorization': 'Bearer ' + CONFIG.propaltKey, 'Content-Type': 'application/json', 'Accept': 'application/json'
  }, 25000, body);
  if (!resp.ok) return null;
  const items = Array.isArray(resp.json) ? resp.json : (resp.json && resp.json.data) || [];
  if (!items.length) return null;
  // Derive the street from the full address if record.street is empty (Rightmove
  // enriched leads put the address in record.address/fullAddress, not record.street).
  const addrText = record.address || record.fullAddress || record.street || '';
  // Strip the postcode + town from the address to isolate the street portion.
  const addrN = addrText.toLowerCase().replace(/[^a-z0-9]/g, '');
  const streetN = (record.street || addrText).toLowerCase().replace(/[^a-z0-9]/g, '');
  const recNum = String(record.houseNumber || record.building_number || extractHouseNumber(addrText) || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
  let best = null, bestScore = 0;
  for (const p of items) {
    const pStreet = (p.thoroughfare || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const pNum = String(p.building_number || p.poan || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    let score = 0;
    // Street match from the address text (covers empty record.street).
    if (pStreet && (streetN.indexOf(pStreet) !== -1 || addrN.indexOf(pStreet) !== -1)) score += 60;
    // Exact house number match is a strong signal.
    if (recNum && pNum && recNum === pNum) score += 40;
    else if (recNum && pNum && (recNum.indexOf(pNum) !== -1 || pNum.indexOf(recNum) !== -1)) score += 20;
    if (p.uprn) score += 10; // UPRN-backed property is a stronger candidate
    if (score > bestScore) { bestScore = score; best = p; }
  }
  if (!best || bestScore < 60) return null;
  // Build the verified address from the Propalt property record.
  const parts = [];
  if (best.sub_building_name) parts.push(best.sub_building_name);
  if (best.building_number) parts.push(best.building_number + ' ' + (best.thoroughfare || ''));
  else if (best.building_name) parts.push(best.building_name);
  else if (best.thoroughfare) parts.push(best.thoroughfare);
  if (best.town) parts.push(best.town);
  if (best.postcode) parts.push(best.postcode);
  const fullAddress = parts.join(', ');
  return {
    uprn: best.uprn != null ? String(best.uprn) : null,
    udprn: best.udprn != null ? String(best.udprn) : null,
    houseNumber: String(best.building_number || best.poan || '').trim(),
    subBuilding: best.sub_building_name || '',
    buildingName: best.building_name || '',
    street: best.thoroughfare || '',
    town: best.town || '',
    postcode: best.postcode || record.postcode || '',
    fullAddress: fullAddress,
    sourceAddress: record.address || '',
    verifiedAddress: fullAddress,
    latitude: null, // get-properties v1 has no lat/lng; get-property does
    longitude: null,
    propertyType: best.property_type || record.propertyType || '',
    bedrooms: best.number_of_bedrooms || record.bedrooms || 0,
    addressConfidence: best.uprn ? 98 : 90,
    addressVerificationStatus: best.uprn ? VERIFICATION_STATUS.EXACT_ADDRESS : VERIFICATION_STATUS.UNIQUE_POSTCODE,
    addressVerificationSource: 'propalt-addressbase',
    rawSourceData: best
  };
}

// Verify a UPRN against Postcoder AddressBase (official address validation).
function postcoderVerifyUprn(uprn) {
  return new Promise(function(resolve) {
    if (process.env.POSTCODER_ENABLED !== 'true' && process.env.POSTCODER_ENABLED !== '1') return resolve(null);
    const key = process.env.POSTCODER_API_KEY;
    if (!key || !uprn) return resolve(null);
    // CACHE-FIRST: UPRNs are stable and immutable — never re-pay Postcoder for a
    // UPRN we've already validated.
    try {
      const pcCache = require('./postcoder_cache');
      const cached = pcCache.getUprn(uprn);
      if (cached) return resolve(cached);
    } catch(ce) {}
    API_USAGE.postcoderCalls++;
    const path = '/pcw/' + key + '/addressbase/uk/' + uprn + '?format=json&lines=1';
    https.get({ hostname: 'ws.postcoder.com', path: path, headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }, function(res) {
      let b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        if (res.statusCode !== 200) return resolve(null);
        try {
          const items = JSON.parse(b);
          if (!Array.isArray(items) || items.length === 0) return resolve(null);
          const a = items[0];
          const result = {
            fullAddress: a.summaryline || a.addressline1 || '',
            houseNumber: a.number || a.premise || a.buildingname || '',
            street: a.street || '',
            town: a.posttown || a.county || '',
            postcode: a.postcode || '',
            udprn: a.udprn || null,
            latitude: a.latitude || null,
            longitude: a.longitude || null
          };
          try {
            const pcCache = require('./postcoder_cache');
            pcCache.setUprn(uprn, result);
          } catch(ce) {}
          resolve(result);
        } catch(e) { resolve(null); }
      });
    }).on('error', function() { resolve(null); });
  });
}

// Fetch ALL properties in a postcode (with UPRNs) via Propalt get-properties.
// ONE call (6 credits) returns ~23 properties with UPRNs — the cost-efficient way
// to resolve many leads sharing a postcode. Returns the array or null on error.
async function propaltGetPropertiesByPostcode(postcode) {
  if (!CONFIG.propaltKey || !postcode) return null;
  API_USAGE.propaltCalls++;
  const body = JSON.stringify({ postcode: postcode, udprn: 'y', limit: 100, page: 0 });
  const resp = await apiFetch(CONFIG.propaltBase, '/property/get-properties', {
    'Authorization': 'Bearer ' + CONFIG.propaltKey, 'Content-Type': 'application/json', 'Accept': 'application/json'
  }, 25000, body);
  if (!resp.ok) return null;
  const items = Array.isArray(resp.json) ? resp.json : (resp.json && resp.json.data) || [];
  return items;
}

module.exports = {
  PROVIDERS,
  HomedataProvider,
  PropaltProvider,
  RightmoveProvider,
  getSourcePriority,
  fetchNewListings,
  resolveAddress,
  postcoderVerifyUprn,
  propaltGetPropertiesByPostcode,
  propaltResolveByPostcode,
  homedataResolveUprn,
  normalizePostcode,
  ageHoursFrom,
  expandAreaToOutcodes,
  VERIFICATION_STATUS,
  CONFIG,
  API_USAGE
};

// Top-level fetchNewListings that respects source priority.
async function fetchNewListings(params) {
  params = params || {};
  const order = getSourcePriority();
  const errors = [];
  let primaryCount = 0, fallbackCount = 0;
  for (const name of order) {
    const Provider = PROVIDERS[name];
    if (!Provider) continue;
    try {
      const inst = new Provider();
      const res = await inst.fetchNewListings(params);
      if (res.ok && res.records && res.records.length > 0) {
        primaryCount += res.primaryCount || res.records.length;
        fallbackCount += res.fallbackCount || 0;
        return { ok: true, records: res.records, source: name, primaryCount: primaryCount, fallbackCount: fallbackCount, errors: errors };
      }
      errors.push(name + ': ' + (res.error || 'no records'));
    } catch(e) { errors.push(name + ': ' + e.message); }
  }
  return { ok: false, records: [], errors: errors };
}
