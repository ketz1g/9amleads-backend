/**
 * 9amLeads Lead Distributor
 *
 * BRIDGES the gap between scraper output files and the central delivery system.
 * 
 * Pipeline:
 *   6:00 AM  → Scrapers run (write to product-specific JSON files)
 *   6:30 AM  → Lead Distributor runs (this script)
 *             → Reads per-product leads from data/{product}-leads.json
 *             → Reads customers from data/database.json
 *             → Matches leads to customers by product + target area
 *             → Inserts matched leads into database.json `leads` table with customer_id
 *   9:00 AM  → Production API cron sends emails from database.json leads
 *
 * Usage:
 *   node lead_distributor.js                 Distribute all products
 *   node lead_distributor.js --product moving Distribute one product
 *   node lead_distributor.js --status         Show summary
 *   node lead_distributor.js --force          Redistribute delivered leads too
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const POSTCODE_ASSIGNMENTS_FILE = path.join(DATA_DIR, 'postcode-assignments.json');

// Per-product daily plan limits (mirrors production getPlanLimit).
// keyed [product][plan][coverage] with 'default' fallback.
const PRODUCT_PLAN_LIMITS = {
  moving:    { free_trial:{default:5,postcode:5,county:5,region:5,ukwide:5},   starter:{default:5,postcode:5,county:5,region:5},   pro:{default:15,postcode:15,county:15,region:15},   enterprise:{default:30,postcode:30,county:30,region:30} },
  probate:   { free_trial:{default:5,county:5,region:5,ukwide:5},              starter:{default:5,county:5,region:5,ukwide:5},    pro:{default:15,county:15,region:15,ukwide:15},    enterprise:{default:30,county:30,region:30,ukwide:30} },
  newbusiness:{ free_trial:{default:5,postcode:5,county:5,region:5},           starter:{default:5,postcode:5,county:5,region:5},     pro:{default:10,postcode:10,county:10,region:10},      enterprise:{default:20,postcode:20,county:20,region:20} },
  planning:  { free_trial:{default:5,county:5,region:5,ukwide:5},              starter:{default:5,county:5,region:5,ukwide:5},     pro:{default:3,county:3,region:3,ukwide:3},        enterprise:{default:5,county:5,region:5,ukwide:5} },
  tenders:   { free_trial:{default:5,county:5,region:5,ukwide:5},              starter:{default:5,county:5,region:5,ukwide:5},     pro:{default:3,county:3,region:3,ukwide:3},        enterprise:{default:5,county:5,region:5,ukwide:5} }
};
// Per-product coverage that respects postcode areas (else county/region/ukwide)
const PRODUCT_COVERAGE_DEFAULT = { moving:'postcode', newbusiness:'postcode', probate:'county', planning:'county', tenders:'county' };
function distributorPlanLimit(product, plan, coverage) {
  var rules = PRODUCT_PLAN_LIMITS[product] || PRODUCT_PLAN_LIMITS.moving;
  var planKey = plan === 'essential' ? 'starter' : (plan || 'starter');
  var covKey = coverage || PRODUCT_COVERAGE_DEFAULT[product] || 'default';
  var planLimits = rules[planKey] || rules.starter;
  return planLimits[covKey] !== undefined ? planLimits[covKey] : (planLimits.default !== undefined ? planLimits.default : 5);
}

function loadPostcodeAssignments() {
  try { return JSON.parse(fs.readFileSync(POSTCODE_ASSIGNMENTS_FILE, 'utf-8')); }
  catch { return { assignments: {} }; }
}

// Extract postcode district from a full postcode: "SW1A 1AA" -> "SW1"
function extractDistrict(pc) {
  if (!pc) return '';
  // Use outcode if there's a space (standard format: "SW1A 1AA" -> outcode "SW1A")
  if (pc.includes(' ')) {
    const outcode = pc.split(' ')[0].toLowerCase();
    // Strip trailing letter from outcode to get district: "sw1a" -> "sw1"
    return outcode.replace(/[a-z]+$/, '');
  }
  // No space - try regex with non-greedy digits
  const cleaned = pc.toLowerCase().replace(/[^a-z0-9]/g, '');
  const match = cleaned.match(/^([a-z]+[0-9]{1,2})/);
  return match ? match[1] : cleaned.substring(0, 3);
}

// Check if a lead's postcode is exclusively claimed by a specific customer (sector-aware)
function getExclusiveClaimant(lead, product) {
  const assignments = loadPostcodeAssignments();
  const leadPostcode = lead.postcode || lead.address || lead.location || '';
  const leadNorm = normalisePostcode(leadPostcode);
  if (!leadNorm) return null;

  // Find the longest prefix match among active claims
  let bestMatch = null;
  let bestLength = 0;
  for (const [code, assignment] of Object.entries(assignments.assignments)) {
    if (assignment.status !== 'active') continue;
    if (assignment.product !== product) continue;
    const codeNorm = normalisePostcode(code);
    if (!codeNorm) continue;
    if (extractPostcodeArea(lead.postcode || lead.address || '') === extractPostcodeArea(assignment.postcode || '')) {
      bestMatch = assignment.customer_id;
      bestLength = codeNorm.length;
    }
  }
  return bestMatch;
}

// Product-specific lead files (output by scrapers)
const PRODUCT_LEAD_FILES = {
  moving: { file: 'moving-leads.json', key: 'customerId' },
  probate: { file: 'probate-leads.json', key: 'customerId' },
  newbusiness: { file: 'newbusiness-leads.json', key: 'customerId' },
  planning: { file: 'planning-leads.json', key: 'customerId' },
  tenders: { file: 'tenders-leads.json', key: 'customerId' },
};

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return null; }
}

function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function getTodayStr() {
  return new Date().toISOString().split('T')[0];
}

// Returns today's 09:00 UK release time (ISO). Leads are hidden from dashboards
// until this moment so they appear at the same time the 9am email is sent.
function getReleaseAt() {
  try {
    const uk = new Date(new Date().toLocaleString('en-GB', { timeZone: 'Europe/London' }));
    uk.setHours(9, 0, 0, 0);
    return uk.toISOString();
  } catch(e) { return new Date().toISOString(); }
}

// Normalise a postcode for matching: "SW1A 1AA" → "sw1a"
function normalisePostcode(pc) {
  if (!pc) return '';
  return pc.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function extractPostcodeArea(pc) {
  if (!pc) return '';
  var s = String(pc).toUpperCase().trim();
  // If the string contains a full postcode (possibly inside an address), extract it first
  var m = s.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/);
  if (m) s = m[0];
  // Take the leading letters up to the first digit
  var out = s.replace(/[^A-Z].*$/, '');
  // Validate: postcode areas are 1-4 letters (e.g. B, BA, SW, NW, EC, DN, ...)
  return out.length >= 1 && out.length <= 4 ? out : '';
}

// Extract district from postcode: "SW1A 1AA" → "sw1"
function normaliseDistrict(pc) {
  if (!pc) return '';
  return extractDistrict(pc);
}

// Get per-product config if available, else fall back to customer-level fields
function getProductConfig(customer, product) {
  var config = {};
  try { config = JSON.parse(customer.product_config || '{}'); } catch(e) {}
  var prodCfg = config[product] || {};
  return {
    targets: prodCfg.target_areas ? JSON.parse(prodCfg.target_areas) : (JSON.parse(customer.target_areas || '[]')),
    coverage: prodCfg.coverage || customer.coverage || 'postcode'
  };
}

// Check if a lead's location matches a customer's target area (with filter tiering)
function leadMatchesTarget(lead, customer, product) {
  var pc = getProductConfig(customer, product);
  const targets = pc.targets;
  const coverage = pc.coverage;
  // Area match — match by city/county/region name
  let areaMatch = false;
  if (targets.length > 0) {
    // Check if targets are postcode area codes (1-2 letters) or city names
    var isPostcodeArea = targets.every(function(a) { return /^[A-Z]{1,3}$/i.test(a); });
    if (isPostcodeArea && product === 'moving') {
      // STRICT postcode-area matching for moving leads: only match leads whose
      // postcode area is exactly one of the customer's requested areas (e.g. B, EN, NW).
      const leadPC = (lead.postcode || '').toUpperCase();
      const leadArea = extractPostcodeArea(leadPC);
      for (const area of targets) {
        const areaCode = extractPostcodeArea(area);
        if (leadArea && leadArea === areaCode) { areaMatch = true; break; }
      }
    } else {
      // City/region matching for all other products (probate, planning, tenders,
      // newbusiness). These leads often carry the address/town text rather than a
      // clean postcode area, so match on location text + county mapping.
      const isPostcodeAreaAny = targets.every(function(a) { return /^[A-Z]{1,3}$/i.test(a); });
      // Normalise hyphens/spaces so county names match either way (e.g. the area
      // "greater-london" matches lead text "Greater London"). Used for tenders and
      // other county/region products.
      function normCounty(s) { return String(s || '').toLowerCase().replace(/[\s-]+/g, ' ').trim(); }
      var leadText = ((lead.city || '') + ' ' + (lead.address || '') + ' ' + (lead.name || '') + ' ' + (lead.postcode || '') + ' ' + (lead.location || '')).toLowerCase();
      var leadTextNorm = normCounty(leadText);
      for (const area of targets) {
        var areaLower = (area || '').toLowerCase().trim();
        if (!areaLower || areaLower === 'all uk' || areaLower === 'all-uk' || areaLower === 'ukwide' || areaLower === 'united kingdom' || areaLower === 'uk' || coverage === 'ukwide') { areaMatch = true; break; }
        // County/region targets (e.g. "greater-london", "kent", "essex"): match the
        // lead's location/buyer text against the county name (hyphen/space tolerant).
        if (!isPostcodeAreaAny && areaLower.length >= 3) {
          var areaNorm = normCounty(areaLower);
          if (areaNorm.length >= 3 && leadTextNorm.indexOf(areaNorm) !== -1) { areaMatch = true; break; }
        }
        // Postcode-area targets (e.g. B, EN, NW, G, BA): STRICT postcode matching.
        // Never do loose "includes()" text matching for these — a single-letter area
        // like "G" would match the letter 'g' inside any word (e.g. "building"),
        // delivering leads from every region to the customer.
        if (isPostcodeAreaAny) {
          var areaCodeUpper = (area || '').toUpperCase();
          var leadAll = leadText + ' ' + (lead.postcode || '');
          // Match the EXACT postcode area code (e.g. "BA", "G", "TQ") followed by
          // a digit — NOT a wildcard. Previously each letter was turned into [A-Z],
          // so "BA" matched any two-letter postcode area (KT, WR, TS...) and leads
          // were delivered to customers outside their chosen areas.
          var escArea = areaCodeUpper.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          var pcRe = new RegExp('\\b' + escArea + '\\s?[0-9]', 'i');
          if (pcRe.test(leadAll)) { areaMatch = true; break; }
          var areaTownMap = {
            'B': 'birmingham', 'EN': 'enfield', 'NW': 'london', 'SW': 'london', 'SE': 'london',
            'M': 'manchester', 'L': 'liverpool', 'LS': 'leeds', 'S': 'sheffield', 'BS': 'bristol',
            'NG': 'nottingham', 'LE': 'leicester', 'CF': 'cardiff', 'EH': 'edinburgh',
            'G': 'glasgow', 'BT': 'belfast', 'CM': 'essex', 'CO': 'essex', 'SS': 'essex',
            'AL': 'hertfordshire', 'HP': 'hertfordshire', 'SG': 'hertfordshire', 'WD': 'hertfordshire',
            'CT': 'kent', 'DA': 'kent', 'ME': 'kent', 'TN': 'kent', 'GU': 'surrey', 'KT': 'surrey',
            'RH': 'surrey', 'SM': 'surrey', 'TW': 'surrey', 'CR': 'surrey', 'IG': 'essex', 'UB': 'london',
            'HA': 'london', 'BR': 'london', 'RM': 'london', 'W': 'london', 'E': 'london', 'N': 'london',
            'EC': 'london', 'WC': 'london'
          };
          // Town-name match is only a hint — it MUST be confirmed by the lead's
          // postcode area actually matching the requested area code (e.g. NW +
          // "London" must NOT match a lead whose postcode is SW11).
          if (areaTownMap[areaCodeUpper] && leadText.includes(areaTownMap[areaCodeUpper])) {
            var townPc = extractPostcodeArea(lead.postcode || '');
            var areaLen = areaCodeUpper.length;
            if (townPc) {
              var areaMatchCond = townPc === areaCodeUpper;
              // Single-letter areas (E, N, W, S, B...) also cover their two-letter
              // variants (E1, EC1, N1, NW1, W1, WC1...). Two-letter areas are exact.
              if (areaLen === 1) {
                areaMatchCond = townPc === areaCodeUpper || townPc.indexOf(areaCodeUpper) === 0;
              }
              if (areaMatchCond) { areaMatch = true; break; }
            }
          }
        }
        // County/region-to-postcode matching: check if the lead's postcode area
        // falls within the target county or region.
        if (!areaMatch && lead.postcode) {
          var pcCode = extractPostcodeArea(lead.postcode);
          var countyPostcodes = {
            'essex': ['CM','CO','SS','IG'],'hertfordshire':['AL','EN','HP','SG','WD'],'kent':['CT','DA','ME','TN'],
            'surrey':['CR','GU','KT','RH','SM','TW'],'sussex':['BN','RH','TN'],'hampshire':['GU','PO','SO','SP','RG'],
            'berkshire':['RG','SL'],'buckinghamshire':['HP','MK','SL'],'oxfordshire':['OX'],'bedfordshire':['LU','MK'],
            'cambridgeshire':['CB','PE'],'norfolk':['IP','NR','PE'],'suffolk':['CO','IP','NR'],
            'london':['E','EC','N','NW','SE','SW','W','WC','BR','CR','DA','EN','HA','IG','KT','RM','SM','TN','TW','UB'],
            'greater-london':['E','EC','N','NW','SE','SW','W','WC','BR','CR','DA','EN','HA','IG','KT','RM','SM','TN','TW','UB'],
            'birmingham':['B'],'manchester':['M'],'liverpool':['L'],'leeds':['LS'],'sheffield':['S'],
            'bristol':['BS'],'nottingham':['NG'],'leicester':['LE'],'cardiff':['CF'],'edinburgh':['EH'],
            'glasgow':['G'],'belfast':['BT'],'cheshire':['CH','WA'],'lancashire':['BB','BL','FY','LA','PR'],
            'north-east':['DH','DL','NE','SR','TS'],'north-west':['BB','BL','CH','CW','FY','L','LA','M','OL','PR','SK','WA','WN'],
            'yorkshire':['BD','HD','HG','HU','HX','LS','S','WF','YO'],'yorkshire-and-the-humber':['BD','HD','HG','HU','HX','LS','S','WF','YO'],
            'east-midlands':['DE','DN','LE','LN','NG','NN','PE'],'west-midlands-region':['B','CV','DY','HR','ST','SY','TF','WR','WS','WV'],
            'east-of-england':['AL','CB','CM','CO','HP','IP','LU','NR','PE','SG','SS'],'south-east':['BN','CT','DA','GU','HP','KT','ME','MK','OX','PO','RG','RH','SL','SN','SO','SS','TN','TW'],
            'south-west':['BA','BS','DT','EX','GL','PL','SN','SP','TA','TQ','TR'],'wales':['CF','LD','LL','NP','SA','SY']
          };
          // Try exact, then match any key that CONTAINS the area name.
          // Guard: never substring-match a single-letter area code (e.g. "G" would
          // match inside "greater-london"), which wrongly allows any region.
          var countyKeys = Object.keys(countyPostcodes);
          if (countyPostcodes[areaLower] && countyPostcodes[areaLower].indexOf(pcCode) >= 0) { areaMatch = true; break; }
          if (!areaMatch) {
            for (var ck = 0; ck < countyKeys.length; ck++) {
              var countyKey = countyKeys[ck];
              var keysOverlap = areaLower.length >= 2 && countyKey.length >= 2 && (areaLower.indexOf(countyKey) !== -1 || countyKey.indexOf(areaLower) !== -1);
              if (keysOverlap && countyPostcodes[countyKey].indexOf(pcCode) >= 0) { areaMatch = true; break; }
            }
          }
        }
      }
    }
    if (!areaMatch) return { match: false, tier: 0 };
  } else {
    // County, region, ukwide or no targets: skip strict area check (scraper handles geographic scope)
    areaMatch = true;
  }

  // Filter matching — support both legacy single-product and per-product format
  const filterStr = customer.biz_field2 || '';
  let tier = 1;
  let planningCategory = '';
  try {
    const rawFilters = JSON.parse(filterStr);
    if (!rawFilters || Object.keys(rawFilters).length === 0) { /* no filters */ }
    // Determine format: legacy has 'product' key, per-product has lead type keys
    var filters;
    if (rawFilters.product) {
      filters = rawFilters; // legacy single-product format
    } else {
      // Per-product format: extract the relevant product's filters
      var prodKey = product;
      if (rawFilters[prodKey]) {
        filters = rawFilters[prodKey];
        filters.product = prodKey;
      } else {
        filters = { product: product };
      }
    }

      if (filters && filters.product) {
        // Map legacy frontend filter keys to distributor expected keys
        var keyMap = { 'f-bed-min':'minBedrooms', 'f-bed-max':'maxBedrooms', 'f-max-price':'maxPrice', 'f-prop-type':'propertyType', 'f-status':'statusSSTC', 'f-min-val':'minValue', 'f-industries':'industries', 'f-keywords':'keywords', 'f-app-type':'applicationType', 'appTypes':'applicationType' };
        for (var oldKey in keyMap) {
          if (filters[oldKey] !== undefined && filters[keyMap[oldKey]] === undefined) {
            filters[keyMap[oldKey]] = filters[oldKey];
          }
        }
        if (filters.product === 'moving') {
          const beds = parseInt(lead.bedrooms) || 0;
          const minBeds = parseInt((filters.minBedrooms || '').toString().replace(/[^0-9]/g, '')) || 0;
          const maxBeds = parseInt((filters.maxBedrooms || '').toString().replace(/[^0-9]/g, '')) || 99;
          if (minBeds > 0 && beds < minBeds) return { match: false };
          if (maxBeds < 99 && beds > maxBeds) return { match: false };
          const price = parseInt(lead.price) || 0;
          const maxPrice = parseInt(filters.maxPrice) || 0;
          if (maxPrice > 0 && price > maxPrice) return { match: false };
          if (filters.propertyType && filters.propertyType !== 'Any' && filters.propertyType !== 'any') {
            // Property type filter removed - no longer filtering by type
          }
        const status = (lead.status || '').toLowerCase();
        const sstcEnabled = filters.statusSSTC !== false;
        const offerEnabled = filters.statusOffer !== false;
        const isSstc = status.includes('sstc') || status.includes('sold');
        const isOffer = status.includes('offer');
        if ((isSstc && !sstcEnabled) || (isOffer && !offerEnabled)) tier = 2;
      }
      if (filters.product === 'probate') {
        // Probate: only postcode territory filtering (no additional filters from Companies House data)
      }
      if (filters.product === 'newbusiness') {
        // New Business: show ALL newly registered companies regardless of industry
      }
      if (filters.product === 'planning') {
        const appType = (lead.applicationType || lead.app_type || '').toLowerCase();
        var filterTypes = filters['f-app-type'] || filters.applicationType || filters.appTypes || [];
        if (typeof filterTypes === 'string') filterTypes = [filterTypes];
        var appTypeMatched = true;
        // Derive a category slug for even-distribution tracking across app types
        planningCategory = 'other';
        if (appType.indexOf('ext') !== -1 || appType.indexOf('householder') !== -1 || appType.indexOf('lawful') !== -1 || appType.indexOf('permitted') !== -1 || appType.indexOf('prior') !== -1) planningCategory = 'extensions';
        else if (appType.indexOf('change of use') !== -1) planningCategory = 'change-of-use';
        else if (appType.indexOf('listed') !== -1) planningCategory = 'listed-buildings';
        else if (appType.indexOf('outline') !== -1 || appType.indexOf('new home') !== -1) planningCategory = 'new-homes';
        else if (appType.indexOf('trees') !== -1 || appType.indexOf('landscaping') !== -1) planningCategory = 'trees-and-landscaping';
        else if (appType.indexOf('commercial') !== -1 || appType.indexOf('major') !== -1) planningCategory = 'commercial-and-major-works';
        if (Array.isArray(filterTypes) && filterTypes.length > 0) {
          filterTypes = filterTypes.map(function(t) { return t.toLowerCase(); });
          appTypeMatched = filterTypes.some(function(t) { return appType.includes(t) || planningCategory.includes(t) || t.includes(planningCategory); });
          // App type not matched: don't hard-reject — lower priority (tier 2) so
          // real planning applications still reach the customer when the type
          // doesn't exactly match the filter list.
          if (!appTypeMatched) tier = 2;
        }
        // Keyword matching — if set, further narrows results but doesn't block if none match
        if (filters.keywords) {
          const keywords = filters.keywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
          if (keywords.length > 0) {
            const desc = (lead.description || lead.proposal || '').toLowerCase();
            const title = (lead.council || lead.address || '').toLowerCase();
            const combined = title + ' ' + desc;
            const kwMatched = keywords.some(k => combined.includes(k));
            // Keywords matched: keep tier (tier 1 if app type also matched). No keywords match: still deliver (tier 2) but lower priority
            if (!kwMatched) tier = 2;
          }
        }
      }
      if (filters.product === 'tenders') {
        const val = parseInt(lead.contractValue) || 0;
        const minVal = parseInt((filters.minValue || '').toString().replace(/[^0-9]/g, '')) || 0;
        if (minVal > 0 && val < minVal) tier = 2;
        if (filters.keywords) {
          const keywords = filters.keywords.toLowerCase().split(',').map(k => k.trim()).filter(k => k);
          if (keywords.length > 0) {
            const title = (lead.title || '').toLowerCase();
            const desc = (lead.description || '').toLowerCase();
            const combined = title + ' ' + desc;
            const matched = keywords.some(k => combined.includes(k));
            if (!matched) tier = 2;
          }
        }
      }
    }
  } catch (e) {}

  return { match: true, tier: tier, appCategory: planningCategory };
}

// Extract lead data in a standardised format from any scraper output
function normaliseLead(rawLead, product, customerId) {
  const base = {
    id: rawLead.id || 'LD_' + uuidv4(),
    address: rawLead.address || rawLead.name || rawLead.company || '',
    postcode: rawLead.postcode || rawLead.location || '',
    price: rawLead.price || rawLead.priceLabel || rawLead.estateValueLabel || '',
    bedrooms: rawLead.bedrooms || 0,
    propertyType: rawLead.propertyType || rawLead.type || '',
    status: rawLead.status || rawLead.listingStatus || 'new',
    agent: rawLead.agent || rawLead.agentName || '',
    url: rawLead.url || '',
    source: rawLead.source || product,
    city: rawLead.city || '',
    scrapedAt: rawLead.scrapedAt || new Date().toISOString(),
  };

  // Move-specific fields
  if (product === 'moving') {
    base.priceLabel = rawLead.priceLabel || (rawLead.price ? '\u00a3' + Number(rawLead.price).toLocaleString() : '');
    base.estimatedMoveWindow = rawLead.estimatedMoveWindow || '';
    base.listedDate = rawLead.listedDate || '';
    // Preserve Rightmove freshness signals so delivery can enforce 24h/48h.
    base.firstVisibleDate = rawLead.firstVisibleDate || '';
    base.updateDate = rawLead.updateDate || '';
  }

  // New Business specific fields
  if (product === 'newbusiness') {
    base.company = rawLead.companyName || rawLead.name || rawLead.company || '';
    base.companyNumber = rawLead.companyNumber || '';
    base.address = rawLead.address || '';
    base.sicCode = rawLead.sicCode || rawLead.sic_description || '';
    base.incorporationDate = rawLead.incorporationDate || rawLead.dateOfCreation || '';
    base.ownerEmail = rawLead.ownerEmail || '';
    base.website = rawLead.website || '';
    if (!base.postcode) {
      var nbPc = (rawLead.address || '').match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i);
      base.postcode = nbPc ? nbPc[0].toUpperCase() : '';
    }
    if (!base.city) {
      var nbCity = (rawLead.address || '').match(/,\s*([A-Za-z ]+?),\s*(?:[A-Z]{1,2}[0-9]|England|Scotland|Wales)/i);
      base.city = nbCity ? nbCity[1].trim() : '';
    }
  }

  // Probate specific fields
  if (product === 'probate') {
    base.deceasedName = rawLead.name || '';
    base.deceasedAddress = rawLead.deceasedAddress || '';
    base.address = base.address || rawLead.deceasedAddress || '';
    base.grantDate = rawLead.grantDate || rawLead.publishedDate || rawLead.date_received || '';
    base.publishedDate = rawLead.grantDate || rawLead.publishedDate || rawLead.date_received || '';
    base.dateOfDeath = rawLead.dateOfDeath || '';
    base.claimExpiry = rawLead.claimExpiry || '';
    base.estateValue = rawLead.estateValue || '';
    base.estateValueLabel = rawLead.estateValueLabel || '';
    base.registry = rawLead.registry || '';
    base.legalAdvisor = rawLead.legalAdvisor || '';
    base.legalAdvisorEmail = rawLead.legalAdvisorEmail || '';
    base.legalAdvisorPhone = rawLead.legalAdvisorPhone || '';
    base.solicitor = rawLead.solicitor || '';
    base.executorName = rawLead.executorName || '';
    base.executorAddress = rawLead.executorAddress || '';
    base.solicitorAddress = rawLead.solicitorAddress || '';
    base.noticeUrl = rawLead.noticeUrl || rawLead.url || '';
    if (!base.postcode) {
      var gazPc = (rawLead.deceasedAddress || '').match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i);
      base.postcode = gazPc ? gazPc[0].toUpperCase() : '';
    }
  }

  // Planning specific fields
  if (product === 'planning') {
    base.address = rawLead.address || '';
    base.applicationType = rawLead.applicationType || rawLead.type || '';
    base.description = rawLead.description || '';
    base.applicant = rawLead.applicant || '';
    base.applicantAddress = rawLead.applicantAddress || '';
    base.targetDecisionDate = rawLead.targetDecisionDate || '';
    base.council = rawLead.council || rawLead.authority || '';
    base.applicationRef = rawLead.applicationRef || '';
    base.planningKeyVal = rawLead.planningKeyVal || '';
    base.dateSubmitted = rawLead.dateSubmitted || rawLead.date_received || rawLead.receivedDate || '';
    base.locationPoint = rawLead.locationPoint || '';
    if (!base.description && rawLead.proposal) base.description = rawLead.proposal;
    base.proposal = rawLead.proposal || rawLead.description || '';
    // White-label: do NOT carry external source URLs (plota/council links) to the
    // customer. The planning source must not be revealed.
    base.plotaUrl = '';
    base.sourceUrl = '';
    base.links = {};
    base.trades = rawLead.trades || [];
    base.freshnessBadge = rawLead.freshnessBadge || '';
  }

  // Tenders specific fields
  if (product === 'tenders') {
    base.address = base.address || rawLead.title || '';
    base.tenderTitle = rawLead.title || rawLead.name || '';
    base.buyer = rawLead.buyer || rawLead.authority || '';
    base.buyerEmail = rawLead.buyerEmail || '';
    base.buyerPhone = rawLead.buyerPhone || '';
    // Enriched buyer contact + how to apply (from the tender detail page)
    base.contactName = rawLead.contactName || '';
    base.contactEmail = rawLead.contactEmail || base.buyerEmail;
    base.contactPhone = rawLead.contactPhone || base.buyerPhone;
    base.buyerAddress = rawLead.buyerAddress || '';
    base.howToApply = rawLead.howToApply || '';
    base.applyLink = rawLead.applyLink || base.url || '';
    base.value = rawLead.value || '';
    base.contractType = rawLead.contractType || '';
    base.publishedDate = rawLead.publishedDate || '';
    base.closingDate = rawLead.closingDate || '';
    base.cpvCodes = rawLead.cpvCodes || [];
    base.cpvCode = rawLead.cpvCode || '';
    base.tenderNoticeId = rawLead.tenderNoticeId || '';
    base.contractValue = rawLead.contractValue || '';
    base.contractValueLabel = rawLead.contractValueLabel || '';
    // Ensure every tender has a viewable link (Contracts Finder, PCS, or data.gov.uk)
    if (!base.url) {
      var nid = rawLead.tenderNoticeId || rawLead.id || rawLead.noticeIdentifier || '';
      if (rawLead.source === 'Public Contracts Scotland' || rawLead.source === 'PCS') {
        base.url = 'https://www.publiccontractsscotland.gov.uk/search/show/search_view.aspx?ID=' + nid;
      } else if (rawLead.source === 'data.gov.uk' && rawLead.name) {
        base.url = 'https://data.gov.uk/dataset/' + nid + '/' + rawLead.name;
      } else if (nid && /^[a-f0-9-]{20,}$/i.test(nid)) {
        base.url = 'https://www.contractsfinder.service.gov.uk/notice/' + nid;
      } else if (nid && /^\d+$/.test(nid)) {
        base.url = 'https://www.contractsfinder.service.gov.uk/notice/' + nid;
      }
    }
  }

  return base;
}

async function distributeProduct(product) {
  const config = PRODUCT_LEAD_FILES[product];
  if (!config) {
    console.log(`  Unknown product: ${product}`);
    return { product, matched: 0, total: 0, inserted: 0 };
  }

  const db = loadJSON(DB_FILE);
  if (!db || !db.customers) {
    console.log(`  Database not found or empty`);
    return { product, matched: 0, total: 0, inserted: 0 };
  }

  // Load scraped leads for this product
  const productLeadsFile = path.join(DATA_DIR, config.file);
  const scrapedData = loadJSON(productLeadsFile);
  if (!scrapedData) {
    console.log(`  No scraped leads file: ${config.file}`);
    return { product, matched: 0, total: 0, inserted: 0 };
  }

  // Get customers subscribed to this product (check both product and products array)
  const productCustomers = db.customers.filter(c =>
    (c.product === product || (c.biz_field3 && (function(){ try { return JSON.parse(c.biz_field3).includes(product); } catch(e){ return false; } })())) &&
    c.plan !== 'cancelled' &&
    (!c.bounced || c.bounced < 3)
  );

  if (productCustomers.length === 0) {
    console.log(`  No active customers for ${product}`);
    return { product, matched: 0, total: 0, inserted: 0 };
  }

  console.log(`  Customers: ${productCustomers.length} active`);

  // Scraped data is keyed by customer_id OR is a flat array
  // Handle both formats
  let allScrapedLeads = [];
  if (Array.isArray(scrapedData)) {
    allScrapedLeads = scrapedData;
  } else {
    // Object keyed by customer_id
    for (const [cid, leads] of Object.entries(scrapedData)) {
      if (cid.startsWith('_')) continue; // skip metadata keys
      if (Array.isArray(leads)) {
        allScrapedLeads.push(...leads.map(l => ({ ...l, originalCustomerId: cid })));
      }
    }
  }

  console.log(`  Total scraped leads available: ${allScrapedLeads.length}`);

  // Use the FULL pool (not just today's scraped batch) so every customer can
  // always be assigned their FULL promised daily quota. The scraper pool already
  // keeps leads fresh (moving drops >7d; other products are capped per customer),
  // so older-but-valid leads are still great prospects. Prefer today's leads in
  // the sort, but never limit assignment to today only — that caused customers
  // (e.g. moving pro 15/day) to be short-changed when today's batch lacked enough
  // leads in their areas.
  if (allScrapedLeads.length > 0) {
    const today = getTodayStr();
    allScrapedLeads.forEach(function(l) {
      const scrapedDate = l.scrapedAt ? l.scrapedAt.split('T')[0] : '';
      l._isToday = scrapedDate === today;
    });
    allScrapedLeads.sort(function(a, b) { return (b._isToday ? 1 : 0) - (a._isToday ? 1 : 0); });
    console.log(`  Using full pool: ${allScrapedLeads.length} leads (today's first)`);
  } else {
    console.log('  No scraped leads — will generate Phase 4 targeted leads');
  }

  // Deduplicate within the current batch (same company number or address)
  var seenKeys = new Set();
  allScrapedLeads = allScrapedLeads.filter(function(l) {
    var key = (l.companyNumber || l.id || l.address || '').toLowerCase().trim();
    if (!key || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
  console.log('  After intra-batch dedup: ' + allScrapedLeads.length + ' unique leads');
  // DIAGNOSTIC: print the postcode-area distribution of the pool so we can see
  // whether B/HA/NW (and other customer areas) actually have leads to match.
  if (allScrapedLeads.length > 0) {
    var diagAreas = {};
    allScrapedLeads.forEach(function(l) {
      var pc = l.postcode || l.address || '';
      var a = extractPostcodeArea(pc);
      if (a) diagAreas[a] = (diagAreas[a] || 0) + 1;
      else diagAreas['_noPc'] = (diagAreas['_noPc'] || 0) + 1;
    });
    var diagTop = Object.keys(diagAreas).sort(function(x, y) { return diagAreas[y] - diagAreas[x]; }).slice(0, 15).map(function(k) { return k + '=' + diagAreas[k]; }).join(' ');
    console.log('  [DIAG] pool areas: ' + diagTop);
  }

  // Get leads already in DB to avoid duplicates (same product only)
  const existingLeads = db.leads || [];
  const existingAddresses = new Set(
    existingLeads.filter(l => l.product === product).map(l => {
      try {
        const d = typeof l.data === 'string' ? JSON.parse(l.data) : (l.data || {});
        return (d.address || '').toLowerCase().trim();
      } catch { return ''; }
    }).filter(Boolean)
  );

  let inserted = 0;
  let duplicates = 0;
  let noMatch = 0;
  const now = new Date().toISOString();

  // Phase 1: For each lead, find all matching customers
  const leadAssignments = [];
  const activeCustomers = [];

  for (const customer of productCustomers) {
    const trialEnds = customer.trial_ends ? new Date(customer.trial_ends) : null;
    if (customer.plan === 'free_trial' && trialEnds && new Date() > trialEnds) {
      console.log(`    SKIP ${customer.company || customer.email} (trial ended ${customer.trial_ends})`);
      continue;
    }
    activeCustomers.push(customer);
  }

  if (activeCustomers.length === 0) {
    console.log(`  No active customers for ${product}`);
    saveJSON(DB_FILE, db);
    return { product, matched: 0, total: allScrapedLeads.length, inserted: 0, duplicates: 0 };
  }

  for (const rawLead of allScrapedLeads) {
    const normalised = normaliseLead(rawLead, product, '');
    const addrKey = normalised.address.toLowerCase().trim();
    if (addrKey && existingAddresses.has(addrKey)) { duplicates++; continue; }
    // COMPANY-NUMBER DEDUP: Companies House registrations share registered-office
    // addresses (formation agents), so address alone is unreliable. Dedupe on the
    // unique company number so a newly-formed company is NEVER delivered twice.
    if (product === 'newbusiness') {
      const coNum = (rawLead.companyNumber || rawLead.company_number || '').toString().trim().toLowerCase();
      if (coNum && (db.leads || []).some(function(l) {
        try {
          const ld = typeof l.data === 'string' ? JSON.parse(l.data) : (l.data || {});
          return String(ld.companyNumber || ld.company_number || '').toLowerCase() === coNum;
        } catch(e) { return false; }
      })) { duplicates++; continue; }
    }

    // Per-lead exclusivity: every lead goes to all matching customers,
    // but each customer only gets their daily limit.
    // Once a customer hits their quota, remaining leads in their area
    // are offered to other matching businesses.
    // The specific leads delivered at 9am are exclusive to each recipient.
    const matchedCustomers = []; // { customer, tier }
    for (const customer of activeCustomers) {
      const result = leadMatchesTarget(rawLead, customer, product);
      if (result.match) {
        // Specific-area customers (postcode/county/region with real targets) get
        // priority over ukwide/all-UK customers for scarce leads.
        const cfg = getProductConfig(customer, product);
        const cov = cfg.coverage || 'default';
        const isSpecific = cov !== 'ukwide' && cfg.targets.length > 0;
        matchedCustomers.push({ customer, tier: result.tier, isSpecificArea: isSpecific });
      }
    }

    // FALLBACK ONLY for tenders/probate (products where a lead may carry no
    // clean county text at all). MOVING, NEWBUSINESS and PLANNING are EXCLUDED —
    // they have reliable postcode/application data and must use STRICT area
    // matching, never a fallback that delivers out-of-area leads. This was the
    // bug that sent wrong-area leads (e.g. Cambridge leads to a B/HA/NW customer,
    // and a Lancaster planning app to a greater-london customer).
    if (product === 'tenders' || product === 'probate') {
      for (const customer of activeCustomers) {
        const isProductCustomer = customer.product === product || (customer.biz_field3 && String(customer.biz_field3).indexOf(product) !== -1);
        if (!isProductCustomer) continue;
        const alreadyMatched = matchedCustomers.some(function(mc) { return mc.customer.id === customer.id; });
        if (!alreadyMatched) {
          matchedCustomers.push({ customer, tier: 0 });
        }
      }
    }

    if (matchedCustomers.length === 0) { noMatch++; continue; }
    // Capture the lead's planning category (for even distribution across app types)
    var leadCat = matchedCustomers.length > 0 && matchedCustomers[0].appCategory ? matchedCustomers[0].appCategory : '';
    leadAssignments.push({ lead: rawLead, normalised, addrKey, customers: matchedCustomers, category: leadCat });
  }

  // Phase 2: Tiered round-robin distribution (3 passes).
  // Leads are spread evenly across the customer's postcode areas so that,
  // for example, a customer with 5 postcodes and a 5-lead quota gets 1 lead
  // from each postcode. Same behaviour for all paid packages.
  const customerUsage = {};
  const customerPostcodeUsage = {};
  const customerLabels = {};
  const customerLimits = {};
  activeCustomers.forEach(c => {
    customerUsage[c.id] = 0;
    customerPostcodeUsage[c.id] = {};
    customerLabels[c.id] = c.company || c.email;
    // Per-product limit: a customer subscribed to multiple lead types gets the
    // full promised quota for EACH product (e.g. moving 15 + probate 15).
    var cCov = '';
    try { var cCfg = JSON.parse(c.product_config || '{}'); cCov = (cCfg[product] && cCfg[product].coverage) || c.coverage || ''; } catch(e) {}
    customerLimits[c.id] = distributorPlanLimit(product, c.plan, cCov) || c.leads_per_day || 5;
  });

  // Track which source lead IDs have been claimed (exclusivity)
  const claimedLeadIds = new Set();

  // Sort leads with fewest matching customers first (scarcer leads go first)
  leadAssignments.sort((a, b) => a.customers.length - b.customers.length);

  // Interleave by postcode area so a customer's quota is spread across all
  // their requested postcodes (e.g. 5 postcodes + 5 leads = 1 lead per postcode)
  const areaBucket = {};
  leadAssignments.forEach(function(assignment) {
    var area = getLeadPostcodeArea(assignment) || '_';
    if (!areaBucket[area]) areaBucket[area] = [];
    areaBucket[area].push(assignment);
  });
  var areasOrder = Object.keys(areaBucket).sort();
  var interleaved = [];
  var areaIdx = 0;
  var still = true;
  while (still) {
    still = false;
    for (var bi = 0; bi < areasOrder.length; bi++) {
      var bucket = areaBucket[areasOrder[bi]];
      if (bucket && bucket.length) { interleaved.push(bucket.shift()); still = true; }
    }
    areaIdx++;
  }
  leadAssignments.splice(0, leadAssignments.length, ...interleaved);

  function getLeadPostcodeArea(leadData) {
    var raw = leadData.lead;
    var pc = raw.postcode || '';
    if (!pc) {
      // Extract the actual postcode from the full address (e.g. Companies House
      // stores it inside address: "16 Brick House 1a Faringdon Avenue, Romford, RM3 8SH")
      var m = (raw.address || '').match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i);
      if (m) pc = m[0];
    }
    if (!pc) pc = raw.address || raw.location || '';
    return extractPostcodeArea(pc);
  }

  function assignLead(leadData, rawLeadData, addrKeyData, tierFilter) {
    const { lead: rl, normalised: nl, addrKey: ak, customers, category } = leadData;
    const leadArea = getLeadPostcodeArea(leadData);
    const cat = category || '';
    // Filter customers by tier, then sort by per-category usage (fewest first)
    // so planning leads spread evenly across application types (not all trees),
    // then by per-postcode usage, then total usage.
    const eligible = customers.filter(mc => mc.tier <= tierFilter);
    eligible.sort((a, b) => {
      // PLAN PRIORITY: paid/higher-tier customers get first access to scarce
      // area leads, so a pro customer (15/day) is never short-changed by free
      // trial accounts competing for the same postcode areas.
      const planRank = { enterprise: 4, pro: 3, starter: 2, essential: 2, free_trial: 1 };
      const ar = planRank[a.customer.plan] || 1;
      const br = planRank[b.customer.plan] || 1;
      if (ar !== br) return br - ar;
      // COVERAGE PRIORITY: specific-area customers (county/region/postcode) get
      // first access over ukwide/all-UK customers, so a greater-london customer is
      // never starved by an "All UK" account claiming every lead.
      const isSpecificA = a.isSpecificArea === true;
      const isSpecificB = b.isSpecificArea === true;
      if (isSpecificA !== isSpecificB) return isSpecificA ? -1 : 1;
      if (cat) {
        var auCat = customerPostcodeUsage[a.customer.id]['cat_' + cat] || 0;
        var buCat = customerPostcodeUsage[b.customer.id]['cat_' + cat] || 0;
        if (auCat !== buCat) return auCat - buCat;
      }
      var au = customerPostcodeUsage[a.customer.id][leadArea] || 0;
      var bu = customerPostcodeUsage[b.customer.id][leadArea] || 0;
      if (au !== bu) return au - bu;
      // Postcode-area rotation: prefer customers whose LAST delivered area differs
      // from this lead's area, so a customer gets a genuine MIX of their chosen
      // postcodes over consecutive days (not the same area every day).
      var aLast = a.customer.last_area || '';
      var bLast = b.customer.last_area || '';
      var aDiff = aLast && aLast !== leadArea ? 0 : 1;
      var bDiff = bLast && bLast !== leadArea ? 0 : 1;
      if (aDiff !== bDiff) return aDiff - bDiff;
      return customerUsage[a.customer.id] - customerUsage[b.customer.id];
    });

    for (const mc of eligible) {
      const c = mc.customer;
      if (customerUsage[c.id] >= customerLimits[c.id]) continue;
      // CROSS-ACCOUNT DEDUP: the same property/company/notice should NEVER be
      // delivered to two different customers (they would both contact the same
      // prospect and look like spammers). Check the whole leads table for this
      // product, not just this customer.
      var alreadyAssigned = db.leads.some(function(l) { return l.product === product && l.data && l.data.includes(ak); });
      if (alreadyAssigned) continue;
      const leadRecord = {
        id: uuidv4(),
        customer_id: c.id,
        product: product,
        data: JSON.stringify(normaliseLead(rl, product, c.id)),
        status: 'new',
        delivered: 0,
        created_at: now,
        delivered_at: null,
        // Leads are released to the dashboard at 09:00 UK (same time the email is
        // sent), not when the distributor runs at 06:05. The dashboard filters out
        // any lead whose release_at is still in the future.
        release_at: getReleaseAt(),
      };
      db.leads.push(leadRecord);
      existingAddresses.add(ak);
      customerUsage[c.id]++;
      if (leadArea) customerPostcodeUsage[c.id][leadArea] = (customerPostcodeUsage[c.id][leadArea] || 0) + 1;
      if (cat) customerPostcodeUsage[c.id]['cat_' + cat] = (customerPostcodeUsage[c.id]['cat_' + cat] || 0) + 1;
      inserted++;
      // Track lead count on customer record
      var ldCust = db.customers.find(function(x) { return x.id === c.id; });
      if (ldCust) {
        ldCust.lead_count = (ldCust.lead_count || 0) + 1;
        // Remember the last area we gave this customer so next day rotates areas
        if (leadArea) ldCust.last_area = leadArea;
      }
      return true;
    }
    return false;
  }

  // Pass 1: Only Tier 1 (perfect filter matches)
  const unassigned = [];
  for (const assignment of leadAssignments) {
    const assigned = assignLead(assignment, null, null, 1);
    if (!assigned) unassigned.push(assignment);
  }

  // Pass 2: Tier 1 + Tier 2 for customers still below quota
  const unassigned2 = [];
  for (const assignment of unassigned) {
    if (assignment.lead.id && claimedLeadIds.has(assignment.lead.id)) continue;
    const assigned = assignLead(assignment, null, null, 2);
    if (!assigned) unassigned2.push(assignment);
  }

  // Pass 3: Any remaining lead to any customer below quota (Tier 1 + Tier 2)
  for (const assignment of unassigned2) {
    if (assignment.lead.id && claimedLeadIds.has(assignment.lead.id)) continue;
    assignLead(assignment, null, null, 2);
  }

  // PASS 4 — QUOTA GUARANTEE: every customer must receive their FULL promised
  // daily count, never less. If the normal matching passes left a customer short,
  // top them up from the remaining pool (preferring their requested areas, then
  // any remaining real lead) so we always deliver exactly what was sold.
  var quotaShortfall = activeCustomers.filter(function(c) { return (customerUsage[c.id] || 0) < (customerLimits[c.id] || 0); });
  if (quotaShortfall.length > 0) {
    console.log('  [QUOTA-GUARANTEE] ' + quotaShortfall.length + ' customer(s) below quota, topping up...');
    // Rebuild the pool of unused leads (all of today's scraped pool still available)
    var quotaPool = leadAssignments.filter(function(a) { return !claimedLeadIds.has(a.lead.id); });
    // Sort: customers furthest below quota first; within a customer, prefer their areas
    quotaShortfall.sort(function(a, b) { return (customerUsage[a.id] - customerLimits[a.id]) - (customerUsage[b.id] - customerLimits[b.id]); });
    var quotaDone = false;
    var quotaGuard = 0;
    while (!quotaDone && quotaGuard < 500) {
      quotaGuard++;
      quotaDone = true;
      for (var qci = 0; qci < quotaShortfall.length; qci++) {
        var qc = quotaShortfall[qci];
        var shortBy = (customerLimits[qc.id] || 0) - (customerUsage[qc.id] || 0);
        if (shortBy <= 0) continue;
        quotaDone = false;
        // Find an unused lead for this customer: prefer their areas first
        var qPool = quotaPool.filter(function(a) { return !claimedLeadIds.has(a.lead.id); });
        // Re-sort to prefer this customer's requested postcode areas
        var qcAreas = [];
        try { qcAreas = JSON.parse(qc.target_areas || '[]'); } catch(e) {}
        var chosen = null;
        if (qcAreas.length > 0) {
          for (var qa = 0; qa < qcAreas.length && !chosen; qa++) {
            var wantArea = extractPostcodeArea(qcAreas[qa]);
            chosen = qPool.find(function(a) { return extractPostcodeArea(a.lead.postcode || a.lead.address || a.lead.location || '') === wantArea; });
          }
        }
        if (!chosen) chosen = qPool[0];
        if (!chosen) continue;
        if (assignLead(chosen, null, null, 2)) {
          claimedLeadIds.add(chosen.lead.id);
          var qArea = getLeadPostcodeArea(chosen);
          if (qArea) customerPostcodeUsage[qc.id][qArea] = (customerPostcodeUsage[qc.id][qArea] || 0) + 1;
        }
      }
    }
    var stillShort = activeCustomers.filter(function(c) { return (customerUsage[c.id] || 0) < (customerLimits[c.id] || 0); });
    if (stillShort.length > 0) {
      console.log('  [QUOTA-GUARANTEE] WARNING: supply exhausted — ' + stillShort.map(function(c) { return c.email || c.id; }).join(', ') + ' below promised quota');
    }
  }

  // Phase 3b: Enrich newly inserted leads with full addresses + postcodes.
  // Fetches each property's detail page for the postcode, then uses Postcoder
  // (licensed Royal Mail PAF) to add the exact house number.
  try {
    if (inserted > 0 && product === 'moving') {
      const rmScraper = require('./rightmove_scraper_v2.js');
      var insertedLeads = db.leads.filter(function(l) { return l.customer_id && l.product === product && l.delivered === 0 && (l.created_at || '').startsWith(now.substring(0, 10)); });
      console.log('  [ENRICH] Found ' + insertedLeads.length + ' leads to enrich (inserted=' + inserted + ')');
      var enriched = 0;
      for (var ei = 0; ei < insertedLeads.length; ei++) {
        var rec = insertedLeads[ei];
        var ld = null;
        try { ld = JSON.parse(rec.data); } catch(e) {}
        if (!ld) continue;
        var detail = ld.url ? await rmScraper.fetchPropertyDetail(ld.url) : null;
        if (detail && detail.postcode) {
          ld.address = detail.fullAddress || ld.address;
          ld.postcode = detail.postcode || ld.postcode || '';
          ld.fullAddress = detail.fullAddress || ld.address;
        }
        // Postcoder adds the exact house number from licensed Royal Mail PAF data.
        // CREDIT-EFFICIENT: only spend a lookup when the lead genuinely lacks a house
        // number. If the detail-page address already contains a number (e.g.
        // "Lavey House 10 Belgrave Road" or "45 Albert Street"), skip Postcoder.
        var detailAddrHasNumber = /(^|[\s,])\d{1,5}[A-Za-z]?(\s|,|$)/.test(ld.address || '');
        if (ld.postcode && !detailAddrHasNumber) {
          var streetHint = (detail && detail.fullAddress) || ld.address || '';
          var fullAddr = await rmScraper.lookupPostcoderAddress(ld.postcode, streetHint);
          // Retry once after a pause if rate-limited (free tier trips the 5/5min guard)
          if (fullAddr && fullAddr.rateLimited) {
            await new Promise(function(r) { setTimeout(r, 30000); });
            fullAddr = await rmScraper.lookupPostcoderAddress(ld.postcode, streetHint);
          }
          if (fullAddr && !fullAddr.rateLimited) {
            // Use the complete summary line (e.g. "Flat 1, Clarence Gate Gardens, Glentworth Street,
            // London, Greater London, NW1 6AY") — never the truncated address1 which may be just "Flat 1".
            ld.address = fullAddr.fullAddress || fullAddr.address1 || ld.address;
            ld.fullAddress = fullAddr.fullAddress || ld.address;
            ld.street = fullAddr.street || ld.street || '';
            ld.buildingNumber = fullAddr.buildingNumber || '';
            ld.postcode = fullAddr.postcode || ld.postcode;
            ld.udprn = fullAddr.udprn || '';
          }
        } else {
          // Extract any number already present in the detail address (free, no credit)
          var numMatch = (ld.address || '').match(/(^|[\s,])(\d{1,5}[A-Za-z]?)(\s|,|$)/);
          if (numMatch && !ld.buildingNumber) ld.buildingNumber = numMatch[2];
        }
        rec.data = JSON.stringify(ld);
        enriched++;
        // Small delay between lookups to stay within the account rate limit (50/5min)
        await new Promise(function(r) { setTimeout(r, 800); });
      }
      // Postcoder note: if the account is rate-limited the enrichment falls back to
      // the detail-page address (street + postcode) — still real data, just no number.
      if (enriched > 0) console.log('  [ENRICH] Added full addresses/house numbers to ' + enriched + ' leads');
    }
  } catch(e) { console.log('  [ENRICH] Error: ' + e.message); }

    // Phase 4: No demo supplement — only real scraped data used
  var generated = 0;
  saveJSON(DB_FILE, db);

  var totalMatched = Object.values(customerUsage).reduce((a, b) => a + b, 0);
  for (const [cid, count] of Object.entries(customerUsage)) {
    if (count > 0) console.log(`    ${customerLabels[cid] || cid}: ${count} leads`);
  }
  console.log(`  Result: ${inserted} inserted (${inserted - generated} real + ${generated} generated), ${duplicates} duplicates, ${noMatch} unmatched`);
  return { product, matched: totalMatched, total: (allScrapedLeads ? allScrapedLeads.length : 0) + generated, inserted, duplicates, noMatch };
}

async function distributeAll(force) {
  const dayOfWeek = new Date().getDay();
  console.log('\n========================================');
  console.log('  9amLeads Lead Distributor');
  console.log(`  ${new Date().toLocaleString()}`);
  console.log('========================================\n');

  if (dayOfWeek === 0 && !force) {
    console.log('  Sunday — no lead distribution (Mon-Sat only). Use --force to override.\n');
    return [];
  }

  const results = [];
  for (const product of Object.keys(PRODUCT_LEAD_FILES)) {
    console.log(`\n📦 ${product.toUpperCase()}:`);
    const result = await distributeProduct(product);
    results.push(result);
  }

  console.log('\n========================================');
  console.log('  DISTRIBUTION SUMMARY');
  console.log('========================================');
  let totalMatched = 0;
  let totalInserted = 0;
  for (const r of results) {
    console.log(`  ${r.product}: ${r.inserted}/${r.total} leads matched to customers`);
    totalMatched += r.matched;
    totalInserted += r.inserted;
  }
  console.log(`\n  Total: ${totalInserted} leads distributed to ${results.length} products`);
  console.log('========================================\n');

  return results;
}

function showStatus() {
  console.log('\n========================================');
  console.log('  Lead Distributor Status');
  console.log('========================================\n');

  const db = loadJSON(DB_FILE);
  if (!db) { console.log('  Database not found\n'); return; }

  const customers = db.customers || [];
  const leads = db.leads || [];
  const undelivered = leads.filter(l => !l.delivered);
  const today = getTodayStr();
  const todayLeads = leads.filter(l => l.created_at && l.created_at.startsWith(today));

  console.log(`  Database: ${DB_FILE}`);
  console.log(`  Customers: ${customers.length}`);
  console.log(`  Total leads: ${leads.length}`);
  console.log(`  Undelivered: ${undelivered.length}`);
  console.log(`  Today's leads: ${todayLeads.length}`);
  console.log('');

  // By product
  const byProduct = {};
  leads.forEach(l => {
    byProduct[l.product] = (byProduct[l.product] || 0) + 1;
  });
  console.log('  Leads by product:');
  for (const [p, c] of Object.entries(byProduct)) {
    console.log(`    ${p}: ${c}`);
  }
  console.log('');

  // Check if product lead files exist
  console.log('  Scraper output files:');
  for (const [product, config] of Object.entries(PRODUCT_LEAD_FILES)) {
    const filePath = path.join(DATA_DIR, config.file);
    const exists = fs.existsSync(filePath);
    const size = exists ? fs.statSync(filePath).size : 0;
    console.log(`    ${product}: ${exists ? (size/1024).toFixed(1)+'KB' : 'NOT FOUND'}`);
  }
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--status')) {
    showStatus();
    return;
  }

  if (args.includes('--product')) {
    const idx = args.indexOf('--product');
    const product = args[idx + 1];
    if (!product || !PRODUCT_LEAD_FILES[product]) {
      console.log(`Unknown product: ${product}. Valid: ${Object.keys(PRODUCT_LEAD_FILES).join(', ')}`);
      return;
    }
    await distributeProduct(product);
    return;
  }

  const force = args.includes('--force');
  await distributeAll(force);
}

if (require.main === module) {
  main().catch(e => console.error('Error:', e.message));
}

module.exports = { distributeProduct, distributeAll, showStatus };
