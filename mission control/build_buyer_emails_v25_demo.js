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
// Sample lead rendered EXACTLY like the dashboard lead card: checkbox, badge,
// score, full address, meta line, price/status, Print & Post + Reject & Replace,
// and the Outcome row. (Source text is NOT a clickable link.)
const SAMPLE = {
  moving: {
    badge: 'MOVING', badgeColor: '#0ea5e9', score: '85/100',
    title: '12 Oakwood Avenue, Westminster, SW1A 1AA',
    meta: '3 bed &middot; Detached &middot; Demo Estate Agents &middot; View on Rightmove',
    price: '\u00a3475,000', status: 'Available', kind: 'post'
  },
  probate: {
    badge: 'PROBATE', badgeColor: '#a855f7',
    title: 'Margaret Collins',
    meta: '7 The Paddock, Sunbury, TW16 5EX &middot; Published 17 Sep 2026 &middot; Solicitor: Demo Legal Services &middot; View notice',
    kind: 'post'
  },
  newbusiness: {
    badge: 'NEW BIZ', badgeColor: '#22c55e',
    title: 'Brightleaf Marketing Ltd',
    meta: '21 Market Street, Leeds, LS1 6EZ &middot; Incorporated 18 Sep 2026 &middot; SIC: 70229 Management consultancy &middot; View on Companies House',
    kind: 'post'
  },
  planning: {
    badge: 'PLANNING', badgeColor: '#f59e0b',
    title: '33 Church Road, Chorley, PR7 4HT',
    meta: 'Householder Application &middot; Approved &middot; Planning application date: 15 Sep 2026 &middot; Chorley Council &middot; Ref: DEMO/2026/100',
    desc: 'Single storey rear extension', kind: 'post'
  },
  tenders: {
    badge: 'TENDER', badgeColor: '#6366f1',
    title: 'School catering services - 3 year contract',
    meta: 'Local Authority &middot; \u00a3450,000 &middot; Deadline 4 Oct 2026 &middot; View tender',
    kind: 'apply'
  }
};
// Per-business-type sample lead so the preview matches the recipient's trade.
const SAMPLE_BY_SUBTYPE = {
  // MOVING
  'moving-removal': { title: '12 Oakwood Avenue, Westminster, SW1A 1AA', subtitle: '3 bed house move &middot; \u00a3475,000', chips: ['Added today', 'Detached', 'Available'] },
  'moving-manvan': { title: '14 Lime Grove, Peckham, SE15 4AA', subtitle: '1 bed flat move &middot; \u00a3310,000', chips: ['Added today', 'Flat', 'Available'] },
  'moving-storage': { title: '26 Devon Street, Kingston, KT2 6AA', subtitle: '3 bed &middot; storage required', chips: ['Added today', 'Semi-Detached'] },
  'moving-clearance': { title: '40 Park Lane, Sutton, SM1 3AN', subtitle: 'Full house clearance', chips: ['Added today', 'Detached'] },
  'moving-packers': { title: '33 Church Road, Richmond, TW9 3AB', subtitle: '4 bed &middot; packing and relocation', chips: ['Added today', 'Detached'] },
  'moving-skipwaste': { title: '19 Lime Grove, Peckham, SE15 4AA', subtitle: 'Skip hire and waste removal', chips: ['Added today', 'Flat'] },
  // PROBATE
  'probate-solicitor': { title: 'Margaret Collins', subtitle: '7 The Paddock, Sunbury, TW16 5EX', chips: ['Grant date: 3 days ago', '\u00a3284,242 estate'] },
  'probate-estateagent': { title: 'Margaret Collins', subtitle: '7 The Paddock, Sunbury, TW16 5EX', chips: ['Grant date: 3 days ago', 'Property to sell'] },
  'probate-funeraldirector': { title: 'John Thompson', subtitle: '46 Station Road, Woking, GU21 1AA', chips: ['Grant date: 3 days ago', '\u00a3271,141 estate'] },
  'probate-financial': { title: 'Helen Wood', subtitle: '89 Park Lane, Tunbridge Wells, TN1 1AA', chips: ['Grant date: 3 days ago', '\u00a3273,395 estate'] },
  'probate-willwriter': { title: 'Richard Khan', subtitle: '128 Church Road, Camden, NW1 1AA', chips: ['Grant date: 3 days ago', 'No will on record'] },
  // NEW BUSINESS
  'nb-accountant': { title: 'Brightleaf Marketing Ltd', subtitle: '21 Market Street, Leeds, LS1 6EZ', chips: ['Incorporated 2 days ago', 'SIC 70229 Management consultancy'] },
  'nb-webdesign': { title: 'Northgate Plumbing Ltd', subtitle: '5 Bridge Road, Manchester, M1 2AB', chips: ['Incorporated 2 days ago', 'No website found'] },
  'nb-marketing': { title: 'Verdant Landscapes Ltd', subtitle: '14 The Parade, Bristol, BS1 5TR', chips: ['Incorporated 2 days ago', 'SIC 81300 Landscape services'] },
  'nb-it': { title: 'Apex IT Solutions Ltd', subtitle: '78 High Street, Birmingham, B1 1AA', chips: ['Incorporated 2 days ago', 'SIC 62020 IT consultancy'] },
  'nb-insurance': { title: 'Ridgeline Construction Ltd', subtitle: '31 Portland Road, Glasgow, G1 1AA', chips: ['Incorporated 2 days ago', 'SIC 41201 Construction'] },
  'nb-recruitment': { title: 'Bluebell Care Ltd', subtitle: '9 Kingsway, London, WC2B 6AA', chips: ['Incorporated 2 days ago', 'SIC 88100 Social care'] },
  'nb-businesssupport': { title: 'Copperfield Consulting Ltd', subtitle: '52 Queen Street, Cardiff, CF10 1AA', chips: ['Incorporated 2 days ago', 'SIC 70229 Consultancy'] },
  // PLANNING
  'plan-builder': { title: '33 Church Road, Chorley, PR7 4HT', subtitle: 'Chorley Council &middot; Householder Application &middot; Approved', chips: ['New detached dwelling'] },
  'plan-roofing': { title: '12 High Street, Leeds, LS1 6EZ', subtitle: 'Leeds City Council &middot; Householder Application &middot; Approved', chips: ['Roof replacement and re-roof'] },
  'plan-architect': { title: '88 Mill Lane, Bristol, BS1 5TR', subtitle: 'Bristol City Council &middot; Full Application &middot; Pending', chips: ['Two storey side and rear extension'] },
  'plan-landscaper': { title: '5 The Green, Birmingham, B1 1AA', subtitle: 'Birmingham City Council &middot; Householder Application &middot; Pending', chips: ['Landscaping and new driveway'] },
  // TENDERS
  'tend-construction': { title: 'Highways resurfacing programme', subtitle: 'County Council', chips: ['\u00a32,500,000', 'Closes in 14 days'] },
  'tend-cleaning': { title: 'Building cleaning services', subtitle: 'City Council', chips: ['\u00a3750,000', 'Closes in 14 days'] },
  'tend-security': { title: 'Security services for public buildings', subtitle: 'Police Authority', chips: ['\u00a3400,000', 'Closes in 14 days'] },
  'tend-it': { title: 'IT support and managed services', subtitle: 'NHS Trust', chips: ['\u00a31,200,000', 'Closes in 14 days'] },
  'tend-facilities': { title: 'Facilities management for council estates', subtitle: 'District Council', chips: ['\u00a3900,000', 'Closes in 14 days'] },
  'tend-logistics': { title: 'Transport and logistics services', subtitle: 'Public Sector Body', chips: ['\u00a3600,000', 'Closes in 14 days'] },
  'tend-healthcare': { title: 'Healthcare and social care services', subtitle: 'NHS Trust', chips: ['\u00a31,500,000', 'Closes in 14 days'] }
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
  var chips = (s.chips || []).map(function (c) {
    return '<span style="display:inline-block;padding:3px 9px;margin:0 5px 5px 0;border:1px solid ' + LINE + ';border-radius:6px;font-size:11.5px;color:' + INK + '">' + c + '</span>';
  }).join('');
  return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ' + LINE + ';border-radius:12px;overflow:hidden">'
    + '<tr><td style="height:3px;background:' + accent + ';font-size:0;line-height:0">&nbsp;</td></tr>'
    + '<tr><td style="padding:16px 18px">'
    + '<span style="display:inline-block;padding:3px 10px;border-radius:5px;background:' + accent + ';color:#fff;font-size:10px;font-weight:800;letter-spacing:0.8px">' + s.badge + '</span>'
    + '<p style="margin:10px 0 3px;font-size:16px;font-weight:800;color:' + INK + ';line-height:1.35">' + s.title + '</p>'
    + '<p style="margin:0 0 8px;font-size:13px;color:' + INK + '">' + s.subtitle + '</p>'
    + (chips ? '<p style="margin:0 0 10px">' + chips + '</p>' : '')
    + '<p style="margin:0;font-size:12px;color:' + MUTED + '">Source: <strong style="color:' + INK + '">' + s.source + '</strong> &middot; ' + s.why + '</p>'
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
    + '<p style="margin:10px 0 0;color:' + MUTED + ';font-size:12px">Look around, then start your free week &middot; no card required</p>'
    + '</td></tr>\n';
}
// Three persuasion blocks: vs other address providers, post vs online ads, why this approach.
function whyBetter(accent) {
  function block(title, lines) {
    return '<tr><td style="padding:0 0 14px">'
      + '<p style="margin:0 0 6px;font-size:14px;font-weight:800;color:' + INK + '">' + title + '</p>'
      + lines.map(function (l) { return '<p style="margin:0 0 4px;font-size:13px;color:' + MUTED + ';line-height:1.55"><span style="color:#16a34a;font-weight:800">&#10003;</span>&nbsp; ' + l + '</p>'; }).join('')
      + '</td></tr>';
  }
  return '<tr><td style="padding:6px 34px 0">'
    + '<p style="margin:0 0 10px;font-size:11px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:' + accent + '">Why this is different</p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + block('Better than a bought address list', [
      'Every lead shows its <strong style="color:' + INK + '">source</strong>, so you can verify it yourself',
      'Fresh opportunities every day, not a stale list bought months ago',
      'Track every lead you send, and see who you have already mailed'
    ])
    + block('Why the post beats online advertising', [
      'A letter or flyer lands in their hand and stays in their home',
      'No auction, no rising cost per click, no being scrolled past',
      'It is there when they are ready, not for a split second'
    ])
    + block('Why this approach wins', [
      'You reach people <strong style="color:' + INK + '">before</strong> they start shopping around',
      'Your own allocation, not resold to three rivals at once',
      'You are first to the opportunity, every morning at 9am'
    ])
    + '</table></td></tr>\n';
}
function trialLink(accent, prod) {
  return '<tr><td align="center" style="padding:4px 34px 10px"><p style="margin:0;font-size:13px;color:' + MUTED + '">Or <a href="' + prod.url + '?' + UTM + '" style="color:' + accent + ';text-decoration:none;font-weight:700">start your free week</a> - no card required.</p></td></tr>\n';
}

// ---- Email 1: real lead ----
function listItem(t) {
  return '<tr><td style="padding:0 0 7px;color:' + INK + ';font-size:14px;line-height:1.55"><span style="color:#16a34a;font-weight:800">&#10003;</span>&nbsp; ' + t + '</td></tr>';
}
function email1(st, prod, accent, id) {
  const subject = 'See a real ' + leadNoun(st) + ' in the live dashboard';
  const inner = logo(accent)
    + '<tr><td style="padding:14px 34px 6px">'
    + '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + accent + '">Proof, not promises</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">See exactly what you get</h1>'
    + '<p style="margin:0 0 14px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>I am Ketz, founder of 9amLeads. The quickest way to see what we do is the <strong>live dashboard</strong> - loaded with real ' + leadNounPlural(st) + '. You will see each lead\'s source, its score, and everything you can do in a click:</p>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 4px">'
    + listItem('The source of every lead, so you can verify it yourself')
    + listItem('Print &amp; Post a letter or flyer in one click, with live tracking')
    + listItem('Reject &amp; Replace any lead that is wrong - we send a fresh one')
    + listItem('Add notes and track each lead: contacted, quoted, won or lost')
    + '</table>'
    + '</td></tr>\n'
    + whyBetter(accent)
    + ctaButton(accent, demoUrl(st.product), 'Open the live dashboard')
    + trialLink(accent, prod)
    + footer(accent, prod);
  return shell(accent, subject, 'See a real ' + leadNoun(st) + ' - source, score, Print & Post and Replace - in the live dashboard.', inner);
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
    + '<p style="margin:16px 0 6px;color:' + INK + ';font-size:15px;line-height:1.65">You can open the <strong>live demo</strong> yourself - it is the real dashboard, loaded with sample ' + leadNounPlural(st) + '. Nothing to install. Click around and see the transparency, freshness and tracking for yourself.</p>'
    + '</td></tr>\n'
    + ctaButton(accent, demoUrl(st.product), 'Open the live demo dashboard')
    + trialLink(accent, prod)
    + footer(accent, prod);
  return shell(accent, subject, 'Open the live demo dashboard - the real thing.', inner);
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
    + whyBetter(accent)
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
  [['1', email1], ['2', email2]].forEach(function (pair) {
    const html = pair[1](st, prod, accent, id);
    if (/\u2014|\u2013|&mdash;|&ndash;/.test(html)) console.log('WARN dash in ' + id + '-' + pair[0]);
    fs.writeFileSync(path.join(dir, id + '-' + pair[0] + '.html'), html);
  });
  console.log('Wrote ' + id + ' (1 real lead, 2 dashboard, 3 free week)');
});
console.log('Output: ' + OUT);
