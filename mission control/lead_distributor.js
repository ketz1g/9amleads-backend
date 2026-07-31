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

// Normalise a postcode for matching: "SW1A 1AA" → "sw1a"
function normalisePostcode(pc) {
  if (!pc) return '';
  return pc.toLowerCase().replace(/[^a-z0-9]/g, '');
}
function extractPostcodeArea(pc) {
  if (!pc) return '';
  return pc.toUpperCase().replace(/[^A-Z].*$/, '');
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
    if (isPostcodeArea) {
      // Postcode-area matching (for existing customers with postcode codes)
      const leadLocation = lead.address || lead.location || lead.name || lead.postcode || '';
      const leadPC = lead.postcode || '';
      const leadFull = (leadLocation + ' ' + leadPC + ' ' + (lead.city || '')).toUpperCase();
      for (const area of targets) {
        const areaCode = extractPostcodeArea(area);
        if (extractPostcodeArea(leadLocation) === areaCode) { areaMatch = true; break; }
        if (extractPostcodeArea(leadPC) === areaCode) { areaMatch = true; break; }
        // Address fallback: some list-view leads have no postcode (e.g. Birmingham).
        // Map known city/town names to postcode area codes so they still match.
        if (!areaMatch && leadFull) {
          var cityToArea = {
            'B': ['BIRMINGHAM','SOLIHULL','WALSALL','WOLVERHAMPTON','WEST BROMWICH','SUTTON COLDFIELD','COVENTRY','SMETHWICK','ACOCKS GREEN','HARBORNE','MOSELEY'],
            'EN': ['ENFIELD','POTTERS BAR','HERTFORD','HODDESDON','BROXBOURNE','WALTHAM CROSS','CHESHUNT','EDMONTON','PALMERS GREEN','SOUTHGATE','BARNET','HADLEY WOOD'],
            'NW': ['WILLESDEN','CRICKLEWOOD','KILBURN','QUEENS PARK','BRONDESBURY','WEMBLEY','HENDON','EDGWARE','WEST HAMPSTEAD','SOUTH HAMPSTEAD','SWISS COTTAGE','ST JOHN\'S WOOD','FINCHLEY','GOLDERS GREEN','MILL HILL','HAMPSTEAD','KENTISH TOWN','CAMDEN','CHALK FARM','KILBURN HIGH ROAD']
          };
          var cityList = cityToArea[areaCode];
          if (cityList) {
            for (var ci = 0; ci < cityList.length; ci++) {
              if (leadFull.indexOf(cityList[ci]) !== -1) { areaMatch = true; break; }
            }
          }
        }
      }
    } else {
      // City/region matching — check if lead's address or city contains any of the target area names
      var leadText = ((lead.city || '') + ' ' + (lead.address || '') + ' ' + (lead.name || '') + ' ' + (lead.postcode || '')).toLowerCase();
      for (const area of targets) {
        var areaLower = (area || '').toLowerCase().trim();
        if (!areaLower || areaLower === 'all uk') { areaMatch = true; break; }
        if (leadText.includes(areaLower)) { areaMatch = true; break; }
        // County-to-postcode matching: check if the lead's postcode area matches the target county
        if (!areaMatch && lead.postcode) {
          var pcCode = extractPostcodeArea(lead.postcode);
          var countyPostcodes = {
            'essex': ['CM','CO','SS','IG'],'hertfordshire':['AL','EN','HP','SG','WD'],'kent':['CT','DA','ME','TN'],
            'surrey':['CR','GU','KT','RH','SM','TW'],'sussex':['BN','RH','TN'],'hampshire':['GU','PO','SO','SP','RG'],
            'berkshire':['RG','SL'],'buckinghamshire':['HP','MK','SL'],'oxfordshire':['OX'],'bedfordshire':['LU','MK'],
            'cambridgeshire':['CB','PE'],'norfolk':['IP','NR','PE'],'suffolk':['CO','IP','NR'],
            'london':['E','EC','N','NW','SE','SW','W','WC','BR','CR','DA','EN','HA','IG','KT','RM','SM','TN','TW','UB'],
            'birmingham':['B'],'manchester':['M'],'liverpool':['L'],'leeds':['LS'],'sheffield':['S'],
            'bristol':['BS'],'nottingham':['NG'],'leicester':['LE'],'cardiff':['CF'],'edinburgh':['EH'],
            'glasgow':['G'],'belfast':['BT']
          };
          if (countyPostcodes[areaLower] && countyPostcodes[areaLower].indexOf(pcCode) >= 0) { areaMatch = true; break; }
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
        var appTypeMatched = false;
        if (Array.isArray(filterTypes) && filterTypes.length > 0) {
          filterTypes = filterTypes.map(function(t) { return t.toLowerCase(); });
          appTypeMatched = filterTypes.some(function(t) { return appType.includes(t); });
          if (!appTypeMatched) return { match: false };
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

  return { match: true, tier: tier };
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
  }

  // Probate specific fields
  if (product === 'probate') {
    base.deceasedName = rawLead.name || '';
    base.deceasedAddress = rawLead.deceasedAddress || '';
    base.address = base.address || rawLead.deceasedAddress || '';
    base.dateOfDeath = rawLead.dateOfDeath || '';
    base.claimExpiry = rawLead.claimExpiry || '';
    base.estateValue = rawLead.estateValue || '';
    base.estateValueLabel = rawLead.estateValueLabel || '';
    base.registry = rawLead.registry || '';
    base.legalAdvisor = rawLead.legalAdvisor || '';
    base.legalAdvisorEmail = rawLead.legalAdvisorEmail || '';
    base.legalAdvisorPhone = rawLead.legalAdvisorPhone || '';
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
  }

  // Tenders specific fields
  if (product === 'tenders') {
    base.tenderTitle = rawLead.title || rawLead.name || '';
    base.buyer = rawLead.buyer || rawLead.authority || '';
    base.buyerEmail = rawLead.buyerEmail || '';
    base.buyerPhone = rawLead.buyerPhone || '';
    base.value = rawLead.value || '';
    base.contractType = rawLead.contractType || '';
    base.publishedDate = rawLead.publishedDate || '';
    base.closingDate = rawLead.closingDate || '';
    base.cpvCodes = rawLead.cpvCodes || [];
    base.cpvCode = rawLead.cpvCode || '';
    base.tenderNoticeId = rawLead.tenderNoticeId || '';
    base.contractValue = rawLead.contractValue || '';
    base.contractValueLabel = rawLead.contractValueLabel || '';
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

  // When no scraped leads exist, still continue to Phase 4 generation (targeted lead creation)
  if (allScrapedLeads.length > 0) {
    // Filter to today's leads only
    const today = getTodayStr();
    const todayLeads = allScrapedLeads.filter(l => {
      const scrapedDate = l.scrapedAt ? l.scrapedAt.split('T')[0] : '';
      return scrapedDate === today;
    });
    allScrapedLeads = todayLeads.length > 0 ? todayLeads : allScrapedLeads;
    console.log(`  Leads from today: ${todayLeads.length} (using ${allScrapedLeads.length})`);
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

    // Per-lead exclusivity: every lead goes to all matching customers,
    // but each customer only gets their daily limit.
    // Once a customer hits their quota, remaining leads in their area
    // are offered to other matching businesses.
    // The specific leads delivered at 9am are exclusive to each recipient.
    const matchedCustomers = []; // { customer, tier }
    for (const customer of activeCustomers) {
      const result = leadMatchesTarget(rawLead, customer, product);
      if (result.match) {
        matchedCustomers.push({ customer, tier: result.tier });
      }
    }

    if (matchedCustomers.length === 0) { noMatch++; continue; }
    leadAssignments.push({ lead: rawLead, normalised, addrKey, customers: matchedCustomers });
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
    customerLimits[c.id] = c.leads_per_day || 5;
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
    var pc = leadData.lead.postcode || leadData.lead.address || leadData.lead.location || '';
    return extractPostcodeArea(pc);
  }

  function assignLead(leadData, rawLeadData, addrKeyData, tierFilter) {
    const { lead: rl, normalised: nl, addrKey: ak, customers } = leadData;
    const leadArea = getLeadPostcodeArea(leadData);
    // Filter customers by tier, then sort by per-postcode usage (fewest first)
    // to spread leads evenly across postcodes, then by total usage.
    const eligible = customers.filter(mc => mc.tier <= tierFilter);
    eligible.sort((a, b) => {
      var au = customerPostcodeUsage[a.customer.id][leadArea] || 0;
      var bu = customerPostcodeUsage[b.customer.id][leadArea] || 0;
      if (au !== bu) return au - bu;
      return customerUsage[a.customer.id] - customerUsage[b.customer.id];
    });

    for (const mc of eligible) {
      const c = mc.customer;
      if (customerUsage[c.id] >= customerLimits[c.id]) continue;
      // Check if this lead is already in this customer's batch (dedup by address)
      var alreadyAssigned = db.leads.some(function(l) { return l.customer_id === c.id && l.data && l.data.includes(ak); });
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
      };
      db.leads.push(leadRecord);
      existingAddresses.add(ak);
      customerUsage[c.id]++;
      if (leadArea) customerPostcodeUsage[c.id][leadArea] = (customerPostcodeUsage[c.id][leadArea] || 0) + 1;
      inserted++;
      // Track lead count on customer record
      var ldCust = db.customers.find(function(x) { return x.id === c.id; });
      if (ldCust) ldCust.lead_count = (ldCust.lead_count || 0) + 1;
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

  // Phase 3b: Enrich newly inserted leads with full addresses + postcodes.
  // Fetches each property's detail page for the postcode, then uses Postcoder
  // (licensed Royal Mail PAF) to add the exact house number.
  try {
    if (inserted > 0 && product === 'moving') {
      const rmScraper = require('./rightmove_scraper_v2.js');
      var insertedLeads = db.leads.filter(function(l) { return l.customer_id && l.product === product && l.delivered === 0 && (l.created_at || '').startsWith(now.substring(0, 10)); });
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
        // Postcoder adds the exact house number from licensed Royal Mail PAF data
        if (ld.postcode) {
          var streetHint = (detail && detail.fullAddress) || ld.address || '';
          var fullAddr = await rmScraper.lookupPostcoderAddress(ld.postcode, streetHint);
          if (fullAddr) {
            ld.address = fullAddr.address1 || fullAddr.fullAddress || ld.address;
            ld.fullAddress = fullAddr.fullAddress || ld.address;
            ld.street = fullAddr.street || ld.street || '';
            ld.buildingNumber = fullAddr.buildingNumber || '';
            ld.postcode = fullAddr.postcode || ld.postcode;
            ld.udprn = fullAddr.udprn || '';
          }
        }
        rec.data = JSON.stringify(ld);
        enriched++;
        if (ei % 3 === 0 && ei > 0) { await new Promise(function(r) { setTimeout(r, 250); }); }
      }
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
