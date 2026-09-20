// finalize_v25.js - brings Brevo in line with the "2 emails per lead type" decision:
//   * DELETES the "Demo 3 - Free week" drafts
//   * UPDATES the "Demo 1 - Real lead" drafts with the latest HTML
// Waits out Brevo's rate limit automatically. Run: node finalize_v25.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { SUBTYPES } = require('./buyer_taxonomy.js');

const ENV = fs.readFileSync('C:/Users/ketzm/.env', 'utf8');
const KEY = (ENV.split(/\r?\n/).find(l => l.startsWith('BREVO_API_KEY=')) || '').replace('BREVO_API_KEY=', '').trim();
const OUT = 'C:/Users/ketzm/Desktop/9amleads-buyer-emails-v25-demo';

const PLURAL = {
  'moving-removal': 'Removal Companies', 'moving-manvan': 'Man & Van Operators', 'moving-storage': 'Storage Companies',
  'moving-clearance': 'House Clearance Firms', 'moving-packers': 'Packing & Relocation Services', 'moving-skipwaste': 'Skip & Waste Companies',
  'probate-solicitor': 'Solicitors', 'probate-estateagent': 'Estate Agents', 'probate-funeraldirector': 'Funeral Directors',
  'probate-financial': 'Financial Advisers', 'probate-willwriter': 'Will Writers',
  'nb-accountant': 'Accountants & Bookkeepers', 'nb-webdesign': 'Web Designers & Developers', 'nb-marketing': 'Marketing & SEO Agencies',
  'nb-it': 'IT & Support Providers', 'nb-insurance': 'Insurance Brokers', 'nb-recruitment': 'Recruitment Agencies',
  'nb-businesssupport': 'Business Support & Consultancy Firms',
  'plan-builder': 'Builders & Contractors', 'plan-roofing': 'Roofers', 'plan-architect': 'Architects', 'plan-landscaper': 'Landscapers & Gardeners',
  'tend-construction': 'Construction Contractors', 'tend-cleaning': 'Cleaning Companies', 'tend-security': 'Security Companies',
  'tend-it': 'IT & Technology Providers', 'tend-facilities': 'Facilities Management Companies', 'tend-logistics': 'Transport & Logistics Companies',
  'tend-healthcare': 'Healthcare & Social Care Providers'
};
const pluralToSub = {};
for (const k of Object.keys(PLURAL)) pluralToSub[PLURAL[k].toLowerCase()] = k;
function leadNoun(st) {
  return { moving: 'moving lead', probate: 'probate grant', newbusiness: 'new company registration', planning: 'planning application', tenders: 'public tender' }[st.product] || 'lead';
}

function req(method, urlPath, body) {
  return new Promise(r => {
    const d = body ? JSON.stringify(body) : '';
    const o = { hostname: 'api.brevo.com', path: urlPath, method, headers: { 'api-key': KEY, accept: 'application/json' }, timeout: 45000 };
    if (d) { o.headers['content-type'] = 'application/json'; o.headers['content-length'] = Buffer.byteLength(d); }
    const q = https.request(o, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => r({ s: res.statusCode, b })); });
    q.on('error', e => r({ s: 0, b: String(e) }));
    if (d) q.write(d); q.end();
  });
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function withRetry(fn, label, log) {
  for (let a = 0; a < 80; a++) {
    const r = await fn();
    if (r.s >= 200 && r.s < 300) return r;
    if (r.s === 429 || r.s === 0) { log('  [rate-limit] ' + label + ' waiting 60s...'); await sleep(60000); continue; }
    return r;
  }
  return { s: 0, b: 'gave up' };
}

(async () => {
  const log = (m) => { console.log(new Date().toISOString().slice(11, 19) + ' ' + m); };
  if (!KEY) { log('No BREVO_API_KEY'); return; }
  let all = [];
  for (const off of [0, 100, 200]) {
    const r = await withRetry(() => req('GET', '/v3/emailCampaigns?limit=100&offset=' + off), 'list ' + off, log);
    try { all = all.concat((JSON.parse(r.b).campaigns || [])); } catch (e) { log('list ' + off + ' failed: ' + r.s); }
  }
  log('campaigns loaded: ' + all.length);

  const deletes = all.filter(c => / Buyers - Demo 3 - /.test(c.name));
  const updates = all.filter(c => / Buyers - Demo 1 - /.test(c.name));
  log('to delete (Demo 3): ' + deletes.length + ' | to update (Demo 1): ' + updates.length);

  for (const c of deletes) {
    const r = await withRetry(() => req('DELETE', '/v3/emailCampaigns/' + c.id), c.name, log);
    log((r.s >= 200 && r.s < 300 ? 'DELETED ' : 'DELETE FAILED ' + r.s + ' ') + c.name);
    await sleep(800);
  }
  for (const c of updates) {
    const m = c.name.match(/^(.*?) Buyers - Demo 1 - /);
    const subtype = m && pluralToSub[m[1].toLowerCase()];
    const st = subtype && SUBTYPES[subtype];
    if (!st) { log('NO SUBTYPE for ' + c.name); continue; }
    const file = path.join(OUT, st.product, subtype + '-1.html');
    if (!fs.existsSync(file)) { log('NO HTML for ' + c.name); continue; }
    const subject = 'See a real ' + leadNoun(st) + ' in the live dashboard';
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + subject.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>');
    const r = await withRetry(() => req('PUT', '/v3/emailCampaigns/' + c.id, { subject, htmlContent: html }), c.name, log);
    log((r.s >= 200 && r.s < 300 ? 'UPDATED ' : 'UPDATE FAILED ' + r.s + ' ') + c.name);
    await sleep(800);
  }
  log('DONE');
})();
