// Multi-Business Lead Engine — Powers New Business Alert, Planning Permission Leads, Probate Leads
// Each business follows the same model: scrape → store → email clients

require('dotenv').config();

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'multi-lead-engine.json');

// === DATA STORE ===
function loadData() {
  try { return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')); }
  catch { return { businesses: {}, lastRun: {} }; }
}
function saveData(d) { fs.mkdirSync(DATA_DIR, { recursive: true }); fs.writeFileSync(CONFIG_FILE, JSON.stringify(d, null, 2)); }

// === COMPANIES HOUSE API (New Business Alert) ===
// Free API, no key needed for basic search. Register for key at: https://developer.company-information.service.gov.uk/
async function fetchNewCompanies(apiKey, sinceDate) {
  const date = sinceDate || new Date(Date.now() - 86400000).toISOString().split('T')[0];
  const effectiveKey = apiKey || process.env.COMPANIES_HOUSE_API_KEY || process.env.GOVUK_API_KEY || '';
  const url = `https://api.company-information.service.gov.uk/search/companies?q=limited&items_per_page=100&start_index=0`;
  try {
    const auth = Buffer.from(effectiveKey + ':').toString('base64');
    const res = await fetch(url, { headers: { 'Authorization': 'Basic ' + auth } });
    const data = await res.json();
    return (data.items || []).filter(i => i.date_of_creation === date || !sinceDate).map(i => ({
      name: i.title || '',
      companyNumber: i.company_number || '',
      type: i.company_type || 'ltd',
      status: i.company_status || 'active',
      address: i.address ? [i.address.address_line_1, i.address.locality, i.address.postal_code].filter(Boolean).join(', ') : '',
      date: i.date_of_creation || date,
      source: 'Companies House'
    }));
  } catch { return []; }
}

// === PLANNING PORTAL SCRAPER ===
async function fetchPlanningApps(postcode = 'SW1') {
  // Uses council planning portal search. Free and public.
  const url = `https://www.planningportal.co.uk/search?q=${postcode}&type=planning`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    // Simple extraction - in production would use Playwright for JS-rendered sites
    const matches = text.match(/[A-Z][a-z]+ [A-Z][a-z]+, [A-Z][a-z]+ [0-9]+[A-Z]{2}/g) || [];
    return matches.slice(0, 30).map((addr, i) => ({
      address: addr, type: 'Planning Application', status: 'Submitted',
      date: new Date().toISOString().split('T')[0], source: 'Planning Portal'
    }));
  } catch { return []; }
}

// === GOV.UK PROBATE REGISTER ===
async function fetchProbateRecords() {
  // Probate records are published on Gov.uk. Free and public.
  const url = 'https://www.gov.uk/search/research-and-statistics?keywords=probate&order=updated-newest';
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const text = await res.text();
    const matches = text.match(/[A-Z][a-z]+ [A-Z][a-z]+ [0-9]{4}/g) || [];
    return matches.slice(0, 20).map((name, i) => ({
      name, type: 'Probate Grant', status: 'Granted',
      date: new Date().toISOString().split('T')[0], source: 'Gov.uk Probate'
    }));
  } catch { return []; }
}

// === BUSINESS SPECIFIC RUNNERS ===

async function runNewBusinessAlert(config) {
  console.log('\n--- New Business Alert ---');
  const data = loadData();
  if (!data.businesses.newBusinessAlert) data.businesses.newBusinessAlert = { clients: [], leads: [] };
  const biz = data.businesses.newBusinessAlert;
  
  const companies = await fetchNewCompanies(config.companiesHouseKey || '', biz.lastRun);
  if (companies.length === 0) { console.log('  No new companies found'); return; }
  
  biz.leads = (biz.leads || []).concat(companies.map(c => ({ ...c, _added: new Date().toISOString() })));
  biz.lastRun = new Date().toISOString();
  console.log(`  ${companies.length} new companies scraped`);
  
  // Email clients
  for (const client of (biz.clients || []).filter(c => c.active)) {
    if (!client.email) continue;
    const batch = companies.slice(0, client.leadsPerDay || 20);
    const text = batch.map(c => `${c.name} (${c.companyNumber}) — ${c.address}`).join('\n');
    try {
      await sendEmail(config, client.email,
        `NewBusinessAlert — ${batch.length} new companies today`,
        `Hi ${client.name},\n\nNew companies registered today:\n\n${text}\n\nNewBusinessAlert`);
      console.log(`  Emailed ${batch.length} leads to ${client.email}`);
    } catch(e) { console.log(`  Email error: ${e.message}`); }
  }
  saveData(data);
}

async function runPlanningLeads(config) {
  console.log('\n--- Planning Permission Leads ---');
  const data = loadData();
  if (!data.businesses.planningLeads) data.businesses.planningLeads = { clients: [], leads: [] };
  const biz = data.businesses.planningLeads;
  
  const apps = await fetchPlanningApps();
  if (apps.length === 0) { console.log('  No new planning apps found'); return; }
  
  biz.leads = (biz.leads || []).concat(apps.map(a => ({ ...a, _added: new Date().toISOString() })));
  biz.lastRun = new Date().toISOString();
  console.log(`  ${apps.length} new planning apps found`);
  
  for (const client of (biz.clients || []).filter(c => c.active)) {
    if (!client.email) continue;
    const batch = apps.slice(0, client.leadsPerDay || 15);
    const text = batch.map(a => `${a.address} — ${a.type}`).join('\n');
    try {
      await sendEmail(config, client.email,
        `PlanningLeads — ${batch.length} new planning applications`,
        `Hi ${client.name},\n\nNew planning applications today:\n\n${text}\n\nPlanningPermissionLeads`);
      console.log(`  Emailed ${batch.length} leads to ${client.email}`);
    } catch(e) { console.log(`  Email error: ${e.message}`); }
  }
  saveData(data);
}

async function runProbateLeads(config) {
  console.log('\n--- Probate Leads ---');
  const data = loadData();
  if (!data.businesses.probateLeads) data.businesses.probateLeads = { clients: [], leads: [] };
  const biz = data.businesses.probateLeads;
  
  const records = await fetchProbateRecords();
  if (records.length === 0) { console.log('  No new probate records found'); return; }
  
  biz.leads = (biz.leads || []).concat(records.map(r => ({ ...r, _added: new Date().toISOString() })));
  biz.lastRun = new Date().toISOString();
  console.log(`  ${records.length} new probate records found`);
  
  for (const client of (biz.clients || []).filter(c => c.active)) {
    if (!client.email) continue;
    const batch = records.slice(0, client.leadsPerDay || 10);
    const text = batch.map(r => `${r.name} — ${r.type} (${r.date})`).join('\n');
    try {
      await sendEmail(config, client.email,
        `ProbateLeads — ${batch.length} new probate grants`,
        `Hi ${client.name},\n\nNew probate records today:\n\n${text}\n\nProbateLeads`);
      console.log(`  Emailed ${batch.length} leads to ${client.email}`);
    } catch(e) { console.log(`  Email error: ${e.message}`); }
  }
  saveData(data);
}

// === EMAIL HELPER ===
async function sendEmail(config, to, subject, text) {
  if (!config.gmailUser || !config.gmailPass) { console.log('  Gmail not configured'); return; }
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: config.gmailUser, pass: config.gmailPass } });
  await transporter.sendMail({
    from: `"${config.senderName || 'Multi-Lead Engine'}" <${config.gmailUser}>`,
    to, subject, text
  });
}

// === MAIN ===
async function main() {
  const args = process.argv.slice(2);
  const config = loadData().config || {};
  
  if (args[0] === '--all') {
    console.log('=== Multi-Business Lead Engine ===');
    console.log(new Date().toLocaleString());
    await runNewBusinessAlert(config);
    await runPlanningLeads(config);
    await runProbateLeads(config);
    console.log('\n=== All complete ===');
  } else if (args[0] === '--business') {
    const name = args[1];
    if (name === 'newbusiness') await runNewBusinessAlert(config);
    else if (name === 'planning') await runPlanningLeads(config);
    else if (name === 'probate') await runProbateLeads(config);
    else console.log('Unknown business. Use: newbusiness, planning, probate');
  } else if (args[0] === '--status') {
    const data = loadData();
    for (const [key, biz] of Object.entries(data.businesses || {})) {
      console.log(`\n${key}: ${(biz.leads || []).length} total leads, ${(biz.clients || []).length} clients (${(biz.clients || []).filter(c => c.active).length} active)`);
    }
  } else {
    console.log('Usage:');
    console.log('  node multi_lead_engine.js --all              Run all businesses');
    console.log('  node multi_lead_engine.js --business <name>  Run specific business');
    console.log('  node multi_lead_engine.js --status           View all stats');
  }
}

main().catch(e => console.error('Error:', e.message));
