// build_winback_emails.js - 3-email WIN-BACK sequence for EXPIRED TRIALS.
// Focused on WHY the post + Print & Post beats social media and cold calling,
// with the offer as the closer (no free week). Personalised per product. No em dashes.
//   1) Why a letter beats an ad (and a cold call)
//   2) We print and post it for you
//   3) Let us get you back in front of them
// Output: Desktop/9amleads-winback-emails/
const fs = require('fs');
const path = require('path');

const OUT = 'C:/Users/ketzm/Desktop/9amleads-winback-emails';
const INK = '#1f2937', MUTED = '#6b7280', LINE = '#e5e7eb', PAGE = '#f4f5f7';
const HOWITWORKS = 'https://www.9amleads.com/how-it-works/';
const PRICING = 'https://www.9amleads.com/pricing/';

const PRODUCTS = {
  moving: { accent: '#0ea5e9', label: 'Moving Leads', plural: 'moving leads', noun: 'moving lead' },
  probate: { accent: '#a855f7', label: 'Probate Leads', plural: 'probate leads', noun: 'probate grant' },
  newbusiness: { accent: '#06b6d4', label: 'New Business Alerts', plural: 'new business leads', noun: 'new company' },
  planning: { accent: '#10b981', label: 'Planning Permissions', plural: 'planning leads', noun: 'planning application' },
  tenders: { accent: '#6366f1', label: 'Public Tenders', plural: 'public tenders', noun: 'public tender' }
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

// Email 1 - why the post beats social media and cold calling
function email1(p) {
  const subject = 'Why a letter beats an ad (and a cold call)';
  const inner = logo(p.accent)
    + '<tr><td style="padding:14px 34px 6px">'
    + '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + p.accent + '">The honest truth</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">Why a letter beats an ad (and a cold call)</h1>'
    + '<p style="margin:0 0 14px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>If you are tired of paying for clicks that go nowhere, or losing hours to the phone, this is worth two minutes. Here is why the post still wins, and why it is worth another look.</p>'
    + '</td></tr>\n'
    + '<tr><td style="padding:0 34px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0">'
    + block('Social media: you are renting attention', [
      'You bid against every rival for the same clicks',
      'Costs climb while the results fall',
      'The moment you stop paying, you disappear'
    ])
    + block('Cold calling: the hardest way to win work', [
      'Gatekeepers, rejection and endless dialling',
      'Most people screen calls and never pick up',
      'You only ever reach the few who happen to answer'
    ])
    + block('A letter in the hand works differently', [
      'It is physical - it sits on the kitchen table and is read when they are ready',
      'No algorithm, no auction, no cost per click',
      'You reach the door first, before they start shopping around'
    ])
    + '</table></td></tr>\n'
    + cta(p.accent, HOWITWORKS, 'See how it works', '')
    + footer(p.accent);
  return shell(p.accent, subject, 'Clicks that go nowhere, calls that never connect. Here is why the post wins.', inner);
}

// Email 2 - Print & Post does it for you
function email2(p) {
  const subject = 'We print and post it for you';
  const inner = logo(p.accent)
    + '<tr><td style="padding:14px 34px 6px">'
    + '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + p.accent + '">Zero effort, real results</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">We print and post it for you</h1>'
    + '<p style="margin:0 0 14px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>No printer, no envelopes, no trip to the post box. Upload your leaflet and cover letter once, and we do the rest - printed, addressed and posted to your ' + p.plural + '.</p>'
    + '</td></tr>\n'
    + bullets([
      'Double-sided print: a bold front and an informative back, proven to lift response',
      'Printed edge-to-edge and posted first class by Royal Mail',
      'Every mailpiece tracked, with proof of posting in your dashboard',
      'Auto Send posts to every new lead each morning, without you lifting a finger',
      'You only pay for what is mailed: A5 leaflet &pound;2.99, letter &pound;2.49, or both &pound;4.49'
    ])
    + cta(p.accent, PRICING, 'See plans and pricing', 'Plans from &pound;25 per week &middot; cancel anytime')
    + footer(p.accent);
  return shell(p.accent, subject, 'Upload your leaflet once - we print, address and post it to your leads for you.', inner);
}

// Email 3 - the closer
function email3(p) {
  const subject = 'Let us get you back in front of them';
  const inner = logo(p.accent)
    + '<tr><td style="padding:14px 34px 6px">'
    + '<p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:' + p.accent + '">One more go</p>'
    + '<h1 style="margin:0 0 14px;font-size:23px;line-height:1.3;font-weight:800;color:' + INK + '">Let us get you back in front of them</h1>'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:15px;line-height:1.65">Hi,<br><br>You have seen why the post wins and how Print &amp; Post does the work for you. All that is left is to get your own ' + p.plural + ' flowing again.</p>'
    + '<p style="margin:0 0 12px;color:' + INK + ';font-size:15px;line-height:1.65">Pick a plan and I will personally make sure your areas are set up to give you a full daily batch, with your Print &amp; Post ready to go. Want a deal on your first month? Just reply and I will sort it for you.</p>'
    + '</td></tr>\n'
    + cta(p.accent, PRICING, 'Get started', 'Plans from &pound;25 per week &middot; cancel anytime')
    + footer(p.accent);
  return shell(p.accent, subject, 'Pick a plan and I will set up your areas personally.', inner);
}

const SUBJECTS = { 1: email1, 2: email2, 3: email3 };
function buildWinback(p, step) { return SUBJECTS[step](p); }

for (const key of Object.keys(PRODUCTS)) {
  const p = PRODUCTS[key];
  const dir = path.join(OUT, key);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '1-why-post-wins.html'), buildWinback(p, 1));
  fs.writeFileSync(path.join(dir, '2-print-and-post.html'), buildWinback(p, 2));
  fs.writeFileSync(path.join(dir, '3-closer.html'), buildWinback(p, 3));
  console.log('Wrote ' + key);
}
console.log('Output: ' + OUT);
