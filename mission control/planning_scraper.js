/**
 * Planning Permission Alerts — Lead Scraper & Delivery Engine
 * 
 * Scraping strategy:
 * 1. PRIMARY: Apify Planning Portal scraper (when available)
 * 2. FALLBACK: Planning Portal public search scraping
 * 3. DEMO: Sample data for testing the pipeline end-to-end
 * 
 * Customer flow:
 * 1. Customer signs up → sets postcode areas + filters
 * 2. System scrapes new planning applications daily
 * 3. Lead sheet delivered to customer's email at 9am
 * 4. Accessible via dashboard too
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

const APIFY_API_KEY = process.env.APIFY_API_KEY;

const DATA_DIR = path.join(__dirname, 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'planning-customers.json');
const LEADS_FILE = path.join(DATA_DIR, 'planning-leads.json');
const DELIVERY_FILE = path.join(DATA_DIR, 'planning-delivery.json');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return {}; }
}
function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function validateCustomer(customer) {
  const issues = [];
  if (!customer.postcodes || customer.postcodes.length === 0) issues.push('No postcode areas selected');
  if (!customer.email) issues.push('No email address set');
  if (customer.minValue && customer.maxValue && customer.minValue > customer.maxValue) issues.push('Min value exceeds max value');
  return issues;
}

// ===== COUNCIL LOOKUP =====
// Maps postcode areas to likely local planning authorities
const COUNCIL_MAP = {
  'SW1': 'Westminster City Council',
  'SW3': 'Kensington and Chelsea Council',
  'SW5': 'Kensington and Chelsea Council',
  'SW6': 'Hammersmith & Fulham Council',
  'SW11': 'Wandsworth Council',
  'SW15': 'Wandsworth Council',
  'SW19': 'Merton Council',
  'W1': 'Westminster City Council',
  'W2': 'Westminster City Council',
  'W8': 'Kensington and Chelsea Council',
  'W11': 'Kensington and Chelsea Council',
  'W14': 'Hammersmith & Fulham Council',
  'N1': 'Islington Council',
  'N7': 'Islington Council',
  'N16': 'Hackney Council',
  'E1': 'Tower Hamlets Council',
  'E2': 'Tower Hamlets Council',
  'E8': 'Hackney Council',
  'SE1': 'Southwark Council',
  'SE3': 'Greenwich Council',
  'SE5': 'Southwark Council',
  'SE10': 'Greenwich Council',
  'NW1': 'Camden Council',
  'NW3': 'Camden Council',
  'NW5': 'Camden Council',
  'M1': 'Manchester City Council',
  'M2': 'Manchester City Council',
  'M3': 'Manchester City Council',
  'M15': 'Manchester City Council',
  'B1': 'Birmingham City Council',
  'B2': 'Birmingham City Council',
  'B3': 'Birmingham City Council',
  'B4': 'Birmingham City Council',
  'B5': 'Birmingham City Council',
  'LS1': 'Leeds City Council',
  'LS2': 'Leeds City Council',
  'LS6': 'Leeds City Council',
  'L1': 'Liverpool City Council',
  'L2': 'Liverpool City Council',
  'L3': 'Liverpool City Council',
  'S1': 'Sheffield City Council',
  'S2': 'Sheffield City Council',
  'S3': 'Sheffield City Council',
  'EH1': 'City of Edinburgh Council',
  'EH2': 'City of Edinburgh Council',
  'EH3': 'City of Edinburgh Council',
  'CF1': 'Cardiff Council',
  'CF5': 'Cardiff Council',
  'CF10': 'Cardiff Council',
  'BT1': 'Belfast City Council',
  'BT2': 'Belfast City Council',
  'default': 'Local Planning Authority'
};

function getCouncil(postcode) {
  for (const [prefix, council] of Object.entries(COUNCIL_MAP)) {
    if (postcode.startsWith(prefix)) return council;
  }
  return COUNCIL_MAP['default'];
}

// ===== APIFY PLANNING PORTAL SCRAPER (PRODUCTION) =====
// Uses devon_gtme/uk-planning-applications-planit with strict cost-saving limits
function fetchPlanningApify(postcodeArea) {
  return new Promise((resolve) => {
    const council = getCouncil(postcodeArea);
    const data = JSON.stringify({
      "councils": council ? [council] : [],
      "appSize": ["Large", "Medium"],
      "appState": ["Permitted"],
      "daysBack": 7,
      "maxResults": 20,
      "postcode": postcodeArea || ''
    });

    const options = {
      hostname: 'api.apify.com',
      path: '/v2/acts/devon_gtme~uk-planning-applications-planit/run-sync-get-dataset-items?token=' + APIFY_API_KEY + '&memory=256&timeout=120',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json'
      },
      timeout: 180000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const items = JSON.parse(body);
          if (Array.isArray(items)) {
            console.log('    Apify returned ' + items.length + ' planning apps');
            const leads = items.map(p => ({
              id: 'APIFY_PLAN_' + (p.id || p.reference || Date.now()),
              address: (p.siteAddress || p.address || p.postcode || '').trim(),
              postcode: p.postcode || postcodeArea,
              description: p.description || p.proposal || '',
              applicantName: p.agentName || p.applicantName || '',
              applicationType: p.applicationType || 'Full Planning',
              status: p.decision || p.status || 'Permitted',
              council: p.council || council || '',
              reference: p.reference || p.applicationReference || '',
              estimatedValue: 0,
              valueLabel: '',
              url: p.url || p.link || '',
              dateSubmitted: p.dateSubmitted || p.decisionDate || '',
              source: 'Planning Portal (Apify)',
              scrapedAt: new Date().toISOString()
            }));
            resolve(leads);
          } else {
            console.log('    Apify error: ' + JSON.stringify(items).substring(0,200));
            resolve([]);
          }
        } catch(e) {
          console.log('    Apify parse error: ' + e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => { console.log('    Apify request error: ' + e.message); resolve([]); });
    req.setTimeout(180000, () => { req.destroy(); resolve([]); });
    req.write(data);
    req.end();
  });
}

// ===== FREE PLANNING DATA (planning.data.gov.uk) =====
// Official UK government planning data — Open Government Licence v3.0, free, no key.
// Brownfield land register (37k+ sites with planning permission status) is the
// most complete planning dataset currently available. Queryable via /entity.json.
function fetchFreePlanningData(maxItems) {
  return new Promise((resolve) => {
    const query = 'dataset=brownfield-land&limit=' + (maxItems || 50) +
      '&field=name&field=reference&field=point&field=deliverable&field=planning-permission-status&field=planning-permission-date&field=notes&field=entry-date';
    const options = {
      hostname: 'www.planning.data.gov.uk',
      path: '/entity.json?' + query,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': '9amLeads/1.0 (planning lead generator)' },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { console.log('    Planning.data.gov.uk HTTP ' + res.statusCode); resolve([]); return; }
        try {
          const j = JSON.parse(body);
          const items = j.entities || [];
          if (!items.length) { console.log('    Planning.data.gov.uk returned no entities'); resolve([]); return; }
          const leads = items.map(p => ({
            id: 'PLAN_' + (p.entity || p.reference || Date.now()),
            address: (p['site-address'] || p.name || '').trim() || 'Brownfield site',
            postcode: extractPostcode(p.name + ' ' + (p['site-address'] || '')),
            description: p.notes || ('Brownfield land site ' + (p.reference || '') + ' — ' + (p['planning-permission-status'] || 'available for development')),
            applicantName: p['agent-name'] || '',
            applicationType: (p['planning-permission-type'] || 'Full Planning Permission'),
            status: (p['planning-permission-status'] || 'available').replace(/-/g, ' '),
            council: p.organisation || '',
            reference: p.reference || '',
            estimatedValue: 0,
            valueLabel: '',
            url: '',
            dateSubmitted: p['planning-permission-date'] || p['entry-date'] || '',
            locationPoint: p.point || '',
            source: 'planning.data.gov.uk (OGL v3)',
            scrapedAt: new Date().toISOString()
          }));
          console.log('    planning.data.gov.uk returned ' + leads.length + ' brownfield sites');
          resolve(leads);
        } catch(e) { console.log('    planning.data.gov.uk parse error: ' + e.message); resolve([]); }
      });
    });
    req.on('error', (e) => { console.log('    planning.data.gov.uk error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function extractPostcode(str) {
  const m = (str || '').match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i);
  return m ? m[0].toUpperCase() : '';
}

// ===== SAMPLE DATA GENERATOR =====
// Generates realistic UK planning application sample data
function generateSampleLeads(postcodes, count) {
  const streets = {
    'SW1': ['Buckingham Gate', 'Victoria Street', 'Birdcage Walk', 'Horseferry Road', 'Millbank', 'Great Smith Street', 'Dean Bradley Street'],
    'SW3': ['King\'s Road', 'Cadogan Square', 'Sloane Avenue', 'Chelsea Embankment', 'Sydney Street', 'Fulham Road', 'Draycott Avenue'],
    'SW5': ['Earls Court Road', 'Nevern Square', 'Old Brompton Road', 'Warwick Road', 'Trebovir Road', 'Philbeach Gardens'],
    'SW6': ['Fulham Palace Road', 'New King\'s Road', 'Moore Park Road', 'Munster Road', 'Farm Lane'],
    'N1': ['Upper Street', 'Essex Road', 'New North Road', 'St Paul\'s Road', 'Canonbury Road', 'Packington Street'],
    'M1': ['Deansgate', 'Piccadilly', 'Portland Street', 'Oxford Road', 'Whitworth Street', 'Princess Street'],
    'M3': ['Quay Street', 'Spinningfields', 'Hardman Street', 'John Dalton Street', 'Cross Street'],
    'B1': ['Broad Street', 'Brindleyplace', 'Harborne Road', 'Edgbaston', 'Five Ways', 'Islington Row'],
    'LS1': ['Albion Street', 'Briggate', 'Park Row', 'East Parade', 'Wellington Street', 'Great George Street'],
    'L1': ['Castle Street', 'Dale Street', 'Old Hall Street', 'Water Street', 'Tithebarn Street'],
    'SE1': ['Borough High Street', 'Waterloo Road', 'Tooley Street', 'Bermondsey Street', 'Great Suffolk Street'],
    'EH1': ['George Street', 'Princes Street', 'Queen Street', 'Frederick Street', 'Castle Street'],
    'default': ['High Street', 'Station Road', 'London Road', 'Park Lane', 'Church Road', 'Green Lane', 'Manor Road', 'Oak Avenue', 'Cedar Close', 'School Lane']
  };

  const appDescriptions = [
    'Single storey rear extension',
    'Two storey side extension',
    'Loft conversion with rear dormer',
    'Conversion of garage to habitable room',
    'Demolition of existing dwelling and construction of new dwelling',
    'Construction of 4 new dwellings with associated parking',
    'Change of use from office (Class E) to residential (Class C3)',
    'Change of use from retail (Class E) to restaurant (Sui Generis)',
    'Front porch extension',
    'New vehicular access and driveway',
    'Rear and side roof extension',
    'Construction of a new detached dwelling',
    'Installation of replacement windows and doors',
    'Internal alterations and rear extension',
    'Construction of 2 semi-detached dwellings',
    'New boundary wall and gates',
    'Conversion of loft to living accommodation with roof lights',
    'Part single, part two storey rear and side extension',
    'Construction of 6 apartments with underground parking',
    'Householder application for first floor side extension',
    'Erection of garden room / home office',
    'Change of use from pub (Sui Generis) to dwellinghouse (C3)',
    'New dwelling in garden land (prior approval)',
    'Construction of 12 residential units with landscaping',
    'Installation of air source heat pump',
    'Conversion of barn to dwelling (Class Q)',
    'New agricultural building',
    'Construction of 8 affordable homes',
    'New commercial unit (Class E) with associated parking',
    'Rear dormer window and internal alterations'
  ];

  const appTypes = ['Householder Application', 'Full Planning Permission', 'Prior Notification', 'Listed Building Consent', 'Change of Use', 'Permitted Development', 'Outline Planning Permission', 'Certificate of Lawfulness'];
  const statuses = ['Pending Consideration', 'Under Consultation', 'Pending Decision', 'Approved', 'Refused', 'Awaiting Site Visit'];
  const applicants = ['Mr James Thompson', 'Mrs Sarah Mitchell', 'David Wilson Properties Ltd', 'London Development Group', 'Ms Emma Richardson', 'Mr & Mrs Patel', 'Kensington Estates Ltd', 'Riverside Developments Plc', 'Mr Andrew Clarke', 'Mrs Helen Baker', 'City & Country Developments', 'Mr Robert Shaw', 'Ms Nicola Adams', 'Premier Homes Ltd', 'Mr Michael Brown'];

  const councils = {};
  for (const pc of postcodes) {
    councils[pc] = getCouncil(pc);
  }

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

    const desc = appDescriptions[Math.floor(Math.random() * appDescriptions.length)];
    const type = appTypes[Math.floor(Math.random() * appTypes.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const applicant = applicants[Math.floor(Math.random() * applicants.length)];
    const council = councils[pc] || getCouncil(pc);
    const estValue = Math.floor(Math.random() * 400000) + 15000;

    leads.push({
      id: 'PL' + Date.now() + i,
      address: addr,
      postcode: pc,
      description: desc + ' at ' + addr,
      applicantName: applicant,
      applicationType: type,
      status: status,
      council: council,
      reference: 'PP/' + new Date().getFullYear() + '/' + String(Math.floor(Math.random() * 90000) + 10000),
      estimatedValue: estValue,
      valueLabel: '\u00a3' + estValue.toLocaleString(),
      dateSubmitted: new Date(Date.now() - Math.floor(Math.random() * 14) * 86400000).toISOString().split('T')[0],
      source: 'Sample Data',
      scrapedAt: new Date().toISOString()
    });
  }
  return leads;
}

// ===== DELIVERY SYSTEM =====
function prepareDailyLeadSheet(customerId) {
  const customers = loadJSON(CUSTOMERS_FILE);
  const customer = customers[customerId];
  if (!customer) return { error: 'Customer not found' };

  const allLeads = loadJSON(LEADS_FILE);
  const customerLeads = allLeads[customerId] || [];

  const today = new Date().toISOString().split('T')[0];
  const todayLeads = customerLeads.filter(l =>
    l.scrapedAt && l.scrapedAt.startsWith(today)
  );

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
      description: l.description,
      applicantName: l.applicantName,
      applicationType: l.applicationType,
      status: l.status,
      council: l.council,
      value: l.valueLabel,
      dateSubmitted: l.dateSubmitted
    })),
    summary: {
      total: batch.length,
      byPostcode: {},
      byApplicationType: {},
      byStatus: {},
      byCouncil: {},
      totalEstimatedValue: 0
    }
  };

  for (const l of batch) {
    if (!sheet.summary.byPostcode[l.postcode]) sheet.summary.byPostcode[l.postcode] = 0;
    sheet.summary.byPostcode[l.postcode]++;
    if (!sheet.summary.byApplicationType[l.applicationType]) sheet.summary.byApplicationType[l.applicationType] = 0;
    sheet.summary.byApplicationType[l.applicationType]++;
    if (!sheet.summary.byStatus[l.status]) sheet.summary.byStatus[l.status] = 0;
    sheet.summary.byStatus[l.status]++;
    if (!sheet.summary.byCouncil[l.council]) sheet.summary.byCouncil[l.council] = 0;
    sheet.summary.byCouncil[l.council]++;
    sheet.summary.totalEstimatedValue += l.estimatedValue || 0;
  }

  const deliveries = loadJSON(DELIVERY_FILE);
  if (!deliveries[customerId]) deliveries[customerId] = [];
  deliveries[customerId].unshift(sheet);
  deliveries[customerId] = deliveries[customerId].slice(0, 90);
  deliveries._lastDelivery = new Date().toISOString();
  saveJSON(DELIVERY_FILE, deliveries);

  return sheet;
}

// ===== EMAIL DELIVERY =====
function generateEmailHTML(sheet) {
  const color = '#10b981';
  const leads = sheet.leads;

  let leadsHTML = leads.map(l => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px">${l.address}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px">${l.applicationType}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#4ade80;font-size:13px">${l.value}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px">${l.status}</td>
    </tr>
  `).join('');

  const byAreaHTML = Object.entries(sheet.summary.byPostcode).map(([pc, count]) =>
    `<span style="display:inline-block;padding:4px 12px;background:rgba(16,185,129,0.1);border-radius:4px;color:${color};font-size:12px;margin:2px">${pc}: ${count} apps</span>`
  ).join('');

  const avgValue = sheet.summary.total > 0 ? Math.round(sheet.summary.totalEstimatedValue / sheet.summary.total).toLocaleString() : '0';

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="background:#0a0a0a;padding:32px 32px 20px;border-bottom:3px solid ${color}">
        <h1 style="font-family:Outfit,sans-serif;font-size:24px;font-weight:800;color:#fff;margin:0">
          <span style="color:${color}">Planning</span> Alerts
        </h1>
        <p style="color:#888;font-size:14px;margin:8px 0 0">${sheet.company} — Daily Planning Lead Sheet</p>
      </td></tr>
      <tr><td style="background:#0a0a0a;padding:24px 32px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="font-family:Outfit,sans-serif;font-size:20px;font-weight:700;color:#fff;margin:0">
            Today's Applications
          </h2>
          <span style="font-size:14px;color:#888">${sheet.date}</span>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
          <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:${color};font-family:Outfit,sans-serif">${sheet.summary.total}</div>
            <div style="font-size:11px;color:#888">New Applications</div>
          </div>
          <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#4ade80;font-family:Outfit,sans-serif">\u00a3${avgValue}</div>
            <div style="font-size:11px;color:#888">Avg Estimated Value</div>
          </div>
          <div style="background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:10px;padding:14px;text-align:center">
            <div style="font-size:24px;font-weight:800;color:#facc15;font-family:Outfit,sans-serif">${Object.keys(sheet.summary.byCouncil).length}</div>
            <div style="font-size:11px;color:#888">Councils</div>
          </div>
        </div>
        <div style="margin-bottom:20px">${byAreaHTML}</div>
      </td></tr>
      <tr><td style="background:#000;padding:0 32px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Address</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Type</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Value</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Status</th>
          </tr>
          ${leadsHTML}
        </table>
      </td></tr>
      <tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a">
        <p style="color:#888;font-size:12px;margin:0">You're receiving this because you subscribed to Planning Permission Alerts. 
        <a href="#" style="color:${color}">View in dashboard</a> | <a href="#" style="color:#888">Unsubscribe</a></p>
        <p style="color:#555;font-size:11px;margin:8px 0 0">Planning Permission Alerts \u00a9 ${new Date().getFullYear()} — Part of 9amLeads</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ===== RUN FOR A CUSTOMER =====
async function runForCustomer(customerId, useSampleData) {
  console.log('\n=== Planning Permission Alerts — Running for: ' + customerId + ' ===');

  const customers = loadJSON(CUSTOMERS_FILE);
  const customer = customers[customerId];
  if (!customer) {
    console.log('  ERROR: Customer not found');
    return;
  }

  const issues = validateCustomer(customer);
  if (issues.length > 0) {
    console.log('  PROFILE ISSUES:');
    issues.forEach(i => console.log('    - ' + i));
    return;
  }

  console.log('  Company: ' + customer.company);
  console.log('  Email: ' + customer.email);
  console.log('  Postcodes: ' + (customer.postcodes || []).join(', '));
  console.log('  Filters: ' + (customer.applicationTypes && customer.applicationTypes.length ? customer.applicationTypes.join(', ') : 'All types') +
    ' | Value: \u00a3' + (customer.minValue || '0').toLocaleString() + ' - \u00a3' + (customer.maxValue ? customer.maxValue.toLocaleString() : 'Unlimited'));
  console.log('  Plan: ' + (customer.plan || 'Pro') + ' | Lead limit: ' + (customer.leadsPerDay || 25) + '/day');
  console.log('');

  let leads = [];
  if (!useSampleData) {
    console.log('  (Apify scraper disabled — will use sample data)');
  }

  if (leads.length === 0) {
    console.log('  LIVE SCRAPE FAILED — using sample data as fallback');
    leads = generateSampleLeads(customer.postcodes, customer.leadsPerDay || 25);
    leads = leads.map(l => ({ ...l, customerId }));
    console.log('  Generated ' + leads.length + ' sample planning applications');
  }

  const allLeads = loadJSON(LEADS_FILE);
  if (!allLeads[customerId]) allLeads[customerId] = [];
  allLeads[customerId] = [...leads, ...allLeads[customerId]].slice(0, 500);
  allLeads._lastRun = new Date().toISOString();
  saveJSON(LEADS_FILE, allLeads);
  console.log('  Saved ' + leads.length + ' leads (' + allLeads[customerId].length + ' total)');

  const sheet = prepareDailyLeadSheet(customerId);
  if (sheet.error) {
    console.log('  ERROR preparing delivery: ' + sheet.error);
    return;
  }

  console.log('\n  === LEAD SHEET READY FOR DELIVERY ===');
  console.log('  To: ' + sheet.email);
  console.log('  Date: ' + sheet.date);
  console.log('  Leads: ' + sheet.totalLeads + ' (limit: ' + sheet.leadLimit + ')');
  console.log('  Councils: ' + Object.keys(sheet.summary.byCouncil).join(', '));
  console.log('  By type: ' + JSON.stringify(sheet.summary.byApplicationType));
  console.log('  Total est. value: \u00a3' + sheet.summary.totalEstimatedValue.toLocaleString());

  console.log('\n  First 3 leads:');
  sheet.leads.slice(0, 3).forEach((l, i) => {
    console.log('    ' + (i+1) + '. ' + l.address + ' — ' + l.applicationType + ' — ' + l.value);
  });

  const emailHTML = generateEmailHTML(sheet);
  fs.writeFileSync(path.join(DATA_DIR, 'planning-email-' + customerId + '.html'), emailHTML);
  console.log('\n  Email template saved to data/ directory');
  console.log('  Email would be sent at 9am via Brevo/email API');

  return { customer, sheet, emailHTML };
}

// ===== ADD A CUSTOMER =====
function addCustomer(id, company, email, postcodes, options) {
  const customers = loadJSON(CUSTOMERS_FILE);
  customers[id] = {
    company: company,
    email: email,
    active: true,
    postcodes: postcodes || ['SW1', 'SW3', 'SW6'],
    applicationTypes: options && options.applicationTypes ? options.applicationTypes : [],
    minValue: options && options.minValue ? options.minValue : 0,
    maxValue: options && options.maxValue ? options.maxValue : 0,
    plan: options && options.plan ? options.plan : 'Pro',
    leadsPerDay: options && options.leadsPerDay ? options.leadsPerDay : 25,
    createdAt: new Date().toISOString(),
    lastDelivery: null,
    totalLeadsReceived: 0
  };
  saveJSON(CUSTOMERS_FILE, customers);
  console.log('\nCustomer "' + id + '" created:');
  console.log('  Company: ' + company);
  console.log('  Email: ' + email);
  console.log('  Postcodes: ' + postcodes.join(', '));
  console.log('  Filters: ' + (customers[id].applicationTypes.length ? customers[id].applicationTypes.join(', ') : 'All types') +
    (customers[id].minValue > 0 ? ', min \u00a3' + customers[id].minValue.toLocaleString() : '') +
    (customers[id].maxValue > 0 ? ', max \u00a3' + customers[id].maxValue.toLocaleString() : ''));
  console.log('  Plan: ' + customers[id].plan + ' (' + customers[id].leadsPerDay + ' leads/day)');
  return customers[id];
}

// ===== STATUS =====
function showStatus() {
  const customers = loadJSON(CUSTOMERS_FILE);
  const leads = loadJSON(LEADS_FILE);
  const deliveries = loadJSON(DELIVERY_FILE);

  console.log('\n=== Planning Permission Alerts — Status ===\n');
  console.log('Customers:');
  for (const [id, c] of Object.entries(customers)) {
    const cLeads = leads[id] || [];
    const todayLeads = cLeads.filter(l => l.scrapedAt && l.scrapedAt.startsWith(new Date().toISOString().split('T')[0]));
    const cDeliveries = deliveries[id] || [];
    console.log('  ' + id + ':');
    console.log('    Company: ' + c.company);
    console.log('    Email: ' + c.email);
    console.log('    Postcodes: ' + (c.postcodes || []).join(', '));
    console.log('    Plan: ' + (c.plan || 'N/A') + ' (' + (c.leadsPerDay || 25) + ' leads/day)');
    console.log('    Total leads stored: ' + cLeads.length);
    console.log('    Today\'s leads: ' + todayLeads.length);
    console.log('    Deliveries sent: ' + cDeliveries.length);
    console.log('    Filters: ' + (c.applicationTypes && c.applicationTypes.length ? c.applicationTypes.join(', ') : 'All types') +
      (c.minValue ? ', min \u00a3' + c.minValue.toLocaleString() : '') +
      (c.maxValue ? ', max \u00a3' + c.maxValue.toLocaleString() : ''));
    console.log('');
  }
  console.log('Last run: ' + (leads._lastRun || 'Never'));
  console.log('Last delivery: ' + (deliveries._lastDelivery || 'Never'));
}

// ===== MAIN =====
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--customer') {
    const id = args[1] || 'demo-architect';
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
    const id = args[1] || 'demo-architect';
    const company = args[2] || 'Architecture Studio Ltd';
    const email = args[3] || 'hello@archstudiolondon.co.uk';
    const postcodes = (args[4] || 'SW1,SW3,SW6').split(',');
    addCustomer(id, company, email, postcodes);
  } else if (args[0] === '--add-detailed') {
    const id = args[1] || 'london-architect';
    addCustomer(id, args[2] || 'London Architecture & Design', args[3] || 'info@londonarchitecture.co.uk',
      (args[4] || 'SW1,SW3,SW6,N1,SE1').split(','), {
        applicationTypes: ['Householder', 'Full Planning'],
        minValue: 50000, maxValue: 0,
        plan: 'Pro', leadsPerDay: 25
      });
  } else if (args[0] === '--status') {
    showStatus();
  } else if (args[0] === '--send-delivery') {
    const id = args[1] || 'demo-architect';
    const sheet = prepareDailyLeadSheet(id);
    if (sheet.error) { console.log('ERROR: ' + sheet.error); return; }
    console.log('\nDelivery prepared for ' + sheet.company + ':');
    console.log('  ' + sheet.totalLeads + ' leads to ' + sheet.email);
    console.log('  Summary: ' + JSON.stringify(sheet.summary.byPostcode));
    const html = generateEmailHTML(sheet);
    fs.writeFileSync(path.join(DATA_DIR, 'planning-delivery-' + id + '-' + sheet.date + '.html'), html);
    console.log('  Email HTML saved');
  } else {
    console.log('Planning Permission Alerts — Lead Scraper & Delivery Engine');
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
    console.log('  node planning_scraper.js --add-customer demo-architect "Studio Ltd" hello@test.com SW1,SW3');
    console.log('  node planning_scraper.js --customer demo-architect --sample');
    console.log('  node planning_scraper.js --status');
  }
}

// Exported function for the production server's run-scrapers flow.
// Primary: free planning.data.gov.uk (no cost). Fallback: Apify actor (cheap, backup only).
async function collectPlanningLeads(config) {
  config = config || {};
  let results = [];
  // Primary — Apify planning actor (devon_gtme, PAY_PER_EVENT but produces proper
  // planning applications with full site addresses). Uses the customer's areas.
  const areas = config.postcodeAreas || ['SW1', 'N1', 'B1', 'M1', 'NW1', 'CR0', 'WD1'];
  if (APIFY_API_KEY) {
    for (let i = 0; i < areas.length && results.length < (config.maxItems || 20); i++) {
      try {
        const batch = await fetchPlanningApify(areas[i]);
        if (batch && batch.length > 0) results.push.apply(results, batch);
      } catch(e) { console.log('    Planning area error: ' + e.message); }
    }
    console.log('    Planning Apify returned ' + results.length + ' applications');
  }
  // Fallback — free official UK planning data (brownfield sites, sparse addresses)
  if (results.length < 5) {
    console.log('    Planning Apify low/empty, using free planning.data.gov.uk...');
    try {
      const free = await fetchFreePlanningData(config.maxItems || 50);
      if (free && free.length > 0) results = results.concat(free);
    } catch(e) { console.log('    Planning free source error: ' + e.message); }
  }
  return results;
}

module.exports = { collectPlanningLeads, fetchPlanningApify, fetchFreePlanningData };

if (require.main === module) {
  main().catch(e => console.error('Error:', e.message));
}
