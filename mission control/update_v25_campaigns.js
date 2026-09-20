// update_v25_campaigns.js - pushes the latest v25 email HTML into the existing
// Brevo DRAFT campaigns (matched by name), so we don't recreate them.
// Usage: node update_v25_campaigns.js
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
const STEPS = [
  { n: '1', tag: 'Real lead', subject: st => 'See a real ' + leadNoun(st) + ' in the live dashboard' },
  { n: '2', tag: 'Dashboard tour', subject: st => 'Your leads dashboard in 60 seconds' }
];

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

(async () => {
  if (!KEY) { console.log('No BREVO_API_KEY'); return; }
  let all = [];
  for (const off of [0, 100, 200]) {
    let r = { s: 0, b: '' };
    for (let a = 0; a < 40; a++) {
      r = await req('GET', '/v3/emailCampaigns?limit=100&offset=' + off);
      if (r.s === 200) break;
      await sleep(60000);
    }
    try { all = all.concat((JSON.parse(r.b).campaigns || [])); }
    catch (e) { console.log('list fetch offset ' + off + ' failed: ' + r.s + ' ' + String(r.b).slice(0, 80)); }
  }
  const results = [];
  const onlyStep = process.argv[2] || '';
  for (const c of all) {
    const m = c.name.match(/^(.*?) Buyers - Demo (\d) - /);
    if (!m) continue;
    if (onlyStep && m[2] !== onlyStep) continue;
    const subtype = pluralToSub[m[1].toLowerCase()];
    if (!subtype || !SUBTYPES[subtype]) { results.push(c.name + ' -> NO SUBTYPE'); continue; }
    const st = SUBTYPES[subtype];
    const step = STEPS.find(s => s.n === m[2]);
    const file = path.join(OUT, st.product, subtype + '-' + m[2] + '.html');
    if (!fs.existsSync(file)) { results.push(c.name + ' -> NO HTML'); continue; }
    const subject = step.subject(st);
    let html = fs.readFileSync(file, 'utf8');
    html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + subject.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>');
    let done = false, lastErr = '';
    for (let a = 0; a < 60 && !done; a++) {
      const r = await req('PUT', '/v3/emailCampaigns/' + c.id, { subject, htmlContent: html });
      if (r.s === 200 || r.s === 204) { done = true; results.push(c.name + ' -> updated'); }
      else if (r.s === 429 || r.s === 0) { await sleep(60000); }
      else { lastErr = r.s + ' ' + String(r.b).slice(0, 160); break; }
    }
    if (!done) results.push(c.name + ' -> FAILED ' + lastErr);
    await sleep(1200);
  }
  console.log(results.join('\n'));
  console.log('\nUpdated: ' + results.filter(x => /updated$/.test(x)).length + ' | failed/other: ' + results.filter(x => !/updated$/.test(x)).length);
})();
