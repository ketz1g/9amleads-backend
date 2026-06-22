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

// Check if a lead's postcode district is exclusively claimed by a specific customer
function getExclusiveClaimant(lead, product) {
  const assignments = loadPostcodeAssignments();
  const leadDistrict = extractDistrict(lead.postcode || lead.address || lead.location || '');
  if (!leadDistrict) return null;

  // Check exact district match first, then prefix match
  for (const [code, assignment] of Object.entries(assignments.assignments)) {
    if (assignment.status !== 'active') continue;
    if (assignment.product !== product) continue;
    const codeLower = code.toLowerCase();
    if (leadDistrict === codeLower || leadDistrict.startsWith(codeLower)) {
      return assignment.customer_id;
    }
  }
  return null;
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

// Check if a lead's location matches a customer's target area
function leadMatchesTarget(lead, targetAreas) {
  if (!targetAreas || targetAreas.length === 0) return true; // no filter = match all

  // Check address text first (contains city names like "London", "Manchester"),
  // then fall back to postcode for exact prefix matching.
  const leadLocation = lead.address || lead.location || lead.name || lead.postcode || '';
  const leadNorm = normalisePostcode(leadLocation);

  for (const area of targetAreas) {
    const areaNorm = normalisePostcode(area);
    if (!areaNorm) continue;
    // Match if lead postcode starts with target area prefix
    if (leadNorm.startsWith(areaNorm) || areaNorm.startsWith(leadNorm)) return true;
    // Also match if address contains the area name
    if (leadLocation.toLowerCase().includes(area.toLowerCase())) return true;
    // Also match if lead has a city field that matches the area
    if (lead.city && lead.city.toLowerCase() === area.toLowerCase()) return true;
  }
  return false;
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
  }

  return base;
}

async function distributeProduct(product) {
  const config = PRODUCT_LEAD_FILES[product];
  if (!config) {
    console.log(`  Unknown product: ${product}`);
    return { product, matched: 0, total: 0 };
  }

  const db = loadJSON(DB_FILE);
  if (!db || !db.customers) {
    console.log(`  Database not found or empty`);
    return { product, matched: 0, total: 0 };
  }

  // Load scraped leads for this product
  const productLeadsFile = path.join(DATA_DIR, config.file);
  const scrapedData = loadJSON(productLeadsFile);
  if (!scrapedData) {
    console.log(`  No scraped leads file: ${config.file}`);
    return { product, matched: 0, total: 0 };
  }

  // Get customers subscribed to this product
  const productCustomers = db.customers.filter(c =>
    c.product === product &&
    c.plan !== 'cancelled' &&
    (!c.bounced || c.bounced < 3)
  );

  if (productCustomers.length === 0) {
    console.log(`  No active customers for ${product}`);
    return { product, matched: 0, total: 0 };
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

  if (allScrapedLeads.length === 0) {
    console.log(`  No leads found in scraped data`);
    return { product, matched: 0, total: 0 };
  }

  console.log(`  Total scraped leads available: ${allScrapedLeads.length}`);

  // Filter to today's leads only
  const today = getTodayStr();
  const todayLeads = allScrapedLeads.filter(l => {
    const scrapedDate = l.scrapedAt ? l.scrapedAt.split('T')[0] : '';
    return scrapedDate === today;
  });

  const leadsToProcess = todayLeads.length > 0 ? todayLeads : allScrapedLeads;
  console.log(`  Leads from today: ${todayLeads.length} (using ${leadsToProcess.length})`);

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
    return { product, matched: 0, total: leadsToProcess.length, inserted: 0, duplicates: 0 };
  }

  for (const rawLead of leadsToProcess) {
    const normalised = normaliseLead(rawLead, product, '');
    const addrKey = normalised.address.toLowerCase().trim();
    if (addrKey && existingAddresses.has(addrKey)) { duplicates++; continue; }

    // Check exclusivity: if a postcode is claimed exclusively, restrict to that customer
    const exclusiveClaimant = getExclusiveClaimant(rawLead, product);
    const matchedCustomers = [];
    for (const customer of activeCustomers) {
      if (exclusiveClaimant && customer.id !== exclusiveClaimant) continue;

      const targetAreas = (() => {
        try { return JSON.parse(customer.target_areas || '[]'); }
        catch { return []; }
      })();
      if (!targetAreas.length || leadMatchesTarget(rawLead, targetAreas)) {
        matchedCustomers.push(customer);
      }
    }

    if (matchedCustomers.length === 0) { noMatch++; continue; }
    leadAssignments.push({ lead: rawLead, normalised, addrKey, customers: matchedCustomers });
  }

  // Phase 2: Round-robin distribution (exclusivity already applied above)
  const customerUsage = {};
  const customerLabels = {};
  activeCustomers.forEach(c => {
    customerUsage[c.id] = 0;
    customerLabels[c.id] = c.company || c.email;
  });

  // Sort leads with fewest matching customers first (scarcer leads go first)
  leadAssignments.sort((a, b) => a.customers.length - b.customers.length);

  for (const assignment of leadAssignments) {
    const { lead: rawLead, normalised, addrKey, customers } = assignment;

    // Sort customers by usage (least served first) for fair rotation
    customers.sort((a, b) => customerUsage[a.id] - customerUsage[b.id]);

    for (const customer of customers) {
      const limit = customer.leads_per_day || 5;
      if (customerUsage[customer.id] >= limit) continue;

      const leadRecord = {
        id: uuidv4(),
        customer_id: customer.id,
        product: product,
        data: JSON.stringify(normaliseLead(rawLead, product, customer.id)),
        status: 'new',
        delivered: 0,
        created_at: now,
        delivered_at: null,
      };

      db.leads.push(leadRecord);
      existingAddresses.add(addrKey);
      customerUsage[customer.id]++;
      inserted++;
      break;
    }
  }

  saveJSON(DB_FILE, db);

  const totalMatched = Object.values(customerUsage).reduce((a, b) => a + b, 0);
  for (const [cid, count] of Object.entries(customerUsage)) {
    if (count > 0) console.log(`    ${customerLabels[cid] || cid}: ${count} leads`);
  }
  console.log(`  Result: ${inserted} inserted, ${duplicates} duplicates, ${noMatch} unmatched`);
  return { product, matched: totalMatched, total: leadsToProcess.length, inserted, duplicates, noMatch };
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
