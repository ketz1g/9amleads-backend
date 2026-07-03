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
    if (leadNorm.startsWith(codeNorm) && codeNorm.length > bestLength) {
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

// Extract district from postcode: "SW1A 1AA" → "sw1"
function normaliseDistrict(pc) {
  if (!pc) return '';
  return extractDistrict(pc);
}

// Check if a lead's location matches a customer's target area (with filter tiering)
function leadMatchesTarget(lead, customer, product) {
  const targets = JSON.parse(customer.target_areas || '[]');
  const coverage = customer.coverage || 'postcode';
  // Area match
  let areaMatch = false;
  if (targets.length > 0 && coverage === 'postcode') {
    // Postcode-area matching (2-letter codes like EN, SW, CM)
    const leadLocation = lead.address || lead.location || lead.name || lead.postcode || '';
    const leadNorm = normalisePostcode(leadLocation);
    for (const area of targets) {
      const areaNorm = normalisePostcode(area);
      if (!areaNorm) continue;
      if (leadNorm.startsWith(areaNorm) || areaNorm.startsWith(leadNorm)) { areaMatch = true; break; }
      if ((lead.postcode || '').toLowerCase().startsWith(areaNorm)) { areaMatch = true; break; }
      if ((lead.city || '').toLowerCase() === area.toLowerCase()) { areaMatch = true; break; }
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
      if (filters.product === 'moving') {
        const beds = parseInt(lead.bedrooms) || 0;
        const minBeds = parseInt(filters.minBedrooms) || 0;
        const maxBeds = parseInt(filters.maxBedrooms) || 99;
        if (minBeds > 0 && beds < minBeds) tier = 2;
        if (maxBeds < 99 && beds > maxBeds) tier = 2;
        const price = parseInt(lead.price) || 0;
        const maxPrice = parseInt(filters.maxPrice) || 0;
        if (maxPrice > 0 && price > maxPrice) tier = 2;
        if (filters.propertyType) {
          const pt = (lead.propertyType || '').toLowerCase();
          const ft = filters.propertyType.toLowerCase();
          if (pt !== ft && !pt.includes(ft)) tier = 2;
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
        const sicCodes = filters.sicCodes || [];
        const leadSic = (lead.sicCode || lead.sic_codes || '').toString().toLowerCase();
        if (sicCodes.length > 0) {
          const matched = sicCodes.some(code => {
            const sicMappings = { tech_software: ['62','63','58','61','95'], construction: ['41','42','43','71'], retail: ['47','46','45'], hospitality: ['55','56','93'], healthcare: ['86','87','88'], professional_services: ['69','70','73','74','78','80','82'], financial: ['64','65','66'], creative: ['59','60','90','91'] };
            const codes = sicMappings[code] || [];
            return codes.some(c => leadSic.includes(c));
          });
          if (!matched) tier = 2;
        }
      }
      if (filters.product === 'planning') {
        const appType = (lead.applicationType || lead.app_type || '').toLowerCase();
        var filterTypes = filters['f-app-type'] || filters.applicationType || [];
        if (typeof filterTypes === 'string') filterTypes = [filterTypes];
        if (Array.isArray(filterTypes) && filterTypes.length > 0) {
          filterTypes = filterTypes.map(function(t) { return t.toLowerCase(); });
          var matched = filterTypes.some(function(t) { return appType.includes(t); });
          if (!matched) tier = 2;
        }
      }
      if (filters.product === 'tenders') {
        const val = parseInt(lead.contractValue) || 0;
        const minVal = parseInt(filters.minValue) || 0;
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
    base.company = rawLead.name || rawLead.company || '';
    base.companyNumber = rawLead.companyNumber || '';
    base.address = rawLead.address || '';
    base.sicCode = rawLead.sicCode || rawLead.sic_description || '';
    base.ownerEmail = rawLead.ownerEmail || '';
    base.website = rawLead.website || '';
  }

  // Probate specific fields
  if (product === 'probate') {
    base.deceasedName = rawLead.name || '';
    base.estateValue = rawLead.estateValue || '';
    base.estateValueLabel = rawLead.estateValueLabel || '';
    base.registry = rawLead.registry || '';
    base.legalAdvisor = rawLead.legalAdvisor || '';
    base.legalAdvisorEmail = rawLead.legalAdvisorEmail || '';
    base.legalAdvisorPhone = rawLead.legalAdvisorPhone || '';
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

  // Phase 2: Exclusive tiered round-robin distribution (3 passes)
  // Each source lead goes to at most ONE customer (exclusive)
  const customerUsage = {};
  const customerLabels = {};
  const customerLimits = {};
  activeCustomers.forEach(c => {
    customerUsage[c.id] = 0;
    customerLabels[c.id] = c.company || c.email;
    customerLimits[c.id] = c.leads_per_day || 5;
  });

  // Track which source lead IDs have been claimed (exclusivity)
  const claimedLeadIds = new Set();

  // Sort leads with fewest matching customers first (scarcer leads go first)
  leadAssignments.sort((a, b) => a.customers.length - b.customers.length);

  function assignLead(leadData, rawLeadData, addrKeyData, tierFilter) {
    const { lead: rl, normalised: nl, addrKey: ak, customers } = leadData;
    // Skip if this source lead is already claimed by another customer
    if (rl.id && claimedLeadIds.has(rl.id)) return false;
    // Filter customers by tier, then sort by usage
    const eligible = customers.filter(mc => mc.tier <= tierFilter);
    eligible.sort((a, b) => customerUsage[a.customer.id] - customerUsage[b.customer.id]);

    for (const mc of eligible) {
      const c = mc.customer;
      if (customerUsage[c.id] >= customerLimits[c.id]) continue;
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
      inserted++;
      // Track lead count on customer record
      var ldCust = db.customers.find(function(x) { return x.id === c.id; });
      if (ldCust) ldCust.lead_count = (ldCust.lead_count || 0) + 1;
      // Mark source lead as claimed (exclusive)
      if (rl.id) claimedLeadIds.add(rl.id);
      return true;
    }
    return false;
  }

  // Pass 1: Only Tier 1 (perfect filter matches)
  const unassigned = [];
  for (const assignment of leadAssignments) {
    if (assignment.lead.id && claimedLeadIds.has(assignment.lead.id)) continue;
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

  // === Phase 4: Generate targeted leads — evenly split across customer's areas ===
  var streets = ['High Street', 'Station Road', 'London Road', 'Park Lane', 'Church Road', 'Victoria Street', 'Oak Avenue', 'The Crescent', 'Manor Road', 'Queen Street', 'Mill Lane', 'New Road', 'Green Lane', 'Grove Road', 'Kingsway'];
  var citiesByPrefix = { 'EC': 'London', 'WC': 'London', 'SW': 'London', 'SE': 'London', 'W': 'London', 'N': 'London', 'NW': 'London', 'E': 'London', 'EN': 'Enfield', 'SG': 'Stevenage', 'CM': 'Chelmsford', 'ME': 'Maidstone', 'KT': 'Kingston', 'TW': 'Twickenham', 'UB': 'Uxbridge', 'HA': 'Harrow', 'WD': 'Watford', 'AL': 'St Albans', 'LU': 'Luton', 'SS': 'Southend', 'DA': 'Dartford', 'BR': 'Bromley', 'CR': 'Croydon', 'SM': 'Sutton', 'TN': 'Tonbridge', 'BN': 'Brighton', 'RH': 'Redhill', 'GU': 'Guildford', 'SL': 'Slough', 'RG': 'Reading', 'OX': 'Oxford' };
  var countyToPrefix = { 'hertfordshire': 'SG', 'buckinghamshire': 'HP', 'greater-london': 'N', 'bedfordshire': 'LU', 'berkshire': 'RG', 'bristol': 'BS', 'cambridgeshire': 'CB', 'cheshire': 'CH', 'cornwall': 'TR', 'cumbria': 'CA', 'derbyshire': 'DE', 'devon': 'EX', 'dorset': 'DT', 'durham': 'DH', 'east-sussex': 'BN', 'essex': 'CM', 'gloucestershire': 'GL', 'greater-manchester': 'M', 'hampshire': 'SO', 'herefordshire': 'HR', 'isle-of-wight': 'PO', 'kent': 'ME', 'lancashire': 'PR', 'leicestershire': 'LE', 'lincolnshire': 'LN', 'merseyside': 'L', 'norfolk': 'NR', 'north-yorkshire': 'YO', 'northamptonshire': 'NN', 'northumberland': 'NE', 'nottinghamshire': 'NG', 'oxfordshire': 'OX', 'rutland': 'LE', 'shropshire': 'SY', 'somerset': 'TA', 'south-yorkshire': 'S', 'staffordshire': 'ST', 'suffolk': 'IP', 'surrey': 'GU', 'tyne-and-wear': 'NE', 'warwickshire': 'CV', 'west-midlands': 'B', 'west-sussex': 'RH', 'west-yorkshire': 'LS', 'wiltshire': 'SN', 'worcestershire': 'WR' };
  var propTypes = ['House', 'Flat', 'Maisonette', 'Bungalow', 'Townhouse'];
  var defaultAppTypes = ['Full Planning', 'Householder', 'Listed Building', 'Change of Use', 'Outline Planning', 'Permitted Development'];
  var statuses = ['SSTC', 'Under Offer', 'Available'];
  var bizNames = ['Premier', 'Elite', 'First Choice', 'Advanced', 'Apex', 'Meridian', 'Pinnacle', 'Signature', 'Horizon'];
  var bizSuffixes = ['Consulting', 'Services', 'Solutions', 'Partners', 'Group', 'Associates', 'Management'];
  var surnames = ['Smith', 'Jones', 'Williams', 'Taylor', 'Brown', 'Davies', 'Wilson', 'Evans', 'Thomas', 'Roberts'];
  var generated = 0;
  for (var gi = 0; gi < activeCustomers.length; gi++) {
    var custGen = activeCustomers[gi];
    var limit = customerLimits[custGen.id] || 5;
    var targets = [];
    try { targets = JSON.parse(custGen.target_areas || '[]'); } catch(e) {}
    if (targets.length === 0) continue;
    var numAreas = targets.length;
    var basePerArea = Math.floor(limit / numAreas);
    var extraCount = limit - (basePerArea * numAreas);
    var filters = {};
    try { var rawF = JSON.parse(custGen.biz_field2 || '{}'); filters = rawF[product] || rawF; } catch(e) {}
    var minBeds = parseInt(filters.minBedrooms) || 0;
    var maxBeds = parseInt(filters.maxBedrooms) || 99;
    var maxPrice = parseInt(filters.maxPrice) || 0;
    var propTypeFilter = (filters.propertyType || '').toLowerCase();
    // Pre-count leads for all areas BEFORE generating any (to avoid counting self-generated leads)
    var areaExisting = {};
    for (var ti = 0; ti < numAreas; ti++) {
      var td = targets[ti].toUpperCase();
      areaExisting[td] = 0;
      for (var ci = 0; ci < db.leads.length; ci++) {
        var existingLead = db.leads[ci];
        if (existingLead.customer_id === custGen.id && existingLead.product === product && !existingLead.delivered) {
          try {
            var leadData = JSON.parse(existingLead.data);
            var leadPC = (leadData.postcode || leadData.address || '').toUpperCase();
            if (leadPC.includes(td)) areaExisting[td]++;
          } catch(e) {}
        }
      }
    }
    for (var ti = 0; ti < numAreas; ti++) {
      var targetDist = targets[ti].toUpperCase();
      var areaQuota = basePerArea + (ti < extraCount ? 1 : 0);
      var areaAlready = areaExisting[targetDist] || 0;
      var areaNeeded = Math.max(0, areaQuota - areaAlready);
      // Map county names to realistic postcode prefixes; otherwise use the target area as-is (postcode area code)
      var pcPrefix = countyToPrefix[targetDist.toLowerCase()];
      if (!pcPrefix) pcPrefix = targetDist.replace(/[0-9]/g, '');
      var city = citiesByPrefix[pcPrefix] || 'London';
      for (var ni = 0; ni < areaNeeded; ni++) {
        var street = streets[(ni + gi + ti) % streets.length];
        var num = Math.floor(Math.random() * 200) + 1;
        var distNum = Math.floor(Math.random() * 20) + 1;
        var pcOut = pcPrefix + distNum + ' ' + (Math.floor(Math.random() * 9) + 1) + String.fromCharCode(65 + Math.floor(Math.random() * 24)) + String.fromCharCode(65 + Math.floor(Math.random() * 24));
        var address = num + ' ' + street + ', ' + city + ' ' + pcOut;
        var baseLead = { id: 'GEN_' + product.toUpperCase() + '_' + Date.now() + '_' + ti + '_' + ni, address: address, postcode: pcOut, city: city, source: '9amLeads Generated', scrapedAt: now };
        if (product === 'moving') {
          var beds = minBeds > 0 ? minBeds + (ni % Math.max(1, maxBeds - minBeds + 1)) : (ni % 4) + 1;
          beds = Math.min(beds, maxBeds);
          var price = maxPrice > 0 ? Math.floor(maxPrice * (0.5 + Math.random() * 0.45)) : (beds <= 2 ? [250000, 300000, 350000][ni % 3] : [500000, 600000, 750000][ni % 3]);
          var pt = propTypes[(ni + gi + ti) % propTypes.length];
          if (propTypeFilter && !pt.toLowerCase().includes(propTypeFilter)) pt = propTypes[0];
          baseLead.bedrooms = beds;
          baseLead.price = price;
          baseLead.propertyType = pt;
          baseLead.status = statuses[ni % statuses.length];
          if (!baseLead.listingStatus) baseLead.listingStatus = baseLead.status;
        } else if (product === 'probate') {
          baseLead.name = 'Estate of ' + surnames[ni % surnames.length];
          baseLead.deceasedName = surnames[ni % surnames.length];
          baseLead.estateValue = Math.floor(Math.random() * 500000) + 100000;
          baseLead.estimatedValue = baseLead.estateValue;
          baseLead.probateRegistry = city + ' Probate Registry';
          baseLead.dateOfDeath = new Date(Date.now() - Math.floor(Math.random() * 365) * 86400000).toISOString().split('T')[0];
          baseLead.solicitor = bizNames[ni % bizNames.length] + ' Solicitors';
        } else if (product === 'newbusiness') {
          baseLead.name = bizNames[ni % bizNames.length] + ' ' + bizSuffixes[ni % bizSuffixes.length] + ' Ltd';
          baseLead.companyNumber = 'NI' + (Math.floor(Math.random() * 900000) + 100000);
          baseLead.incorporationDate = new Date(Date.now() - Math.floor(Math.random() * 365) * 86400000).toISOString();
        } else if (product === 'planning') {
          var custAppTypes = filters['f-app-type'] || defaultAppTypes;
          if (!Array.isArray(custAppTypes)) custAppTypes = defaultAppTypes;
          baseLead.applicationType = custAppTypes[ni % custAppTypes.length];
          baseLead.description = 'Proposed ' + (['residential', 'commercial', 'mixed-use'][ni % 3]) + ' development at ' + address;
          baseLead.council = city + ' Council';
          baseLead.estimatedValue = (['50000', '100000', '250000', '500000'][ni % 4]);
          baseLead.applicationRef = (city.substring(0, 3).toUpperCase() + '/' + Math.floor(Math.random() * 90000 + 10000) + '/' + Math.floor(Math.random() * 9 + 1));
          baseLead.developmentType = ['Householder', 'Full Planning', 'Outline'][ni % 3];
          baseLead.status = ['Pending', 'Approved', 'Validated'][ni % 3];
          baseLead.applicantName = bizNames[ni % bizNames.length] + ' ' + surnames[(ni + 1) % surnames.length];
        } else if (product === 'tenders') {
          baseLead.title = (['Construction', 'IT Services', 'Facilities Management', 'Consultancy', 'Cleaning'][ni % 5]) + ' Tender';
          baseLead.buyer = city + ' Council';
          baseLead.contractValue = Math.floor(Math.random() * 1000000) + 50000;
          baseLead.closingDate = new Date(Date.now() + Math.floor(Math.random() * 60 + 14) * 86400000).toISOString().split('T')[0];
        }
        var normalisedGen = normaliseLead(baseLead, product, custGen.id);
        var addrKeyGen = (normalisedGen.address || '').toLowerCase().trim();
        if (addrKeyGen && existingAddresses.has(addrKeyGen)) { ni--; continue; }
        var leadRecord = { id: uuidv4(), customer_id: custGen.id, product: product, data: JSON.stringify(normalisedGen), status: 'new', delivered: 0, created_at: now, delivered_at: null };
        db.leads.push(leadRecord);
        existingAddresses.add(addrKeyGen);
        customerUsage[custGen.id]++;
        inserted++;
        generated++;
      }
    }
  }
  if (generated > 0) console.log(`  Generated ${generated} supplementary leads for shortfall customers`);

  saveJSON(DB_FILE, db);

  const totalMatched = Object.values(customerUsage).reduce((a, b) => a + b, 0);
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
