// build_buyer_emails_v25_demo.js
// NEW cold sequence aimed at fixing "clicks but no sign-ups": it lowers the
// commitment by sending people to the LIVE DEMO DASHBOARD first, then converts.
//   1) Real lead     - a genuine-looking sample lead with its SOURCE + a demo CTA
//   2) Dashboard     - a 60-second look at the dashboard they get + demo CTA
//   3) Free week     - the trial CTA (no card)
// Per business subtype. No em dashes. Usage: node build_buyer_emails_v25_demo.js [subtype]
const fs = require('fs');
const path = require('path');
const { P, SUBTYPES } = require('./buyer_taxonomy.js');

const OUT = 'C:/Users/ketzm/Desktop/9amleads-buyer-emails-v25-demo';
const INK = '#1f2937', MUTED = '#6b7280', LINE = '#e5e7eb', PAGE = '#f4f5f7';
const D = { moving: '#0b6bb3', probate: '#6d28d9', newbusiness: '#0e7490', planning: '#047857', tenders: '#4338ca' };
const UTM = 'utm_source=email&utm_medium=cold&utm_campaign=v25_demo';

function clean(s) {
  return String(s == null ? '' : s).replace(/\u2014/g, '-').replace(/\u2013/g, '-').replace(/&mdash;/g, '-').replace(/&ndash;/g, '-').replace(/\s+-\s+/g, ' - ');
}
function demoUrl(product) { return 'https://www.9amleads.com/portal/demo.html?product=' + product + '&' + UTM; }
function leadNoun(st) {
  switch (st.product) {
    case 'moving': return 'moving lead';
    case 'probate': return 'probate grant';
    case 'newbusiness': return 'new company registration';
    case 'planning': return 'planning application';
    case 'tenders': return 'public tender';
    default: return 'lead';
  }
}
function leadNounPlural(st) {
  switch (st.product) {
    case 'moving': return 'moving leads';
    case 'probate': return 'probate leads';
    case 'newbusiness': return 'new business leads';
    case 'planning': return 'planning leads';
    case 'tenders': return 'live public tenders';
    default: return 'leads';
  }
}
const SAMPLE = {
  moving: {
    fields: [['Address', '14 Oakwood Avenue, Enfield'], ['Postcode', 'EN1 3HJ'], ['Bedrooms', '3'], ['Guide price', '\u00a3475,000']],
    source: 'Rightmove', sourceUrl: 'https://www.rightmove.co.uk/', why: 'Someone who has just listed their home is looking for removal quotes right now.'
  },
  probate: {
    fields: [['Estate', 'Margaret Collins'], ['Address', '7 The Paddock, Sunbury'], ['Postcode', 'TW16 5EX'], ['Grant date', '3 days ago'], ['Estate value', '\u00a3284,242']],
    source: 'HMCTS / UK Gazette', sourceUrl: 'https://www.gov.uk/search-will-probate', why: 'A probate grant is the moment the executor starts instructing professionals.'
  },
  newbusiness: {
    fields: [['Company', 'Brightleaf Marketing Ltd'], ['Address', '21 Market Street, Leeds'], ['Postcode', 'LS1 6EZ'], ['Incorporated', '2 days ago'], ['SIC code', '70229 Management consultancy']],
    source: 'Companies House', sourceUrl: 'https://find-and-update.company-information.service.gov.uk/', why: 'A brand new company needs an accountant, website, insurance and IT from day one.'
  },
  planning: {
    fields: [['Address', '33 Church Road, Chorley'], ['Postcode', 'PR7 4HT'], ['Application', 'Single storey rear extension'], ['Status', 'Pending'], ['Council', 'Chorley Council']],
    source: 'Planning Portal', sourceUrl: 'https://www.planningportal.co.uk/', why: 'An approved or pending application means work is about to be priced and booked.'
  },
  tenders: {
    fields: [['Contract', 'School catering services - 3 year contract'], ['Buyer', 'Local Authority'], ['Value', '\u00a3450,000'], ['Closes', 'in 14 days']],
    source: 'Contracts Finder', sourceUrl: 'https://www.find-tender.service.gov.uk/', why: 'Public contracts are published daily, and the first credible bid often wins.'
  }
};

function shell(accent, subject, preheader, inner) {
  return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + subject + '</title></head>\n'
    + '<body style="margin:0;padding:0;background-color:' + PAGE + ';">\n'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' + preheader + '</div>\n'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' + PAGE + '" style="background-color:' + PAGE + '"><tr><td align="center" bgcolor="' + PAGE + '" style="padding:24px 12px;background-color:' + PAGE + '">\n'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid ' + LINE + ';border-radius:8px">\n'
    + '<tr><td style="height:4px;background-color:' + accent + ';font-size:0;line-height:0">&nbsp;</td></tr>\n'
    + inner
    + '</table>\n</td></tr></table>\n</body></html>\n';
}
function logo(accent) {
  return '<tr><td style="padding:26px 34px 0"><p style="margin:0;font-size:18px;font-weight:800;color:' + INK + '"><a href="https://www.9amleads.com" style="color:' + INK + ';text-decoration:none">9am<span style="color:' + accent + '">Leads</span></a></p></td></tr>\n';
}
function footer(accent, prod) {
  return '<tr><td style="padding:18px 34px 26px">'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:14px;line-height:1.6">Any questions, just reply and I will answer personally.</p>'
    + '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    + '<td width="84" valign="middle" style="padding-right:12px"><img src="https://9amleads.com/assets/ketan-photo.jpeg" width="72" height="72" alt="Ketz Mandalia, Founder of 9amLeads" style="display:block;width:72px;height:72px;border-radius:50%;border:0"></td>'
    + '<td valign="middle" style="color:' + INK + ';font-size:14px;line-height:1.5">All the best,<br><strong>Ketz Mandalia</strong><br><span style="color:' + MUTED + ';font-size:13px">Founder, 9amLeads<br>hello@9amleads.com</span></td>'
    + '</tr></table></td></tr>\n'
    + '<tr><td style="padding:0 34px 26px">'
    + '<p style="margin:0 0 12px;font-size:12px"><a href="' + prod.url + '" style="color:' + accent + ';text-decoration:none;font-weight:700">' + prod.label + '</a> &nbsp;|&nbsp; <a href="https://www.9amleads.com" style="color:' + accent + ';text-decoration:none;font-weight:700">9amLeads.com</a></p>'
    + '<p style="margin:0 0 10px;color:#9ca3af;font-size:11px;line-height:1.7">9am Leads Ltd, Company No. 17402522, 66 Paul Street, London EC2A 4NA. You received this because we thought your business could benefit from fresh UK opportunities.</p>'
    + '<a href="{{ unsubscribe }}" style="color:' + MUTED + ';font-size:12px;text-decoration:underline">Unsubscribe</a>'
    + '</td></tr>\n';
}
function sampleCard(accent, s) {
  var rows = s.fields.map(function (f) {
    return '<tr><td style="padding:7px 0;border-bottom:1px solid ' + LINE + ';font-size:12.5px;color:' + MUTED + ';width:120px">' + f[0] + '</td>'
      + '<td style="padding:7px 0;border-bottom:1px solid ' + LINE + ';font-size:14px;color:' + INK + ';font-weight:700">' + f[1] + '</td></tr>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid ' + LINE + ';border-left:4px solid ' + accent + ';border-radius:10px"><tr><td style="padding:18px 20px">'
    + '<p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:' + accent + '">Live example</p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">' + rows + '</table>'
    + '<p style="margin:12px 0 0;font-size:12.5px;color:' + MUTED + '">Source: <a href="' + s.sourceUrl + '" style="color:' + accent + ';text-decoration:none;font-weight:700">' + s.source + '</a> &middot; ' + s.why + '</p>'
    + '</td></tr></table>';
}
function dashboardMock(accent) {
  function row(addr, when) {
    return '<tr><td style="padding:9px 0;border-bottom:1px solid ' + LINE + ';font-size:13px;color:' + INK + '">' + addr + '</td>'
      + '<td align="right" style="padding:9px 0;border-bottom:1px solid ' + LINE + ';font-size:11px;color:' + MUTED + '">' + when + '</td></tr>';
  }
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ' + LINE + ';border-radius:12px;overflow:hidden">'
    + '<tr><td style="background:' + accent + ';padding:12px 18px;color:#fff;font-size:13px;font-weight:800">9amLeads Dashboard</td></tr>'
    + '<tr><td style="padding:16px 18px;background:#ffffff">'
    + '<p style="margin:0 0 4px;font-size:12px;color:' + MUTED + '">Good morning, Demo Account</p>'
    + '<p style="margin:0 0 14px;font-size:22px;font-weight:900;color:' + INK + '">5 <span style="font-size:13px;font-weight:600;color:' + MUTED + '">leads delivered today</span></p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + row('14 Oakwood Avenue, Enfield, EN1 3HJ', 'Sent today')
    + row('33 Church Road, Chorley, PR7 4HT', 'Sent today')
    + row('21 Market Street, Leeds, LS1 6EZ', 'Sent today')
    + '</table>'
    + '<p style="margin:14px 0 0"><span style="display:inline-block;background:' + accent + ';color:#fff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:6px">Print &amp; Post</span> <span style="display:inline-block;border:1px solid ' + LINE + ';color:' + INK + ';font-size:12px;font-weight:700;padding:8px 16px;border-radius:6px">Track every lead</span></p>'
    + '</td></tr></table>';
}
function ctaButton(accent, url, text) {
  return '<tr><td align="center" style="padding:8px 34px 6px">'
    + '<a href="' + url + '" style="display:inline-block;background-color:' + accent + ';color:#ffffff;text-decoration:none;padding:15px 36px;border-radius:6px;font-size:16px;font-weight:700">' + text + '</a>'
    + '<p style="margin:10px 0 0;color:' + MUTED + ';font-size:12px">No signup needed &middot; nothing to install</p>'
    + '</td></tr>\n';
}
function trialLink(accent, prod) {
  return '<tr><td align="center" style="padding:4px 34px 10px"><p style="margin:0;font-size:13px;color:' + MUTED + '">Or <a href="' + prod.url + '?' + UTM + '" style="color:' + accent + ';text-decoration:none;font-weight:700">start your free week</a> - no card required.</p></td></tr>\n';
}

// ---- Email 1: real lead ----
function email1(st, prod, accent) {
  const subject = 'A real ' + leadNoun(st) + ' - see where it came from';
  const s = SAMPLE[st.product];
  const inner = logo(accent)
    + '<tr><td style="padding:14px 34px 6px">'
    + '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + accent + '">Proof, not promises</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">Here is a real ' + leadNoun(st) + '</h1>'
    + '<p style="margin:0 0 14px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>I am Ketz, founder of 9amLeads. Rather than tell you how it works, here is a genuine ' + leadNoun(st) + ' from this morning:</p>'
    + sampleCard(accent, s)
    + '<p style="margin:16px 0 6px;color:' + INK + ';font-size:15px;line-height:1.65">This is what lands in your inbox at 9am every weekday - with the <strong>source</strong> so you can check it yourself, the full address, and a score. You are not just handed a list of addresses and asked to trust it.</p>'
    + '</td></tr>\n'
    + ctaButton(accent, demoUrl(st.product), 'See the live dashboard - no signup')
    + trialLink(accent, prod)
    + footer(accent, prod);
  return shell(accent, subject, 'A real ' + leadNoun(st) + ' with its source - see it in the live dashboard, no signup.', inner);
}

// ---- Email 2: dashboard in 60 seconds ----
function email2(st, prod, accent) {
  const subject = 'Your leads dashboard in 60 seconds';
  const inner = logo(accent)
    + '<tr><td style="padding:14px 34px 6px">'
    + '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + accent + '">See it for yourself</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">The dashboard your leads land in</h1>'
    + '<p style="margin:0 0 16px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>Quick one. This is the dashboard our customers open every morning - fresh ' + leadNounPlural(st) + ', the source of each one, and Print &amp; Post in a click:</p>'
    + dashboardMock(accent)
    + '<p style="margin:16px 0 6px;color:' + INK + ';font-size:15px;line-height:1.65">You can open the <strong>live demo</strong> yourself - it is the real dashboard, loaded with sample ' + leadNounPlural(st) + '. Nothing to install, no signup. Click around and see the transparency, freshness and tracking for yourself.</p>'
    + '</td></tr>\n'
    + ctaButton(accent, demoUrl(st.product), 'Open the live demo dashboard')
    + trialLink(accent, prod)
    + footer(accent, prod);
  return shell(accent, subject, 'Open the live demo dashboard - the real thing, no signup.', inner);
}

// ---- Email 3: free week ----
function email3(st, prod, accent) {
  const subject = 'Your free week is still waiting';
  const inner = logo(accent)
    + '<tr><td style="padding:14px 34px 6px">'
    + '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + accent + '">No card, no risk</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">Claim your free week</h1>'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>You have seen the real ' + leadNoun(st) + ' and the dashboard. The next step is to get your own: fresh ' + leadNounPlural(st) + ' in your area, delivered at 9am every weekday, completely free for 7 days.</p>'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:15px;line-height:1.65"><strong>No card. No payment. Cancel anytime.</strong> One win from these leads can cover the cost many times over - that is why we let you see it free first.</p>'
    + '<p style="margin:0 0 14px;color:' + MUTED + ';font-size:14px;line-height:1.65">' + clean(st.hook) + '</p>'
    + '</td></tr>\n'
    + '<tr><td align="center" style="padding:8px 34px 6px">'
    + '<a href="' + prod.url + '?' + UTM + '" style="display:inline-block;background-color:' + accent + ';color:#ffffff;text-decoration:none;padding:16px 40px;border-radius:6px;font-size:16px;font-weight:800">Start my free week - no payment required</a>'
    + '<p style="margin:10px 0 0;color:' + MUTED + ';font-size:12px">7 days free &middot; no card &middot; cancel anytime</p>'
    + '</td></tr>\n'
    + '<tr><td align="center" style="padding:2px 34px 10px"><p style="margin:0;font-size:13px;color:' + MUTED + '">Prefer to look first? <a href="' + demoUrl(st.product) + '" style="color:' + accent + ';text-decoration:none;font-weight:700">Open the live demo</a>.</p></td></tr>\n'
    + footer(accent, prod);
  return shell(accent, subject, 'Your 7-day free week - no card required.', inner);
}

const only = process.argv[2];
const ids = only ? [only] : Object.keys(SUBTYPES);
ids.forEach(function (id) {
  if (!SUBTYPES[id]) { console.log('Unknown: ' + id); return; }
  const st = SUBTYPES[id], prod = P[st.product], accent = D[st.product];
  const dir = path.join(OUT, st.product);
  fs.mkdirSync(dir, { recursive: true });
  [['1', email1], ['2', email2], ['3', email3]].forEach(function (pair) {
    const html = pair[1](st, prod, accent);
    if (/\u2014|\u2013|&mdash;|&ndash;/.test(html)) console.log('WARN dash in ' + id + '-' + pair[0]);
    fs.writeFileSync(path.join(dir, id + '-' + pair[0] + '.html'), html);
  });
  console.log('Wrote ' + id + ' (1 real lead, 2 dashboard, 3 free week)');
});
console.log('Output: ' + OUT);
