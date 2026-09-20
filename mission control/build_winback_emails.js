// build_winback_emails.js - 3-email WIN-BACK sequence for EXPIRED TRIALS.
// Goal: get them to PAY for a package and START using Print & Post (upload their
// flyer/letter), with the "give it a few weeks, ask callers where they found you"
// proof. No em dashes. Output: Desktop/9amleads-winback-emails/
//   1) Let us get your flyer through their door
//   2) Upload your flyer - we do the rest
//   3) The 3-week test
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/ketzm/Desktop/9amleads-winback-emails';
const INK = '#1f2937', MUTED = '#6b7280', LINE = '#e5e7eb', PAGE = '#f4f5f7';
const PRICING = 'https://www.9amleads.com/pricing/';

const PRODUCTS = {
  moving: { accent: '#0ea5e9', plural: 'moving leads' },
  probate: { accent: '#a855f7', plural: 'probate leads' },
  newbusiness: { accent: '#06b6d4', plural: 'new business leads' },
  planning: { accent: '#10b981', plural: 'planning leads' },
  tenders: { accent: '#6366f1', plural: 'public tenders' }
};

function shell(accent, subject, preheader, inner) {
  return '<!DOCTYPE html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>' + subject + '</title></head>\n<body style="margin:0;padding:0;background-color:' + PAGE + ';">\n'
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
function footer(accent) {
  return '<tr><td style="padding:18px 34px 26px">'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:14px;line-height:1.6">Any questions, just reply and I will answer personally.</p>'
    + '<table role="presentation" cellpadding="0" cellspacing="0"><tr>'
    + '<td width="84" valign="middle" style="padding-right:12px"><img src="https://9amleads.com/assets/ketan-photo.jpeg" width="72" height="72" alt="Ketz Mandalia, Founder of 9amLeads" style="display:block;width:72px;height:72px;border-radius:50%;border:0"></td>'
    + '<td valign="middle" style="color:' + INK + ';font-size:14px;line-height:1.5">All the best,<br><strong>Ketz Mandalia</strong><br><span style="color:' + MUTED + ';font-size:13px">Founder, 9amLeads<br>hello@9amleads.com</span></td>'
    + '</tr></table></td></tr>\n'
    + '<tr><td style="padding:0 34px 26px">'
    + '<p style="margin:0 0 10px;color:#9ca3af;font-size:11px;line-height:1.7">9am Leads Ltd, Company No. 17402522, 66 Paul Street, London EC2A 4NA.</p>'
    + '<a href="{{ unsubscribe }}" style="color:' + MUTED + ';font-size:12px;text-decoration:underline">Unsubscribe</a>'
    + '</td></tr>\n';
}
function block(title, lines) {
  return '<tr><td style="padding:0 0 14px">'
    + '<p style="margin:0 0 6px;font-size:14px;font-weight:800;color:' + INK + '">' + title + '</p>'
    + lines.map(function (l) { return '<p style="margin:0 0 4px;font-size:13px;color:' + MUTED + ';line-height:1.55"><span style="color:#16a34a;font-weight:800">&#10003;</span>&nbsp; ' + l + '</p>'; }).join('')
    + '</td></tr>';
}
function bullets(items) {
  return '<tr><td style="padding:6px 34px 4px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + items.map(function (t) { return '<tr><td style="padding:0 0 7px;color:' + INK + ';font-size:14px;line-height:1.55"><span style="color:#16a34a;font-weight:800">&#10003;</span>&nbsp; ' + t + '</td></tr>'; }).join('')
    + '</table></td></tr>\n';
}
function cta(accent, url, text, sub) {
  return '<tr><td align="center" style="padding:10px 34px 6px">'
    + '<a href="' + url + '" style="display:inline-block;background-color:' + accent + ';color:#ffffff;text-decoration:none;padding:15px 38px;border-radius:6px;font-size:16px;font-weight:800">' + text + '</a>'
    + (sub ? '<p style="margin:10px 0 0;color:' + MUTED + ';font-size:12px">' + sub + '</p>' : '')
    + '</td></tr>\n';
}
function head(accent, kick, title) {
  return '<tr><td style="padding:14px 34px 6px"><p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + accent + '">' + kick + '</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">' + title + '</h1>';
}

// Email 1 - get your flyer through their door
function email1(p) {
  const subject = 'Let us get your flyer through their door';
  const inner = logo(p.accent)
    + head(p.accent, 'Time to put it to work', 'Let us get your flyer through their door')
    + '<p style="margin:0 0 14px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>You have seen how the dashboard works, so let us get you actually using Print &amp; Post. Upload your flyer or letter (or just email it to hello@9amleads.com and we will do it for you) and we print, address and post it to your ' + p.plural + '.</p>'
    + '</td></tr>\n'
    + '<tr><td style="padding:0 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + block('Be honest with yourself - it is not overnight', [
      'Give it a few weeks of consistent posting',
      'Then you will notice more phone enquiries',
      'This is how you know it is working: ask every caller where they found you',
      'When they say the flyer through the door, you know'
    ])
    + block('Why it beats chasing work', [
      'Your customers come to you - minimal effort and spend',
      'You reach them before competitors who wait for them to search',
      'One win covers the cost many times over'
    ])
    + '</table></td></tr>\n'
    + cta(p.accent, PRICING, 'Start your Print & Post', 'Pick a package &middot; cancel anytime')
    + footer(p.accent);
  return shell(p.accent, subject, 'Upload your flyer, give it a few weeks, and ask every caller where they found you.', inner);
}

// Email 2 - upload your flyer, we do the rest
function email2(p) {
  const subject = 'Upload your flyer - we do the rest';
  const inner = logo(p.accent)
    + head(p.accent, 'One upload, done', 'Upload your flyer, we do the rest')
    + '<p style="margin:0 0 14px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>Get your Print &amp; Post running in minutes. Upload your flyer (front and back) and a cover letter, or email them to hello@9amleads.com and we will upload them for you.</p>'
    + '</td></tr>\n'
    + bullets([
      'We print double-sided and post to your ' + p.plural,
      'Track every mailpiece, with proof of posting in your dashboard',
      'Auto Send posts to every new lead each morning, without you lifting a finger',
      'Quiet spell? Bulk Send lets you buy extra leads and mail a bigger batch',
      'You only pay for what is actually mailed'
    ])
    + cta(p.accent, PRICING, 'Pick a package and upload your flyer', 'From &pound;25 per week &middot; cancel anytime')
    + footer(p.accent);
  return shell(p.accent, subject, 'Upload your flyer once - we print, address and post it for you.', inner);
}

// Email 3 - the 3-week test
function email3(p) {
  const subject = 'The 3-week test';
  const inner = logo(p.accent)
    + head(p.accent, 'Give it 3 weeks', 'The 3-week test')
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>Here is the honest truth: Print &amp; Post is not overnight. Give it three weeks of consistent posting and the phone starts ringing more. The simplest way to prove it is working: ask every caller where they found you. When they say the flyer through the door, you know it is working.</p>'
    + '</td></tr>\n'
    + '<tr><td style="padding:0 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + block('Why this wins for you', [
      'Customers come to you, so you spend less effort and less chasing',
      'You reach them before competitors who wait for them to search',
      'Bulk Send keeps it going through quiet periods'
    ])
    + '</table></td></tr>\n'
    + cta(p.accent, PRICING, 'Get started - pick your package', 'From &pound;25 per week &middot; cancel anytime')
    + footer(p.accent);
  return shell(p.accent, subject, 'Give it three weeks. Ask every caller where they found you. That is how you know.', inner);
}

const STEPS = { 1: email1, 2: email2, 3: email3 };
function buildWinback(p, step) { return STEPS[step](p); }

for (const key of Object.keys(PRODUCTS)) {
  const p = PRODUCTS[key];
  const dir = path.join(OUT, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1-flyer-through-door.html'), buildWinback(p, 1));
  fs.writeFileSync(path.join(dir, '2-upload-flyer.html'), buildWinback(p, 2));
  fs.writeFileSync(path.join(dir, '3-three-week-test.html'), buildWinback(p, 3));
  console.log('Wrote ' + key);
}
console.log('Output: ' + OUT);
