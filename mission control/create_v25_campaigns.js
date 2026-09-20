// create_v25_campaigns.js - creates 3 Brevo DRAFT campaigns per buyer list for the
// new demo-first sequence (real lead -> dashboard tour -> free week). Uses the
// current Brevo API key from the project .env. Drafts only; you schedule/send.
// Usage: node create_v25_campaigns.js
const https = require('https');
const fs = require('fs');
const path = require('path');
const { P, SUBTYPES } = require('./buyer_taxonomy.js');

const ENV = fs.readFileSync('C:/Users/ketzm/.env', 'utf8');
const KEY = (ENV.split(/\r?\n/).find(l => l.startsWith('BREVO_API_KEY=')) || '').replace('BREVO_API_KEY=', '').trim();
const OUT = 'C:/Users/ketzm/Desktop/9amleads-buyer-emails-v25-demo';
const B2 = JSON.parse(fs.readFileSync('C:/Users/ketzm/AppData/Local/Temp/opencode/batch2.json', 'utf8'));

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
  { n: '1', tag: 'Real lead', subject: st => 'A real ' + leadNoun(st) + ' - see where it came from' },
  { n: '2', tag: 'Dashboard tour', subject: st => 'Your leads dashboard in 60 seconds' },
  { n: '3', tag: 'Free week', subject: st => 'Your free week is still waiting' }
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
  if (!KEY) { console.log('No BREVO_API_KEY in .env'); return; }
  const ex = await req('GET', '/v3/emailCampaigns?limit=200&offset=0');
  const existing = (JSON.parse(ex.b).campaigns || []).map(c => c.name);

  const results = [];
  for (const c of B2) {
    const plural = c.name.replace(/\s*Buyers\s*-\s*Batch 2.*/i, '').trim();
    const subtype = pluralToSub[plural.toLowerCase()];
    if (!subtype) { results.push(plural + ' -> NO SUBTYPE'); continue; }
    const st = SUBTYPES[subtype];
    if (!st) { results.push(plural + ' -> NO TAXONOMY'); continue; }

    for (const step of STEPS) {
      const campName = plural + ' Buyers - Demo ' + step.n + ' - ' + step.tag;
      if (existing.indexOf(campName) > -1) { results.push(campName + ' -> EXISTS (skipped)'); continue; }
      const file = path.join(OUT, st.product, subtype + '-' + step.n + '.html');
      if (!fs.existsSync(file)) { results.push(subtype + '-' + step.n + ' -> NO HTML'); continue; }
      const subject = step.subject(st);
      let html = fs.readFileSync(file, 'utf8');
      html = html.replace(/<title>[\s\S]*?<\/title>/i, '<title>' + subject.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</title>');
      const body = {
        sender: { name: 'Ketz Mandalia', email: 'hello@9amleads.com' },
        replyTo: 'hello@9amleads.com',
        name: campName, subject, htmlContent: html,
        recipients: { listIds: c.listIds }, type: 'classic'
      };
      let created = false, lastErr = '';
      for (let a = 0; a < 6 && !created; a++) {
        const r = await req('POST', '/v3/emailCampaigns', body);
        if (r.s === 201 || r.s === 200) { created = true; results.push(campName + ' -> created id ' + JSON.parse(r.b).id + ' (list ' + JSON.stringify(c.listIds) + ')'); }
        else if (r.s === 429 || r.s === 0) { await sleep(20000); }
        else { lastErr = r.s + ' ' + String(r.b).slice(0, 160); break; }
      }
      if (!created && lastErr) results.push(campName + ' -> FAILED ' + lastErr);
      else if (!created) results.push(campName + ' -> rate-limited (retry later)');
      await sleep(1500);
    }
  }
  console.log(results.join('\n'));
  console.log('\nTotal processed: ' + results.length);
})();
