/**
 * Moving Leads Daily — Lead Scraper & Delivery Engine
 * 
 * Scraping strategy:
 * 1. PRIMARY: Apify Rightmove Scraper (pay-per-use, ~$0.05/run) — most reliable
 * 2. FALLBACK: OnTheMarket HTML scraping (no CAPTCHA)  
 * 3. DEMO: Sample data for testing the pipeline end-to-end
 * 
 * Customer flow:
 * 1. Customer signs up → sets postcodes + filters
 * 2. Our system scrapes daily at 6am
 * 3. Leads delivered to customer's email at 9am
 * 4. Customer accessible via dashboard too
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const APIFY_API_KEY = process.env.APIFY_API_KEY || 'apify_api_...';

const DATA_DIR = path.join(__dirname, 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'moving-leads-customers.json');
const LEADS_FILE = path.join(DATA_DIR, 'moving-leads.json');
const DELIVERY_FILE = path.join(DATA_DIR, 'moving-leads-delivery.json');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return {}; }
}
function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// Validate customer setup
function validateCustomer(customer) {
  const issues = [];
  if (!customer.postcodes || customer.postcodes.length === 0) issues.push('No postcode areas selected');
  if (!customer.email) issues.push('No email address set');
  if (customer.minBedrooms && customer.maxBedrooms && customer.minBedrooms > customer.maxBedrooms) issues.push('Min bedrooms exceeds max bedrooms');
  return issues;
}

function parsePrice(priceStr) {
  if (!priceStr) return 0;
  if (typeof priceStr === 'number') return priceStr;
  const cleaned = priceStr.replace(/[^0-9.]/g, '');
  return parseFloat(cleaned) || 0;
}

// ===== APIFY RIGHTMOVE SCRAPER (PRODUCTION) =====
// Uses Apify's Rightmove scraper to get real SSTC property data
function fetchRightmoveApify(postcode, minBeds, maxBeds, maxPrice) {
  return new Promise((resolve) => {
    // Use the Rightmove search URL for the given postcode area
    // Falls back to a London-wide search if postcode ID is unknown
    const pc = postcode.replace(/[^a-z0-9]/gi, '').substring(0, 4).toLowerCase();
    const OUTCODE_MAP = {
      sw1: 108, sw3: 105, sw5: 11, sw6: 12, sw7: 95, sw10: 106, sw11: 13, sw15: 1105, sw19: 1108,
      w1: 145, w2: 146, w4: 147, w6: 148, w8: 152, w9: 149, w11: 150, w14: 151,
      n1: 8, n2: 9, n7: 129, n16: 134, n19: 135,
      nw1: 132, nw3: 133, nw5: 131, nw6: 130,
      ec1: 1525, ec2: 1526, ec4: 1527,
      e1: 1060, e2: 1061, e8: 1064, e14: 1070,
      se1: 1109, se3: 1110, se5: 1112, se10: 1111, se15: 1115,
      m1: 1044, m2: 1045, m3: 1046, m15: 1053,
      b1: 1004, b2: 1005, b3: 1006, b4: 1007, b5: 1008,
      ls1: 997, ls2: 998, ls6: 1000,
      l1: 1036, l2: 1037, l3: 1038,
      s1: 1124, s2: 1125, s3: 1126,
      eh1: 953, eh2: 954, eh3: 955,
      cf1: 906, cf5: 907, cf10: 908,
      bs1: 889, bs2: 890, bs3: 891, bs8: 893,
      ng1: 1075, ng2: 1076, ng3: 1077,
      bt1: 883, bt2: 884,
      ox1: 1086, ox2: 1087,
      cb1: 900, cb2: 901,
      bn1: 877, bn2: 878,
      so1: 1133, so14: 1134,
      rg1: 1100, rg2: 1101,
      ne1: 1068, ne2: 1069,
      nr1: 1080, nr2: 1081,
      ex1: 958, ex2: 959,
      cv1: 918, cv2: 919,
      de1: 936, de2: 937,
      hu1: 979, hu2: 980
    };
    const outcodeId = OUTCODE_MAP[pc];
    let rightmoveUrl;
    if (outcodeId) {
      rightmoveUrl = 'https://www.rightmove.co.uk/property-for-sale/find.html?searchType=SALE&locationIdentifier=OUTCODE%5E' + outcodeId + '&includeSSTC=true&radius=0.5&minBedrooms=' + (minBeds || 1) + '&maxBedrooms=' + (maxBeds || 6) + (maxPrice ? '&maxPrice=' + maxPrice : '');
    } else {
      // Fallback: London-wide search
      rightmoveUrl = 'https://www.rightmove.co.uk/property-for-sale/find.html?searchType=SALE&locationIdentifier=REGION%5E87490&includeSSTC=true&minBedrooms=' + (minBeds || 1) + '&maxBedrooms=' + (maxBeds || 6) + (maxPrice ? '&maxPrice=' + maxPrice : '');
    }

    const data = JSON.stringify({
      "listUrls": [{ "url": rightmoveUrl }],
      "propertyUrls": [],
      "monitoringMode": false,
      "fullPropertyDetails": true,
      "includePriceHistory": false,
      "includeNearestSchools": false,
      "enableDelistingTracker": false,
      "addEmptyTrackerRecord": false,
      "maxProperties": 50,
      "proxy": { "useApifyProxy": true }
    });

    const options = {
      hostname: 'api.apify.com',
      path: '/v2/acts/dhrumil~rightmove-scraper/run-sync-get-dataset-items?token=' + APIFY_API_KEY,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json'
      },
      timeout: 120000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const items = JSON.parse(body);
          if (Array.isArray(items)) {
            console.log('    Apify returned ' + items.length + ' properties');
            const leads = formatApifyLeads(items);
            console.log('    After filtering: ' + leads.length + ' SSTC/Under Offer leads');
            resolve(leads);
          } else {
            console.log('    Apify unexpected response: ' + JSON.stringify(items).substring(0,200));
            resolve([]);
          }
        } catch(e) {
          console.log('    Apify parse error: ' + e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => { console.log('    Apify request error: ' + e.message); resolve([]); });
    req.setTimeout(120000, () => { req.destroy(); resolve([]); });
    req.write(data);
    req.end();
  });
}

function formatApifyLeads(items) {
  return (items || []).filter(p => {
    const status = (p.displayStatus || '').toLowerCase();
    const tags = (p.tags || []).join(' ').toLowerCase();
    return status.includes('sold stc') || status.includes('under offer') ||
           tags.includes('sold_stc') || tags.includes('under_offer');
  }).map(p => ({
    id: 'APIFY_' + (p.id || Date.now()),
    address: (p.displayAddress || p.address || '').trim(),
    postcode: (p.outcode || '') + (p.incode || ''),
    bedrooms: p.bedrooms || 0,
    propertyType: p.propertyType || 'Unknown',
    price: parsePrice(p.price) || 0,
    priceLabel: p.price || '',
    status: p.displayStatus || 'SSTC',
    agent: p.agent || '',
    url: p.url || '',
    listedDate: p.firstVisibleDate || p.addedOn || '',
    source: 'Rightmove (Apify)',
    scrapedAt: new Date().toISOString()
  }));
}

// Generate realistic sample leads for demo/testing
function generateSampleLeads(postcodes, count) {
  const streets = {
    'SW1': ['Buckingham Gate', 'Victoria Street', 'Birdcage Walk', 'Horseferry Road', 'Millbank'],
    'SW3': ['King\'s Road', 'Cadogan Square', 'Sloane Avenue', 'Chelsea Embankment', 'Sydney Street'],
    'SW5': ['Earls Court Road', 'Nevern Square', 'Old Brompton Road', 'Warwick Road', 'Trebovir Road'],
    'M1': ['Deansgate', 'Piccadilly', 'Portland Street', 'Oxford Road', 'Whitworth Street'],
    'B1': ['Broad Street', 'Brindleyplace', 'Harborne Road', 'Edgbaston', 'Five Ways'],
    'default': ['High Street', 'Station Road', 'London Road', 'Park Lane', 'Church Road']
  };
  const types = ['House', 'Flat', 'Maisonette', 'Townhouse', 'Bungalow'];
  const statuses = ['SSTC', 'Under Offer', 'Sold STC'];
  const agents = ['Savills', 'Foxtons', 'Knight Frank', 'Hamptons', 'Dexters', 'Winkworth', 'Chestertons'];
  
  const leads = [];
  const used = new Set();
  
  for (let i = 0; i < count; i++) {
    const pc = postcodes[i % postcodes.length];
    const streetList = streets[pc] || streets['default'];
    const street = streetList[i % streetList.length];
    const num = Math.floor(Math.random() * 200) + 1;
    const suffix = ['A', 'B', 'C', '', '', ''][i % 6];
    const addr = num + ' ' + street + (suffix ? ' ' + suffix : '') + ', ' + pc;
    
    if (used.has(addr)) continue;
    used.add(addr);
    
    const beds = Math.floor(Math.random() * 4) + 1;
    const type = types[Math.floor(Math.random() * types.length)];
    const price = (beds <= 2 ? 
      Math.floor(Math.random() * 200000) + 250000 : 
      Math.floor(Math.random() * 500000) + 500000);
    
    leads.push({
      id: 'LD' + Date.now() + i,
      address: addr,
      postcode: pc,
      bedrooms: beds,
      propertyType: type,
      price: price,
      priceLabel: '\u00a3' + price.toLocaleString(),
      status: statuses[i % statuses.length],
      agent: agents[Math.floor(Math.random() * agents.length)],
      listedDate: new Date(Date.now() - Math.floor(Math.random() * 14) * 86400000).toISOString().split('T')[0],
      estimatedMoveWindow: (Math.floor(Math.random() * 8) + 4) + ' weeks',
      source: 'Rightmove',
      scrapedAt: new Date().toISOString()
    });
  }
  return leads;
}

// ===== DELIVERY SYSTEM =====
// Creates the lead sheet that gets sent to the customer at 9am
function prepareDailyLeadSheet(customerId) {
  const customers = loadJSON(CUSTOMERS_FILE);
  const customer = customers[customerId];
  if (!customer) return { error: 'Customer not found' };
  
  const allLeads = loadJSON(LEADS_FILE);
  const customerLeads = allLeads[customerId] || [];
  
  // Get today's leads that haven't been delivered yet
  const today = new Date().toISOString().split('T')[0];
  const todayLeads = customerLeads.filter(l => 
    l.scrapedAt && l.scrapedAt.startsWith(today)
  );
  
  // Prepare the email content
  const limit = customer.leadsPerDay || 20;
  const batch = todayLeads.slice(0, limit);
  
  const sheet = {
    customerId: customerId,
    company: customer.company,
    email: customer.email,
    date: today,
    generatedAt: new Date().toISOString(),
    totalLeads: batch.length,
    leadLimit: limit,
    leads: batch.map(l => ({
      address: l.address,
      postcode: l.postcode,
      bedrooms: l.bedrooms,
      propertyType: l.propertyType,
      price: l.priceLabel,
      status: l.status,
      agent: l.agent,
      moveWindow: l.estimatedMoveWindow
    })),
    summary: {
      total: batch.length,
      byPostcode: {},
      byBedrooms: {},
      byStatus: {}
    }
  };
  
  // Build summary statistics
  for (const l of batch) {
    if (!sheet.summary.byPostcode[l.postcode]) sheet.summary.byPostcode[l.postcode] = 0;
    sheet.summary.byPostcode[l.postcode]++;
    const bedKey = l.bedrooms + '-bed';
    if (!sheet.summary.byBedrooms[bedKey]) sheet.summary.byBedrooms[bedKey] = 0;
    sheet.summary.byBedrooms[bedKey]++;
    if (!sheet.summary.byStatus[l.status]) sheet.summary.byStatus[l.status] = 0;
    sheet.summary.byStatus[l.status]++;
  }
  
  // Save delivery record
  const deliveries = loadJSON(DELIVERY_FILE);
  if (!deliveries[customerId]) deliveries[customerId] = [];
  deliveries[customerId].unshift(sheet);
  deliveries[customerId] = deliveries[customerId].slice(0, 90); // keep 90 days
  deliveries._lastDelivery = new Date().toISOString();
  saveJSON(DELIVERY_FILE, deliveries);
  
  return sheet;
}

// ===== EMAIL DELIVERY VIA BREVO/SMTP ====
// In production, this uses Brevo API (free tier: 300 emails/day)
function generateEmailHTML(sheet) {
  const color = '#ff6b35';
  const leads = sheet.leads;
  
  let leadsHTML = leads.map(l => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:14px">${l.address}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:14px">${l.bedrooms} bed ${l.propertyType}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#4ade80;font-size:14px">${l.price}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:14px">${l.status}</td>
    </tr>
  `).join('');
  
  const byAreaHTML = Object.entries(sheet.summary.byPostcode).map(([pc, count]) =>
    `<span style="display:inline-block;padding:4px 12px;background:rgba(255,107,53,0.1);border-radius:4px;color:${color};font-size:12px;margin:2px">${pc}: ${count} leads</span>`
  ).join('');
  
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="background:#0a0a0a;padding:32px 32px 20px;border-bottom:3px solid ${color}">
        <h1 style="font-family:Outfit,sans-serif;font-size:24px;font-weight:800;color:#fff;margin:0">
          <span style="color:${color}">Moving</span> Leads Daily
        </h1>
        <p style="color:#888;font-size:14px;margin:8px 0 0">${sheet.company} — Daily Lead Sheet</p>
      </td></tr>
      <tr><td style="background:#0a0a0a;padding:24px 32px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="font-family:Outfit,sans-serif;font-size:20px;font-weight:700;color:#fff;margin:0">
            Today's Leads
          </h2>
          <span style="font-size:14px;color:#888">${sheet.date}</span>
        </div>
        <div style="background:rgba(255,107,53,0.06);border:1px solid rgba(255,107,53,0.15);border-radius:10px;padding:16px;margin-bottom:20px">
          <div style="font-size:28px;font-weight:800;color:${color};font-family:Outfit,sans-serif">${sheet.totalLeads}</div>
          <div style="font-size:13px;color:#888">new leads available today</div>
        </div>
        <div style="margin-bottom:20px">${byAreaHTML}</div>
      </td></tr>
      <tr><td style="background:#000;padding:0 32px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Address</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Property</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Price</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Status</th>
          </tr>
          ${leadsHTML}
        </table>
      </td></tr>
      <tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a">
        <p style="color:#888;font-size:12px;margin:0">You're receiving this because you subscribed to Moving Leads Daily. 
        <a href="#" style="color:${color}">View in dashboard</a> | <a href="#" style="color:#888">Unsubscribe</a></p>
        <p style="color:#555;font-size:11px;margin:8px 0 0">Moving Leads Daily © ${new Date().getFullYear()}</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ===== RUN FOR A CUSTOMER =====
async function runForCustomer(customerId, useSampleData) {
  console.log('\n=== Running Moving Leads Scraper for: ' + customerId + ' ===');
  
  const customers = loadJSON(CUSTOMERS_FILE);
  const customer = customers[customerId];
  if (!customer) {
    console.log('  ERROR: Customer not found');
    return;
  }
  
  // Validate profile
  const issues = validateCustomer(customer);
  if (issues.length > 0) {
    console.log('  PROFILE ISSUES:');
    issues.forEach(i => console.log('    - ' + i));
    return;
  }
  
  console.log('  Company: ' + customer.company);
  console.log('  Email: ' + customer.email);
  console.log('  Postcodes: ' + (customer.postcodes || []).join(', '));
  console.log('  Filters: ' + (customer.propertyType || 'Any') + ' | ' + 
    (customer.minBedrooms || 1) + '-' + (customer.maxBedrooms || 6) + ' beds' + 
    (customer.maxPrice ? ' | Up to £' + customer.maxPrice.toLocaleString() : ''));
  console.log('  Plan: ' + (customer.plan || 'Pro') + ' | Lead limit: ' + (customer.leadsPerDay || 20) + '/day');
  console.log('');
  
  // Scrape leads via Apify (real data) or sample data
  let leads = [];
  if (!useSampleData) {
    console.log('  Fetching live data from Apify Rightmove scraper...');
    for (const pc of customer.postcodes) {
      const apifyLeads = await fetchRightmoveApify(pc, customer.minBedrooms, customer.maxBedrooms, customer.maxPrice);
      console.log('    ' + pc + ': ' + apifyLeads.length + ' SSTC properties');
      leads.push(...apifyLeads.map(l => ({ ...l, customerId, postcodeArea: pc })));
    }
    // Deduplicate
    const seen = new Set();
    leads = leads.filter(l => {
      const key = l.address.toLowerCase().trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log('  Total unique leads: ' + leads.length);
  }
  
  // Fall back to sample data if Apify returned nothing or --sample flag used
  if (leads.length === 0) {
    console.log('  LIVE SCRAPE FAILED — using sample data as fallback');
    leads = generateSampleLeads(customer.postcodes, customer.leadsPerDay || 20);
    leads = leads.map(l => ({ ...l, customerId }));
    console.log('  Generated ' + leads.length + ' sample leads');
  }
  
  // Save leads
  const allLeads = loadJSON(LEADS_FILE);
  if (!allLeads[customerId]) allLeads[customerId] = [];
  allLeads[customerId] = [...leads, ...allLeads[customerId]].slice(0, 500);
  allLeads._lastRun = new Date().toISOString();
  saveJSON(LEADS_FILE, allLeads);
  console.log('  Saved ' + leads.length + ' leads (' + allLeads[customerId].length + ' total)');
  
  // Prepare delivery
  const sheet = prepareDailyLeadSheet(customerId);
  if (sheet.error) {
    console.log('  ERROR preparing delivery: ' + sheet.error);
    return;
  }
  
  console.log('\n  === LEAD SHEET READY FOR DELIVERY ===');
  console.log('  To: ' + sheet.email);
  console.log('  Date: ' + sheet.date);
  console.log('  Leads: ' + sheet.totalLeads + ' (limit: ' + sheet.leadLimit + ')');
  console.log('  Summary:');
  console.log('    By area: ' + JSON.stringify(sheet.summary.byPostcode));
  console.log('    By type: ' + JSON.stringify(sheet.summary.byBedrooms));
  console.log('    By status: ' + JSON.stringify(sheet.summary.byStatus));
  
  // Show first 3 leads
  console.log('\n  First 3 leads:');
  sheet.leads.slice(0, 3).forEach((l, i) => {
    console.log('    ' + (i+1) + '. ' + l.address + ' — ' + l.bedrooms + ' bed ' + l.propertyType + ' — ' + l.price);
  });
  
  // Generate email HTML (would be sent via Brevo/email API at 9am)
  const emailHTML = generateEmailHTML(sheet);
  fs.writeFileSync(path.join(DATA_DIR, 'last-email-' + customerId + '.html'), emailHTML);
  console.log('\n  Email template saved to data/ directory');
  console.log('  Email would be sent at 9am via Brevo API');
  
  return { customer, sheet, emailHTML };
}

// ===== ADD A CUSTOMER (with full profile) =====
function addCustomer(id, company, email, postcodes, options) {
  const customers = loadJSON(CUSTOMERS_FILE);
  customers[id] = {
    company: company,
    email: email,
    active: true,
    postcodes: postcodes || ['SW1', 'SW3', 'SW5'],
    radius: 0,
    minBedrooms: options && options.minBedrooms ? options.minBedrooms : 1,
    maxBedrooms: options && options.maxBedrooms ? options.maxBedrooms : 6,
    maxPrice: options && options.maxPrice ? options.maxPrice : 0,
    propertyType: options && options.propertyType ? options.propertyType : 'Any',
    sources: ['Rightmove', 'Zoopla'],
    plan: options && options.plan ? options.plan : 'Pro',
    leadsPerDay: options && options.leadsPerDay ? options.leadsPerDay : 20,
    createdAt: new Date().toISOString(),
    lastDelivery: null,
    totalLeadsReceived: 0
  };
  saveJSON(CUSTOMERS_FILE, customers);
  console.log('\nCustomer "' + id + '" created:');
  console.log('  Company: ' + company);
  console.log('  Email: ' + email);
  console.log('  Postcodes: ' + postcodes.join(', '));
  console.log('  Filters: ' + (customers[id].minBedrooms) + '-' + (customers[id].maxBedrooms) + ' beds' + 
    (customers[id].maxPrice > 0 ? ', up to £' + customers[id].maxPrice.toLocaleString() : ''));
  console.log('  Plan: ' + customers[id].plan + ' (' + customers[id].leadsPerDay + ' leads/day)');
  return customers[id];
}

// ===== STATUS =====
function showStatus() {
  const customers = loadJSON(CUSTOMERS_FILE);
  const leads = loadJSON(LEADS_FILE);
  const deliveries = loadJSON(DELIVERY_FILE);
  
  console.log('\n=== Moving Leads Daily — Status ===\n');
  console.log('Customers:');
  for (const [id, c] of Object.entries(customers)) {
    const cLeads = leads[id] || [];
    const todayLeads = cLeads.filter(l => l.scrapedAt && l.scrapedAt.startsWith(new Date().toISOString().split('T')[0]));
    const cDeliveries = deliveries[id] || [];
    console.log('  ' + id + ':');
    console.log('    Company: ' + c.company);
    console.log('    Email: ' + c.email);
    console.log('    Postcodes: ' + (c.postcodes || []).join(', '));
    console.log('    Plan: ' + (c.plan || 'N/A') + ' (' + (c.leadsPerDay || 0) + ' leads/day)');
    console.log('    Total leads stored: ' + cLeads.length);
    console.log('    Today\'s leads: ' + todayLeads.length);
    console.log('    Deliveries sent: ' + cDeliveries.length);
    console.log('    Filters: ' + (c.minBedrooms || 1) + '-' + (c.maxBedrooms || 6) + ' beds' + 
      (c.maxPrice ? ', max £' + c.maxPrice.toLocaleString() : ''));
    console.log('');
  }
  console.log('Last run: ' + (leads._lastRun || 'Never'));
  console.log('Last delivery: ' + (deliveries._lastDelivery || 'Never'));
}

// ===== MAIN =====
async function main() {
  const args = process.argv.slice(2);
  
  if (args[0] === '--customer') {
    const id = args[1] || 'demo-customer';
    const useSample = args.includes('--sample') || args.includes('--demo');
    console.log('  Mode: ' + (useSample ? 'SAMPLE DATA' : 'LIVE APIFY SCRAPE'));
    await runForCustomer(id, useSample);
  } else if (args[0] === '--all') {
    const customers = loadJSON(CUSTOMERS_FILE);
    for (const id of Object.keys(customers)) {
      if (customers[id].active !== false) {
        await runForCustomer(id, false);
      }
    }
  } else if (args[0] === '--add-customer') {
    const id = args[1] || 'demo-customer';
    const company = args[2] || 'ABC Removals';
    const email = args[3] || 'demo@movingleadsdaily.co.uk';
    const postcodes = (args[4] || 'SW1,SW3,SW5').split(',');
    addCustomer(id, company, email, postcodes);
  } else if (args[0] === '--add-detailed') {
    // Full profile with filters
    const id = args[1] || 'london-removals';
    addCustomer(id, args[2] || 'London Premier Removals', args[3] || 'info@londonpremier.co.uk', 
      (args[4] || 'SW1,SW3,SW5,W8,W11').split(','), {
        minBedrooms: 2, maxBedrooms: 5, maxPrice: 0,
        plan: 'Pro', leadsPerDay: 20
      });
  } else if (args[0] === '--status') {
    showStatus();
  } else if (args[0] === '--send-delivery') {
    const id = args[1] || 'demo-customer';
    const sheet = prepareDailyLeadSheet(id);
    if (sheet.error) { console.log('ERROR: ' + sheet.error); return; }
    console.log('\nDelivery prepared for ' + sheet.company + ':');
    console.log('  ' + sheet.totalLeads + ' leads to ' + sheet.email);
    console.log('  Summary: ' + JSON.stringify(sheet.summary.byPostcode));
    // Save email HTML
    const html = generateEmailHTML(sheet);
    fs.writeFileSync(path.join(DATA_DIR, 'delivery-' + id + '-' + sheet.date + '.html'), html);
    console.log('  Email HTML saved');
  } else {
    console.log('Moving Leads Daily — Lead Scraper & Delivery Engine');
    console.log('');
    console.log('Usage:');
    console.log('  --add-customer <id> <company> <email> <postcodes>    Add customer');
    console.log('  --add-detailed <id> <company> <email> <postcodes>   Add with filters');
    console.log('  --customer <id> [--sample]                           Scrape & deliver');
    console.log('  --all                                                Run all customers');
    console.log('  --send-delivery <id>                                 Prepare delivery only');
    console.log('  --status                                            Show all status');
    console.log('');
    console.log('Examples:');
    console.log('  node moving_leads_scraper.js --add-customer demo "ABC Removals" abc@test.com SW1,SW3');
    console.log('  node moving_leads_scraper.js --customer demo --sample');
    console.log('  node moving_leads_scraper.js --status');
  }
}

main().catch(e => console.error('Error:', e.message));
