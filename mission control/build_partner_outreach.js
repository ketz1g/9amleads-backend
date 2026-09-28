// build_partner_outreach.js
// Stages the 9amLeads moving-partner outreach in Brevo - DRAFT ONLY (never sends).
// Creates: a prospect list, two templates (outreach email + full proposal email)
// and one draft campaign. Safe to re-run (idempotent by name); updates existing
// templates and the existing draft campaign in place.
//
//   node build_partner_outreach.js
//
const fs = require('fs');
const https = require('https');

const ENV = fs.readFileSync('C:/Users/ketzm/.env', 'utf8');
const KEY = (ENV.split(/\r?\n/).find(l => l.startsWith('BREVO_API_KEY=')) || '').split('=').slice(1).join('=').trim();
if (!KEY) { console.log('No BREVO_API_KEY in .env'); process.exit(1); }

const SENDER = { name: 'Ketz Mandalia', email: 'hello@9amleads.com' };
const REPLYTO = { email: 'hello@9amleads.com', name: 'Ketz Mandalia' };
const LIST_NAME = 'Moving Partners & Associations (Prospect)';
const PROPOSAL_URL = 'https://9amleads.com/partners/';
const DEMO_URL = 'https://nineamleads-backend.onrender.com/portal/demo.html?product=moving';
const PARTNER_DEMO_URL = 'https://9amleads.com/portal/partner-demo.html';
const ACCENT = '#0b6bb3', INK = '#1f2937', MUTED = '#6b7280', LINE = '#e5e7eb', PAGE = '#f4f5f7', GREEN = '#16a34a';
const TPL_OUTREACH = 'Partner Outreach - Moving Associations & Networks';
const TPL_PROPOSAL = 'Partner Proposal - 9amLeads Distribution Partnership';
const CAMPAIGN = 'Partner Outreach - Moving Associations & Networks (DRAFT)';
const SUBJECT_OUT = 'A recurring revenue stream for {{contact.COMPANY}} - and 14 days free for your members';

function req(method, path, body) {
  return new Promise(function (resolve) {
    var d = body ? JSON.stringify(body) : '';
    var o = { hostname: 'api.brevo.com', path: path, method: method, headers: { 'api-key': KEY, accept: 'application/json', 'content-type': 'application/json' }, timeout: 45000 };
    if (d) o.headers['content-length'] = Buffer.byteLength(d);
    var r = https.request(o, function (res) { var b = ''; res.on('data', function (c) { b += c; }); res.on('end', function () { resolve({ s: res.statusCode, b: b }); }); });
    r.on('error', function (e) { resolve({ s: 0, b: String(e) }); });
    if (d) r.write(d); r.end();
  });
}
function j(s) { try { return JSON.parse(s); } catch (e) { return null; } }

// ---------- shared email partials ----------
function shell(subject, preheader, inner) {
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + subject + '</title></head>'
    + '<body style="margin:0;padding:0;background-color:' + PAGE + ';">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + preheader + '</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + PAGE + '" style="background-color:' + PAGE + '"><tr><td align="center" style="padding:24px 12px">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background:#ffffff;border:1px solid ' + LINE + ';border-radius:8px">'
    + '<tr><td style="height:4px;background:' + ACCENT + ';font-size:0;line-height:0">&nbsp;</td></tr>'
    + '<tr><td style="padding:26px 34px 0"><p style="margin:0;font-size:18px;font-weight:800;color:' + INK + '"><a href="https://www.9amleads.com" style="color:' + INK + ';text-decoration:none">9am<span style="color:' + ACCENT + '">Leads</span></a></p>'
    + '<p style="margin:6px 0 0;font-size:12px;color:' + MUTED + '">Partner Programme</p></td></tr>'
    + inner
    + signature() + footer()
    + '</table></td></tr></table></body></html>';
}
function signature() {
  return '<tr><td style="padding:18px 34px 8px">'
    + '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    + '<td width="76" valign="middle" style="padding-right:12px"><img src="https://9amleads.com/assets/ketan-photo.jpeg" width="64" height="64" alt="Ketz Mandalia" style="display:block;width:64px;height:64px;border-radius:50%;border:0"></td>'
    + '<td valign="middle" style="color:' + INK + ';font-size:14px;line-height:1.5">All the best,<br><strong>Ketz Mandalia</strong><br><span style="color:' + MUTED + ';font-size:13px">Founder, 9amLeads<br>hello@9amleads.com</span></td>'
    + '</tr></table></td></tr>';
}
function footer() {
  return '<tr><td style="padding:8px 34px 26px;border-top:1px solid ' + LINE + '">'
    + '<p style="margin:12px 0 10px;font-size:12px;line-height:1.8">'
    + '<a href="https://9amleads.com/movingleadsdaily/" style="color:' + ACCENT + ';text-decoration:none;font-weight:700">Moving leads</a> &nbsp;|&nbsp; '
    + '<a href="https://9amleads.com" style="color:' + ACCENT + ';text-decoration:none;font-weight:700">9amLeads</a> &nbsp;|&nbsp; '
    + '<a href="https://9amleads.com/founder/" style="color:' + ACCENT + ';text-decoration:none;font-weight:700">Meet the founder</a> &nbsp;|&nbsp; '
    + '<a href="https://9amleads.com/portal/partner.html" style="color:' + ACCENT + ';text-decoration:none;font-weight:700">Partner dashboard</a> &nbsp;|&nbsp; '
    + '<a href="' + PARTNER_DEMO_URL + '" style="color:' + ACCENT + ';text-decoration:none;font-weight:700">Partner dashboard demo</a></p>'
    + '<p style="margin:0 0 10px;color:#9ca3af;font-size:11px;line-height:1.7">You received this because we believe a 9amLeads partnership could benefit your members. 9am Leads Ltd, Company No. 17402522, 66 Paul Street, London EC2A 4NA.</p>'
    + '<a href="{{ unsubscribe }}" style="color:' + MUTED + ';font-size:12px;text-decoration:underline">Unsubscribe</a>'
    + '</td></tr>';
}
function cta(url, text) {
  return '<tr><td align="center" style="padding:14px 34px 6px"><a href="' + url + '" style="display:inline-block;background:' + ACCENT + ';color:#ffffff;text-decoration:none;padding:15px 34px;border-radius:6px;font-size:16px;font-weight:700">' + text + '</a></td></tr>';
}
function demoButton(url) {
  return '<tr><td align="center" style="padding:6px 34px 4px"><a href="' + url + '" style="display:inline-block;border:2px solid ' + ACCENT + ';color:' + ACCENT + ';text-decoration:none;padding:12px 28px;border-radius:6px;font-size:15px;font-weight:700">Open the live dashboard demo</a>'
    + '<p style="margin:8px 0 0;color:' + MUTED + ';font-size:12px">No signup &middot; a real lead, its source and the Print &amp; Post tracking</p></td></tr>';
}
function heading(t) {
  return '<p style="margin:16px 0 8px;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:' + ACCENT + '">' + t + '</p>';
}
function bullets(items) {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 6px">' + items.map(function (t) {
    return '<tr><td style="padding:0 0 8px;color:' + INK + ';font-size:14.5px;line-height:1.55"><span style="color:' + GREEN + ';font-weight:800">&#10003;</span>&nbsp; ' + t + '</td></tr>';
  }).join('') + '</table>';
}
// Comparison vs the typical lead / address-list company. Honest, feature-based.
function compareTable() {
  function row(us, them) {
    return '<tr>'
      + '<td style="padding:10px 12px;border-bottom:1px solid ' + LINE + ';font-size:13.5px;color:' + INK + ';font-weight:700;width:42%;vertical-align:top">' + us + '</td>'
      + '<td style="padding:10px 12px;border-bottom:1px solid ' + LINE + ';font-size:13px;color:' + MUTED + ';vertical-align:top">' + them + '</td></tr>';
  }
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden;margin:6px 0 4px">'
    + '<tr><td style="padding:11px 12px;background:' + ACCENT + ';color:#fff;font-size:12px;font-weight:800;letter-spacing:.5px">9amLEADS</td><td style="padding:11px 12px;background:#eef2f6;color:' + MUTED + ';font-size:12px;font-weight:800;letter-spacing:.5px">TYPICAL LEAD / ADDRESS-LIST COMPANY</td></tr>'
    + row('Every lead shows its source, so it can be checked in seconds', 'Source often undisclosed, or a bought list recycled for years')
    + row('Sourced daily and delivered at 9am', 'Lists can be weeks or months old before you see them')
    + row('One company per lead - never resold', 'The same lead sold to four or five firms at once')
    + row('Live, exclusive leads - one firm per lead', 'Postcode address lists you can buy by the thousand that anyone can buy')
    + row('Full contact details ready to action', 'A bare address or a shared enquiry - you research the rest')
    + row('You only pay for the leads we deliver', 'You pay per address whether or not they ever move')
    + row('From around £1 per lead (Starter) - exclusive and delivered at 9am', 'A shared lead from a portal can cost far more - and several firms all get it')
    + row('Exactly the number promised, every day', 'Unpredictable volume, padded with filler to hit a quota')
    + row('Wrong lead? We replace it', 'No replacement, no accountability')
    + row('Print &amp; Post in one click, with live tracking and proof of posting', 'Just an email, a CSV or a name and address')
    + row('Auto Print &amp; Post, and bulk campaigns for quiet times', 'No mail, or a print agency you have to manage yourself')
    + row('CRM integration - every lead pushed into your CRM automatically', 'Copy and paste from an email, by hand')
    + row('Full contact details, in your email and dashboard', 'A bare name and address you have to research yourself')
    + '</table>';
}
// The full feature set, expressed as a benefit for the member.
function everythingYouGet() {
  return bullets([
    '<strong>Fresh moving leads every weekday at 9am</strong>, in the member\'s email and dashboard together',
    '<strong>Proof of source on every lead</strong> - the exact register or listing it came from, so they can verify it themselves',
    '<strong>Exclusive leads</strong> - issued to one company only, never sold to their rivals',
    '<strong>Exactly the number promised</strong>, no more and no less; reject anything wrong and we replace it',
    '<strong>Print &amp; Post</strong> - upload a leaflet or letter once, then print, address and post it in one click (A5, A5 in envelope, or A4)',
    '<strong>Postage tracking</strong> - every mailpiece tracked through printing, posting and delivery, with proof of posting in the dashboard',
    '<strong>Auto Print &amp; Post</strong> - we automatically print and post each new lead the morning it arrives, completely hands free',
    '<strong>Bulk Postage for quiet times</strong> - buy packs of up to 1,000 never-sent archive leads and we print and post your campaign to every one',
    '<strong>Bulk follow-ups</strong> - select a week or month of leads and re-mail them all in one go, or hit "Post Again" on any lead',
    '<strong>CRM integration</strong> - send every lead straight into their CRM automatically at 9am (HubSpot, Salesforce, Pipedrive and more, via Zapier, Make or a webhook)',
    '<strong>Full contact details</strong> ready to action, and a one-click route from lead to posted letter',
    '<strong>No contract, cancel anytime</strong>, and a 14-day free trial through your link'
  ]);
}

// ---------- mock "screenshot" panels (email-safe HTML, no external images) ----------
function pill(text, green) {
  return '<span style="display:inline-block;background:' + (green ? '#dcfce7' : '#f1f5f9') + ';color:' + (green ? '#166534' : '#475569') + ';font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;margin:0 4px 4px 0">' + text + '</span>';
}
function sourceMock() {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden;margin:8px 0 4px">'
    + '<tr bgcolor="#f8fafc">'
    + '<td style="padding:8px 12px;border-bottom:1px solid ' + LINE + ';font-size:11px;font-weight:700;color:' + MUTED + '"><span style="color:' + GREEN + ';font-size:13px">&#9679;</span>&nbsp; Verified source</td>'
    + '<td align="right" style="padding:8px 12px;border-bottom:1px solid ' + LINE + ';font-size:11px;font-weight:700;color:' + ACCENT + '">View source &#8599;</td>'
    + '</tr>'
    + '<tr><td colspan="2" style="padding:14px 14px 6px">'
    + '<p style="margin:0;font-size:15px;font-weight:800;color:' + INK + '">14 Alder Road, Bristol, BS7 8QT</p>'
    + '<p style="margin:3px 0 0;font-size:13px;color:' + MUTED + '">Newly listed &middot; moving opportunity &middot; added today</p>'
    + '<p style="margin:9px 0 0;font-size:12px;color:' + ACCENT + '">Source shown on every lead, so it can be checked in seconds</p>'
    + '</td></tr></table>'
    + '<p style="margin:2px 0 0;font-size:11px;color:#9ca3af;text-align:center">Illustration of a real 9amLeads lead card</p>';
}
function printMock() {
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden;margin:8px 0 4px">'
    + '<tr bgcolor="#f8fafc"><td colspan="2" style="padding:8px 12px;border-bottom:1px solid ' + LINE + ';font-size:11px;font-weight:700;color:' + MUTED + '">&#9993;&nbsp; Print &amp; Post - live tracking</td></tr>'
    + '<tr><td colspan="2" style="padding:12px 14px 4px">'
    + '<p style="margin:0 0 8px;font-size:13px;font-weight:700;color:' + INK + '">Your letter or flyer, printed, addressed and posted</p>'
    + '<p style="margin:0">' + pill('Printed &#10003;') + pill('Addressed &#10003;') + pill('Posted &#10003;') + pill('Proof of posting &#10003;', true) + '</p>'
    + '<p style="margin:6px 0 0;font-size:12px;color:' + MUTED + '">Live tracking and proof of posting on every mailpiece</p>'
    + '</td></tr></table>';
}

// ---------- outreach email ----------
function outreachHtml() {
  var inner = '<tr><td style="padding:6px 34px 0">'
    + '<h1 style="margin:6px 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">A recurring revenue stream for {{contact.COMPANY}}</h1>'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:15px;line-height:1.65">Hi {{contact.COMPANY}} team,<br><br>I\'m Ketz, founder of 9amLeads. We deliver fresh UK moving leads to removal companies every weekday morning at 9am - newly listed homes, sourced daily and sent to their dashboard and inbox, with the source shown on every lead. It is not a bought list, and no lead is ever sold twice.</p>'
    + '<p style="margin:0 0 6px;color:' + INK + ';font-size:15px;line-height:1.65">I\'m writing because your members are exactly who we help, and there is a straightforward win for both of us.</p>'
    + heading('A partnership that pays you every month')
    + bullets([
      'Your members get a <strong>14-day free trial</strong> through your dedicated link (double our standard 7 days)',
      'You earn <strong>&pound;25 per month</strong> for every member who becomes a paying customer, recurring for as long as they stay',
      'That is <strong>&pound;2,500 per month for every 100 active members</strong>, paid monthly',
      'We handle everything: onboarding, support, billing and the daily delivery'
    ])
    + heading('Everything your members get')
    + everythingYouGet()
    + heading('Why we are different from other lead and address-list companies')
    + '<p style="margin:0 0 6px;color:' + INK + ';font-size:14.5px;line-height:1.6">Most "moving leads" in the UK are postcode address lists you buy by the thousand that the firm down the road can buy too - or shared enquiries sent to several companies at once. We are the opposite: freshly sourced, exclusive leads from around £1 each, delivered by 9am, with the source shown and Print &amp; Post built in.</p>'
    + compareTable()
    + printMock()
    + heading('Why this works for you and your members')
    + bullets([
      '<strong>For you:</strong> a genuinely useful member benefit that helps recruit and retain members, plus recurring income with no cost and nothing to manage',
      '<strong>For your members:</strong> first to every opportunity, at a fraction of the cost of ads or cold calling, with a free trial and no contract',
      '<strong>For your reputation:</strong> a service you can stand behind - verifiable sources, exclusive leads and a posted letter the same morning',
      '<strong>For the long term:</strong> a co-branded page, tracked link and live dashboard, and for the right partner a larger, strategic share of the business'
    ])
    + '<p style="margin:12px 0 2px;color:' + INK + ';font-size:15px;line-height:1.65">I have put the full partner proposal, including the commission table and how the co-branded page works, here. Happy to jump on a short call whenever suits.</p>'
    + '</td></tr>'
    + '<tr><td style="padding:2px 34px 0"><p style="margin:10px 0 0;font-size:13px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:' + ACCENT + '">See it for yourself</p>'
    + '<p style="margin:6px 0 0;color:' + INK + ';font-size:14.5px;line-height:1.6">No signup needed. Open a live demo of the dashboard and see exactly how a fresh lead, its source and the Print &amp; Post tracking look.</p></td></tr>'
    + demoButton(DEMO_URL)
    + '<tr><td align="center" style="padding:0 34px 6px"><p style="margin:2px 0 0;font-size:12px;color:' + MUTED + '">Or preview the <a href="' + PARTNER_DEMO_URL + '" style="color:' + ACCENT + ';font-weight:700;text-decoration:none">partner dashboard</a>.</p></td></tr>'
    + cta(PROPOSAL_URL, 'View the partner proposal');
  return shell(SUBJECT_OUT, 'A simple distribution partnership for UK movers - recurring commission, no cost to you.', inner);
}

// ---------- proposal email ----------
function proposalHtml() {
  function row(n, v, hi) { return '<tr' + (hi ? ' style="background:#f0fdf4"' : '') + '><td style="padding:12px 16px;border-bottom:1px solid ' + LINE + ';font-size:14.5px;color:' + INK + '">' + n + '</td><td style="padding:12px 16px;border-bottom:1px solid ' + LINE + ';font-size:15px;font-weight:800;color:' + (hi ? '#166534' : ACCENT) + '">' + v + '</td></tr>'; }
  var table = '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + LINE + ';border-radius:10px;overflow:hidden;margin:8px 0 4px">'
    + '<tr><td colspan="2" style="padding:11px 16px;background:' + ACCENT + ';color:#fff;font-size:12px;font-weight:800;letter-spacing:.6px">RECURRING COMMISSION - PAID MONTHLY</td></tr>'
    + row('25 active members', '&pound;625 / month')
    + row('50 active members', '&pound;1,250 / month')
    + row('100 active members', '&pound;2,500 / month', true)
    + row('250 active members', '&pound;6,250 / month')
    + row('500 active members', '&pound;12,500 / month', true)
    + '</table>';
  var inner = '<tr><td style="padding:6px 34px 0">'
    + '<h1 style="margin:6px 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">The 9amLeads Partner Programme</h1>'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:15px;line-height:1.65">Hi {{contact.COMPANY}} team,<br><br>Thank you for considering a partnership with 9amLeads. Below is the full proposal: what your members receive, why we are different, what you earn, and why it works for both of us.</p>'
    + heading('What your members receive')
    + everythingYouGet()
    + heading('Why 9amLeads beats other lead and address-list companies')
    + '<p style="margin:0 0 6px;color:' + INK + ';font-size:14.5px;line-height:1.6">Most "moving leads" in the UK are postcode address lists bought by the thousand that anyone can buy - or shared enquiries sent to several firms at once. We are the opposite: freshly sourced, exclusive leads from around £1 each, with proof of source and Print &amp; Post built in.</p>'
    + compareTable()
    + printMock()
    + heading('What you earn')
    + '<p style="margin:0 0 4px;color:' + INK + ';font-size:15px;line-height:1.65">You earn <strong>&pound;25 per active paying member, per month</strong>, recurring for as long as they remain subscribed. It compounds as you introduce more members:</p>'
    + table
    + '<p style="margin:8px 0 0;color:' + MUTED + ';font-size:12px;line-height:1.6">Illustrative only. Commission is performance-based and continues only while the referred customer is an active, paying subscriber. No commission on trials, cancellations or refunds.</p>'
    + heading('Why partnering with us is good for your organisation')
    + bullets([
      'A valuable member benefit that helps attract and retain members',
      'Recurring income with no cost, no risk and nothing to manage',
      'A co-branded landing page, tracked link and live partner dashboard',
      'Ready-made member communications and priority support',
      'For the right partner, a larger, longer-term strategic share of the business'
    ])
    + heading('Why your members will thank you')
    + bullets([
      'First to every moving opportunity, with the source shown so they can trust it',
      'Exclusive leads - never shared with their competitors',
      'Cheaper than ads and cold calling, with an easy free trial and no contract',
      'Print &amp; Post turns a lead into a posted letter the same morning, with proof of posting'
    ])
    + heading('How it works')
    + bullets([
      'We set up a dedicated, co-branded page and tracked link for {{contact.COMPANY}}',
      'Your members sign up and get a 14-day free trial (double our standard 7 days)',
      'When a member becomes a paying customer, you earn &pound;25 per month, for as long as they stay'
    ])
    + heading('See it for yourself')
    + '<p style="margin:0 0 2px;color:' + INK + ';font-size:14.5px;line-height:1.6">No signup needed. Open a live demo of the dashboard and see exactly how a fresh lead, its source and the Print &amp; Post tracking look.</p>'
    + '</td></tr>'
    + demoButton(DEMO_URL)
    + '<tr><td align="center" style="padding:0 34px 6px"><p style="margin:2px 0 0;font-size:12px;color:' + MUTED + '">Or preview the <a href="' + PARTNER_DEMO_URL + '" style="color:' + ACCENT + ';font-weight:700;text-decoration:none">partner dashboard</a>.</p></td></tr>'
    + cta(PROPOSAL_URL, 'See the full proposal online');
  return shell('The 9amLeads Partner Programme - proposal for {{contact.COMPANY}}',
    'Recurring commission for your organisation and a 14-day free trial for your members.', inner);
}

// ---------- contacts (verified public routes only) ----------
const CONTACTS = [
  { email: 'Info@bar.co.uk', FIRSTNAME: 'there', COMPANY: 'British Association of Removers', WEBSITE: 'https://bar.co.uk' },
  { email: 'info@ngrs.co.uk', FIRSTNAME: 'there', COMPANY: 'National Guild of Removers & Storers', WEBSITE: 'https://www.ngrs.co.uk' },
  { email: 'geraldine.collett@immigrationindustry.org', FIRSTNAME: 'Geraldine', COMPANY: 'Immigration Industry Association', WEBSITE: 'https://immigrationindustry.org' }
];

async function main() {
  // 1. list (Brevo max limit is 50)
  var folders = j((await req('GET', '/v3/contacts/folders?limit=50')).b) || { folders: [] };
  var folderId = (folders.folders && folders.folders[0] && folders.folders[0].id) || 1;
  var lists = j((await req('GET', '/v3/contacts/lists?limit=50')).b) || { lists: [] };
  var list = (lists.lists || []).find(function (l) { return l.name === LIST_NAME; });
  if (!list) {
    var cr = await req('POST', '/v3/contacts/lists', { name: LIST_NAME, folderId: folderId });
    list = j(cr.b); console.log('List created:', list && list.id, cr.s, (cr.s >= 400 ? cr.b.slice(0, 200) : ''));
  } else { console.log('List exists:', list.id); }
  if (!list || !list.id) { console.log('Could not resolve list id - aborting.'); return; }
  var listId = list.id;

  // 2. contacts
  for (var i = 0; i < CONTACTS.length; i++) {
    var c = CONTACTS[i];
    var r = await req('POST', '/v3/contacts', { email: c.email, attributes: { FIRSTNAME: c.FIRSTNAME, COMPANY: c.COMPANY, WEBSITE: c.WEBSITE }, listIds: [listId], updateEnabled: true });
    console.log('contact', c.email, '->', r.s, (r.s >= 400 ? r.b.slice(0, 120) : 'ok'));
  }

  // 3. templates
  async function upsertTemplate(name, subject, htmlContent) {
    var t = j((await req('GET', '/v3/smtp/templates?limit=100')).b) || { templates: [] };
    var found = (t.templates || []).find(function (x) { return x.name === name; });
    var body = { templateName: name, subject: subject, htmlContent: htmlContent, sender: SENDER, replyTo: REPLYTO.email, isActive: true };
    if (found) { var u = await req('PUT', '/v3/smtp/templates/' + found.id, body); console.log('Template updated:', name, found.id, u.s); return found.id; }
    var c = await req('POST', '/v3/smtp/templates', body); var cj = j(c.b); console.log('Template created:', name, cj && cj.id, c.s); return cj && cj.id;
  }
  await upsertTemplate(TPL_OUTREACH, SUBJECT_OUT, outreachHtml());
  await upsertTemplate(TPL_PROPOSAL, 'The 9amLeads Partner Programme - proposal for {{contact.COMPANY}}', proposalHtml());

  // 4. draft campaign (never sent)
  var camps = j((await req('GET', '/v3/emailCampaigns?limit=100')).b) || { campaigns: [] };
  var existing = (camps.campaigns || []).find(function (x) { return x.name === CAMPAIGN; });
  if (existing) {
    var uu = await req('PUT', '/v3/emailCampaigns/' + existing.id, { subject: SUBJECT_OUT, htmlContent: outreachHtml(), sender: SENDER, replyTo: REPLYTO.email, recipients: { listIds: [listId] } });
    console.log('Draft campaign updated:', existing.id, uu.s, (uu.s >= 400 ? uu.b.slice(0, 200) : 'DRAFT'));
  } else {
    var body = { name: CAMPAIGN, subject: SUBJECT_OUT, sender: SENDER, replyTo: REPLYTO.email, htmlContent: outreachHtml(), recipients: { listIds: [listId] }, type: 'classic' };
    var cc = await req('POST', '/v3/emailCampaigns', body); var cj = j(cc.b);
    console.log('Draft campaign created:', cj && cj.id, cc.s, (cc.s >= 400 ? cc.b.slice(0, 200) : 'DRAFT'));
  }
  console.log('\nDONE. List id=' + listId + '. Nothing was sent.');
}
main();
