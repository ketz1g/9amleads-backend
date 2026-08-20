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
              url: p.url || p.link || (p.links && p.links.council) || p.applicationUrl || p.detailsUrl || p.detailUrl || p.webUrl || p.portalUrl || '',
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

// ===== PLOTA PLANNING APPLICATIONS API =====
// Real planning applications with full site addresses + postcodes + status.
// Query by postcode area, authority, or free-text. Optional category filter for
// even distribution across the customer's selected application types.
function fetchPlotaPlanning(postcode, maxItems, category) {
  return new Promise((resolve) => {
    const key = process.env.PLOTA_API_KEY || '';
    if (!key) { console.log('    No PLOTA_API_KEY configured'); resolve([]); return; }
    const cleanPc = (postcode || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const q = cleanPc ? '?postcode=' + encodeURIComponent(cleanPc) : '?q=' + encodeURIComponent(postcode || 'London');
    const cat = category ? '&category=' + encodeURIComponent(category) : '';
    const path = '/v1/applications' + q + cat + '&limit=' + (maxItems || 100);
    const options = {
      hostname: 'api.plota.co.uk',
      path: path,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + key, 'User-Agent': '9amLeads/1.0 (planning lead generator)' },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { console.log('    Plota HTTP ' + res.statusCode); resolve([]); return; }
        try {
          const j = JSON.parse(body);
          const items = j.data || [];
          if (!items.length) { console.log('    Plota returned no applications'); resolve([]); return; }
          const leads = items.map(p => ({
            id: 'PLOTA_' + (p.id || p.reference || Date.now()),
            address: (p.address || '').trim(),
            postcode: p.postcode || extractPostcode(p.address || ''),
            description: p.description || '',
            applicantName: p.agent_name || p.applicant_name || '',
            applicationType: (p.category && p.category.label) || 'Planning Application',
            status: p.status || 'Pending',
            council: (p.authority && p.authority.name) || p.authority || '',
            reference: p.reference || '',
            estimatedValue: 0,
            valueLabel: '',
            url: (p.links && p.links.council) || (p.url || '') || '',
            links: p.links || {},
            dateSubmitted: p.date_received || p.date_validated || '',
            locationPoint: p.location ? (p.location.lat + ',' + p.location.lng) : '',
            source: 'Planning Portal',
            scrapedAt: new Date().toISOString()
          }));
          console.log('    Plota returned ' + leads.length + ' planning applications');
          resolve(leads);
        } catch(e) { console.log('    Plota parse error: ' + e.message); resolve([]); }
      });
    });
    req.on('error', (e) => { console.log('    Plota error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// Query PLOTA by free text (e.g. "London", "Manchester") rather than a postcode.
function fetchPlotaPlanningFreeText(query, maxItems, category) {
  return new Promise((resolve) => {
    const key = process.env.PLOTA_API_KEY || '';
    if (!key) { resolve([]); return; }
    const cat = category ? '&category=' + encodeURIComponent(category) : '';
    const path = '/v1/applications?q=' + encodeURIComponent(query) + cat + '&limit=' + (maxItems || 100);
    const options = {
      hostname: 'api.plota.co.uk',
      path: path,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'Authorization': 'Bearer ' + key, 'User-Agent': '9amLeads/1.0 (planning lead generator)' },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { console.log('    Plota(free) HTTP ' + res.statusCode); resolve([]); return; }
        try {
          const j = JSON.parse(body);
          const items = j.data || [];
          if (!items.length) { resolve([]); return; }
          const leads = items.map(p => ({
            id: 'PLOTA_' + (p.id || p.reference || Date.now()),
            address: (p.address || '').trim(),
            postcode: p.postcode || extractPostcode(p.address || ''),
            proposal: p.description || '',
            applicantName: p.agent_name || p.applicant_name || '',
            applicationType: (p.category && p.category.label) || 'Planning Application',
            status: p.status || 'Pending',
            council: (p.authority && p.authority.name) || p.authority || '',
            reference: p.reference || '',
            estimatedValue: 0,
            valueLabel: '',
            url: (p.links && p.links.council) || (p.url || '') || '',
            links: p.links || {},
            dateSubmitted: p.date_received || p.date_validated || '',
            locationPoint: p.location ? (p.location.lat + ',' + p.location.lng) : '',
            source: 'Planning Portal',
            scrapedAt: new Date().toISOString()
          }));
          console.log('    Plota(free "' + query + '") returned ' + leads.length + ' applications');
          resolve(leads);
        } catch(e) { console.log('    Plota(free) parse error: ' + e.message); resolve([]); }
      });
    });
    req.on('error', (e) => { console.log('    Plota(free) error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
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

// Map signup application-type filters to PLOTA category slugs so the scraper
// pulls applications that match what the customer selected.
const PLOTA_CATEGORY_MAP = {
  'householder': 'extensions',
  'full planning': 'commercial-and-major-works',
  'full-planning': 'commercial-and-major-works',
  'outline planning': 'new-homes',
  'outline': 'new-homes',
  'listed building': 'listed-buildings',
  'listed-building': 'listed-buildings',
  'change of use': 'change-of-use',
  'change-of-use': 'change-of-use',
  'lawful development': 'extensions',
  'lawful-development': 'extensions',
  'permitted development': 'extensions',
  'permitted-development': 'extensions',
  'prior approval': 'extensions',
  'prior-approval': 'extensions',
  'demolition': 'demolition',
  'solar': 'solar-and-renewables',
  'new homes': 'new-homes',
  'commercial': 'commercial-and-major-works',
  'trees': 'trees-and-landscaping',
  'community': 'community',
  'agricultural': 'agricultural',
  'signs': 'signs-and-adverts',
  'shopfronts': 'shopfronts'
};

// Fetch planning APPLICATIONS (not just brownfield) from planning.data.gov.uk —
// the official OGL v3 source covering all UK councils/counties. This significantly
// boosts per-county supply compared to PLOTA alone (which clusters in active areas).
function fetchPlanningApplications(maxItems) {
  return new Promise((resolve) => {
    const query = 'dataset=planning-application&limit=' + (maxItems || 100) +
      '&field=site-address&field=reference&field=description&field=application-type&field=decision&field=document-url&field=entry-date&field=point';
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
        if (res.statusCode !== 200) { console.log('    planning.data.gov.uk applications HTTP ' + res.statusCode); resolve([]); return; }
        try {
          const j = JSON.parse(body);
          const items = j.entities || [];
          if (!items.length) { resolve([]); return; }
          const leads = items.map(p => ({
            id: 'PLAN_APP_' + (p.entity || p.reference || Date.now()),
            address: (p['site-address'] || '').trim() || 'Site',
            postcode: extractPostcode(p['site-address'] || ''),
            description: (p.description || '').substring(0, 400),
            applicantName: '',
            applicationType: (p['application-type'] || 'Planning Application'),
            status: (p.decision || 'pending').replace(/-/g, ' '),
            council: p.organisation || '',
            reference: p.reference || '',
            estimatedValue: 0,
            valueLabel: '',
            url: p['document-url'] || '',
            dateSubmitted: p['entry-date'] || '',
            locationPoint: p.point || '',
            source: 'planning.data.gov.uk (OGL v3)',
            scrapedAt: new Date().toISOString()
          }));
          console.log('    planning.data.gov.uk returned ' + leads.length + ' planning applications');
          resolve(leads);
        } catch(e) { resolve([]); }
      });
    });
    req.on('error', () => resolve([]));
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// Exported function for the production server's run-scrapers flow.
// Queries PLOTA per selected application type + area, then distributes evenly
// across the filter types so no single type dominates (e.g. not all trees).
async function collectPlanningLeads(config) {
  config = config || {};
  let results = [];
  // Expand region/county names into concrete postcode areas so the PLOTA query
  // targets the right places (e.g. "greater-london" -> E, N, NW, SE, SW, W, ...).
  const REGION_AREA_MAP = {
    'greater-london': ['E1','E2','E3','E4','E5','E6','E7','E8','E9','E10','E11','E12','E13','E14','E15','E16','E17','E18','E20','EC1','EC2','EC3','EC4','N1','N2','N3','N4','N5','N6','N7','N8','N9','N10','N11','N12','N13','N14','N15','N16','N17','N18','N19','N20','N21','N22','NW1','NW2','NW3','NW4','NW5','NW6','NW7','NW8','NW9','NW10','NW11','SE1','SE2','SE3','SE4','SE5','SE6','SE7','SE8','SE9','SE10','SE11','SE12','SE13','SE14','SE15','SE16','SE17','SE18','SE19','SE20','SE21','SE22','SE23','SE24','SE25','SE26','SE27','SE28','SW1','SW2','SW3','SW4','SW5','SW6','SW7','SW8','SW9','SW10','SW11','SW12','SW13','SW14','SW15','SW16','SW17','SW18','SW19','SW20','W1','W2','W3','W4','W5','W6','W7','W8','W9','W10','W11','W12','W13','W14','WC1','WC2','BR1','BR2','CR0','CR2','CR4','CR5','CR7','CR8','DA1','DA5','DA6','DA7','DA8','DA14','DA15','DA16','DA17','DA18','EN1','EN2','EN3','EN4','EN5','HA0','HA1','HA2','HA3','HA4','HA5','HA6','HA7','HA8','HA9','IG1','IG2','IG3','IG4','IG5','IG6','IG7','IG8','IG9','IG10','IG11','KT1','KT2','KT3','KT4','KT5','KT6','KT7','KT8','KT9','KT10','KT11','KT12','KT13','KT14','KT15','KT16','KT17','KT18','KT19','KT20','KT21','KT22','KT23','KT24','RM1','RM2','RM3','RM4','RM5','RM6','RM7','RM8','RM9','RM10','RM11','RM12','RM13','RM14','RM15','RM16','RM17','RM18','RM19','RM20','SM1','SM2','SM3','SM4','SM5','SM6','SM7','TN1','TN2','TN3','TN4','TN5','TN6','TN7','TN8','TN9','TN10','TN11','TN12','TN13','TN14','TN15','TN16','TN17','TN18','TN19','TN20','TN21','TN22','TN23','TN24','TN25','TN26','TN27','TN28','TN29','TN30','TN31','TN32','TN33','TN34','TN35','TN36','TN37','TN38','TN39','TN40','TW1','TW2','TW3','TW4','TW5','TW6','TW7','TW8','TW9','TW10','TW11','TW12','TW13','TW14','TW15','TW16','TW17','TW18','TW19','TW20','UB1','UB2','UB3','UB4','UB5','UB6','UB7','UB8','UB9','UB10','UB11'],
    'london': ['E1','N1','NW1','SE1','SW1','W1','EC1','WC1'],
    'west-midlands': ['B1','B2','B3','B4','B5','B6','B7','B8','B9','B10','B11','B12','B13','B14','B15','B16','B17','B18','B19','B20','B21','B22','B23','B24','B25','B26','B27','B28','B29','B30','B31','B32','B33','B34','B35','B36','B37','B38','B39','B40','B41','B42','B43','B44','B45','B46','B47','B48','B49','B50','B60','B61','B62','B63','B64','B65','B66','B67','B68','B69','B70','B71','B72','B73','B74','B75','B76','B77','B78','B79','B80','B81','B82','B83','B84','B85','B86','B87','B88','B89','B90','B91','B92','B93','B94','B95','B96','B97','B98','B99','CV1','CV2','CV3','CV4','CV5','CV6','CV7','CV8','CV9','CV10','CV11','CV12','CV13','CV14','CV15','CV16','CV17','CV18','CV19','CV20','CV21','CV22','CV23','CV31','CV32','CV33','CV34','CV35','CV36','CV37','DY1','DY2','DY3','DY4','DY5','DY6','DY7','DY8','DY9','DY10','DY11','DY12','DY13','DY14','ST1','ST2','ST3','ST4','ST5','ST6','ST7','ST8','ST9','ST10','ST11','ST12','ST13','ST14','ST15','ST16','ST17','ST18','ST19','ST20','ST21','WS1','WS2','WS3','WS4','WS5','WS6','WS7','WS8','WS9','WS10','WS11','WS12','WS13','WS14','WS15','WV1','WV2','WV3','WV4','WV5','WV6','WV7','WV8','WV9','WV10','WV11','WV12','WV13','WV14','WV15','WV16'],
    'greater-manchester': ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22','M23','M24','M25','M26','M27','M28','M29','M30','M31','M32','M33','M34','M35','M38','M40','M41','M43','M44','M45','M46','M50','OL1','OL2','OL3','OL4','OL5','OL6','OL7','OL8','OL9','OL10','OL11','OL12','OL13','OL14','OL15','OL16','BL1','BL2','BL3','BL4','BL5','BL6','BL7','BL8','BL9','Bury'],
    'liverpool': ['L1','L2','L3','L4','L5','L6','L7','L8','L9','L10','L11','L12','L13','L14','L15','L16','L17','L18','L19','L20','L21','L22','L23','L24','L25','L26','L27','L28','L29','L30','L31','L32','L33','L34','L35','L36','L37','L38','L39','L40'],
    'leeds': ['LS1','LS2','LS3','LS4','LS5','LS6','LS7','LS8','LS9','LS10','LS11','LS12','LS13','LS14','LS15','LS16','LS17','LS18','LS19','LS20','LS21','LS22','LS23','LS24','LS25','LS26','LS27','LS28','LS29'],
    'bristol': ['BS1','BS2','BS3','BS4','BS5','BS6','BS7','BS8','BS9','BS10','BS11','BS12','BS13','BS14','BS15','BS16'],
    'manchester': ['M1','M2','M3','M4','M5','M6','M7','M8','M9','M11','M12','M13','M14','M15','M16','M17','M18','M19','M20','M21','M22','M23','M24','M25','M26','M27','M28','M29','M30','M31','M32','M33','M34','M35','M38','M40','M41','M43','M44','M45','M46','M50'],
    'sheffield': ['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12','S13','S14','S15','S16','S17','S18','S19','S20','S21','S25','S26','S35','S36','S40','S41','S42','S43','S44','S45','S60','S61','S62','S63','S64','S65','S66','S70','S71','S72','S73','S74','S75','S80','S81'],
    'yorkshire': ['LS1','HD1','HG1','HU1','HX1','YO1','S1'],
    'essex': ['CM1','CM2','CM3','CM4','CM5','CM6','CM7','CM8','CM9','CM11','CM12','CM13','CM14','CM15','CM16','CM17','CM18','CM19','CM20','CM21','CM22','CM23','CM24','CO1','CO2','CO3','CO4','CO5','CO6','CO7','CO8','CO9','CO10','CO11','CO12','CO13','CO14','CO15','CO16','SS1','SS2','SS3','SS4','SS5','SS6','SS7','SS8','SS9','SS11','SS12','SS13','SS14','SS15','SS16','SS17'],
    'kent': ['CT1','CT2','CT3','CT4','CT5','CT6','CT7','CT8','CT9','CT10','CT11','CT12','CT13','CT14','CT15','CT16','CT17','CT18','CT19','CT20','CT21','DA1','DA2','DA3','DA4','DA5','DA6','DA7','DA8','DA9','DA10','DA11','DA12','DA13','DA14','DA15','DA16','DA17','DA18','ME1','ME2','ME3','ME4','ME5','ME6','ME7','ME8','ME9','ME10','ME11','ME12','ME13','ME14','ME15','ME16','ME17','ME18','ME19','ME20','TN1','TN2','TN3','TN4','TN5','TN6','TN7','TN8','TN9','TN10','TN11','TN12','TN13','TN14','TN15','TN16','TN17','TN18','TN19','TN20','TN21','TN22','TN23','TN24','TN25','TN26','TN27','TN28','TN29','TN30'],
    'surrey': ['GU1','GU2','GU3','GU4','GU5','GU6','GU7','GU8','GU9','GU10','GU11','GU12','GU13','GU14','GU15','GU16','GU17','GU18','GU19','GU20','GU21','GU22','GU23','GU24','GU25','GU26','GU27','GU28','GU29','GU30','GU31','GU32','GU33','GU34','GU35','KT1','KT2','KT3','KT4','KT5','KT6','KT7','KT8','KT9','KT10','KT11','KT12','KT13','KT14','KT15','KT16','KT17','KT18','KT19','KT20','KT21','KT22','KT23','KT24','RH1','RH2','RH3','RH4','RH5','RH6','RH7','RH8','RH9','RH10','RH11','RH12','RH13','RH14','RH15','RH16','RH17','RH18','RH19','RH20','SM1','SM2','SM3','SM4','SM5','SM6','SM7','TW1','TW2','TW3','TW4','TW5','TW6','TW7','TW8','TW9','TW10','TW11','TW12','TW13','TW14','TW15','TW16','TW17','TW18','TW19','TW20'],
    'hertfordshire': ['AL1','AL2','AL3','AL4','AL5','AL6','AL7','AL8','AL9','AL10','EN1','EN2','EN3','EN4','EN5','EN6','EN7','EN8','EN9','EN10','EN11','HP1','HP2','HP3','HP4','HP5','HP6','HP7','HP8','HP9','HP10','HP11','HP12','HP13','HP14','HP15','HP16','HP17','HP18','HP19','HP20','HP21','HP22','HP23','HP24','HP25','HP26','HP27','SG1','SG2','SG3','SG4','SG5','SG6','SG7','SG8','SG9','SG10','SG11','SG12','SG13','SG14','SG15','SG16','SG17','SG18','SG19','WD1','WD2','WD3','WD4','WD5','WD6','WD7','WD17','WD18','WD19','WD23','WD24','WD25'],
    'east-midlands': ['LE1','NG1','DE1','LN1','NN1','PE1'],
    'west-midlands-region': ['B1','CV1','DY1','ST1','WV1']
  };
  let rawAreas = config.postcodeAreas || ['SW1', 'N1', 'B1', 'M1', 'NW1', 'CR0', 'WD1'];
  // Region names (e.g. "greater-london") are queried as free text on PLOTA —
  // much lighter than expanding to hundreds of postcode areas (which rate-limits).
  // Concrete postcode areas (e.g. "SW1", "NW3") are queried by postcode.
  const REGION_QUERY_MAP = {
    'greater-london': 'London', 'london': 'London',
    'greater-manchester': 'Manchester', 'manchester': 'Manchester',
    'west-midlands': 'Birmingham', 'west-midlands-region': 'Birmingham',
    'birmingham': 'Birmingham', 'liverpool': 'Liverpool', 'leeds': 'Leeds',
    'sheffield': 'Sheffield', 'bristol': 'Bristol', 'cardiff': 'Cardiff',
    'edinburgh': 'Edinburgh', 'glasgow': 'Glasgow', 'yorkshire': 'Leeds',
    'yorkshire-and-the-humber': 'Leeds', 'north-east': 'Newcastle',
    'essex': 'Essex', 'kent': 'Kent', 'surrey': 'Surrey', 'sussex': 'Brighton',
    'hampshire': 'Southampton', 'berkshire': 'Reading',
    'buckinghamshire': 'Milton Keynes', 'oxfordshire': 'Oxford',
    'hertfordshire': 'Watford', 'east-midlands': 'Nottingham',
    'east-of-england': 'Cambridge', 'south-east': 'Brighton',
    'south-west': 'Plymouth', 'wales': 'Cardiff', 'scotland': 'Glasgow'
  };
  let areas = [];
  rawAreas.forEach(function(a) {
    const key = String(a).toLowerCase().trim().replace(/\s+/g, '-');
    const query = REGION_QUERY_MAP[key];
    if (query) {
      if (areas.indexOf('q:' + query) === -1) areas.push('q:' + query);
    } else if (REGION_AREA_MAP[key]) {
      // Fallback: expand to postcodes only for regions not in REGION_QUERY_MAP
      REGION_AREA_MAP[key].slice(0, 20).forEach(function(pc) { if (areas.indexOf(pc) === -1) areas.push(pc); });
    } else if (areas.indexOf(a) === -1) {
      areas.push(a);
    }
  });
  if (areas.length === 0) areas = ['SW1', 'N1', 'B1', 'M1', 'NW1', 'CR0', 'WD1'];
  // Resolve selected application-type filters to PLOTA category slugs.
  // If none provided, use the main categories for variety.
  let catSlugs = [];
  const rawTypes = config.appTypes || config.filters || [];
  if (Array.isArray(rawTypes) && rawTypes.length > 0) {
    const seen = {};
    rawTypes.forEach(function(t) {
      const key = String(t).toLowerCase().trim();
      const slug = PLOTA_CATEGORY_MAP[key];
      if (slug && !seen[slug]) { seen[slug] = 1; catSlugs.push(slug); }
    });
  }
  if (catSlugs.length === 0) {
    catSlugs = ['extensions', 'change-of-use', 'new-homes', 'listed-buildings', 'commercial-and-major-works'];
  }
  // Query each category across the areas for EVEN distribution across filter types
  const perCat = Math.max(2, Math.ceil((config.maxItems || 20) / catSlugs.length));
  for (let c = 0; c < catSlugs.length; c++) {
    for (let a = 0; a < areas.length && results.length < (config.maxItems || 30); a++) {
      try {
        // "q:London" = free-text query; otherwise a postcode area query.
        let batch;
        if (String(areas[a]).indexOf('q:') === 0) {
          batch = await fetchPlotaPlanningFreeText(String(areas[a]).substring(2), perCat, catSlugs[c]);
        } else {
          batch = await fetchPlotaPlanning(areas[a], perCat, catSlugs[c]);
        }
        if (batch && batch.length > 0) {
          results.push.apply(results, batch.map(function(l){ l.selectedCategory = catSlugs[c]; return l; }));
          break; // got leads for this category in this area
        }
      } catch(e) { console.log('    Planning area/category error: ' + e.message); }
    }
  }
  console.log('    Planning PLOTA returned ' + results.length + ' applications across ' + catSlugs.length + ' categories');
  // ADDITIONAL SUPPLY: merge official planning.data.gov.uk APPLICATIONS (all
  // councils/counties) to boost per-county volume — not just a low-result fallback.
  try {
    const apps = await fetchPlanningApplications(config.maxItems || 100);
    if (apps && apps.length > 0) results = results.concat(apps);
  } catch(e) { console.log('    Planning applications source error: ' + e.message); }
  // Fallback — free official UK planning data (brownfield sites) if still thin
  if (results.length < 5) {
    console.log('    Planning PLOTA low/empty, using free planning.data.gov.uk...');
    try {
      const free = await fetchFreePlanningData(config.maxItems || 50);
      if (free && free.length > 0) results = results.concat(free);
    } catch(e) { console.log('    Planning free source error: ' + e.message); }
  }
  return results;
}

module.exports = { collectPlanningLeads, fetchPlanningApify, fetchFreePlanningData, fetchPlanningApplications, fetchPlotaPlanning };

if (require.main === module) {
  main().catch(e => console.error('Error:', e.message));
}
