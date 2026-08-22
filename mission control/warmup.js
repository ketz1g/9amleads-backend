// warmup.js — Brevo sender warm-up.
// The "9am moving leads" campaign was blasted to 2,524 cold contacts in one shot,
// which got most filtered to spam (285/2500 opens). This module instead ramps the
// SAME content out in small, growing daily batches over ~3 weeks so Gmail/Outlook
// build trust with the sender (hello@9amleads.com) instead of flagging it.
//
// Ramp schedule (by warm-up day):
//   Day 1-3: 60/day    Day 10-12: 350/day   Day 19-21: 1000/day
//   Day 4-6: 100/day   Day 13-15: 500/day
//   Day 7-9: 200/day   Day 16-18: 700/day
//
// Each run sends ONE campaign to a fresh temp list containing the next batch of
// contacts from the source list. Progress is tracked in data/warmup_state.json.
const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'warmup_state.json');
const SOURCE_LIST_ID = parseInt(process.env.WARMUP_LIST_ID || '44', 10);   // MovingLeads
const SOURCE_CAMPAIGN_ID = parseInt(process.env.WARMUP_CAMPAIGN_ID || '427', 10);
const BREVO_KEY = process.env.BREVO_API_KEY || '';

function log(m) { const s = '[' + new Date().toISOString() + '] [WARMUP] ' + m; console.log(s); try { fs.appendFileSync(path.join(DATA_DIR, 'warmup.log'), s + '\n'); } catch(e) {} }

function req(method, pathName, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const h = { 'api-key': BREVO_KEY, 'Accept': 'application/json' };
    if (data) h['Content-Length'] = Buffer.byteLength(data);
    h['Content-Type'] = 'application/json';
    const r = https.request({ hostname: 'api.brevo.com', port: 443, method, path: pathName, headers: h }, (res) => { let b=''; res.on('data', c2=>b+=c2); res.on('end', () => resolve({ status: res.statusCode, body: b })); });
    r.on('error', e => resolve({ status: 0, body: String(e) }));
    if (data) r.write(data); r.end();
  });
}

function rampSize(day) {
  if (day <= 3) return 60;
  if (day <= 6) return 100;
  if (day <= 9) return 200;
  if (day <= 12) return 350;
  if (day <= 15) return 500;
  if (day <= 18) return 700;
  return 1000;
}

async function runWarmup(force) {
  if (!BREVO_KEY) { log('No BREVO_API_KEY'); return { success: false, error: 'no key' }; }
  const today = new Date().toISOString().split('T')[0];
  let state = { offset: 0, day: 1, last_run: '', done: false, total_sent: 0 };
  try { state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch(e) {}
  if (state.done) { log('Warm-up already complete (' + state.total_sent + ' sent).'); return { success: true, done: true }; }
  if (state.last_run === today && !force) { log('Already ran today.'); return { success: true, skipped: true }; }

  // Get the source list's contact emails (paginated) so we can build the batch.
  let allEmails = [];
  let offset = 0;
  for (let p = 0; p < 60; p++) {
    const r = await req('GET', '/v3/contacts/lists/' + SOURCE_LIST_ID + '/contacts?limit=500&offset=' + offset + '&sort=desc');
    let d; try { d = JSON.parse(r.body); } catch(e) { break; }
    const batch = (d.contacts || []).map(c => c.email);
    allEmails = allEmails.concat(batch);
    if (batch.length < 500) break;
    offset += 500;
  }
  log('source list ' + SOURCE_LIST_ID + ' has ' + allEmails.length + ' contacts');
  if (state.offset >= allEmails.length) {
    state.done = true; state.last_run = today;
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    log('All contacts sent. Warm-up complete (' + state.total_sent + ').');
    return { success: true, done: true };
  }

  const size = Math.min(rampSize(state.day), allEmails.length - state.offset);
  const batchEmails = allEmails.slice(state.offset, state.offset + size);
  log('Day ' + state.day + ': sending to ' + batchEmails.length + ' (offset ' + state.offset + '->' + (state.offset + size) + ')');

  // 1. Create a temp list with the batch.
  const listRes = await req('POST', '/v3/contacts/lists', { name: 'warmup_batch_' + today + '_d' + state.day, folderId: 3 });
  let listId; try { listId = JSON.parse(listRes.body).id; } catch(e) { log('temp list create failed: ' + listRes.body.substring(0,200)); return { success: false, error: listRes.body }; }
  // 2. Add the batch emails to the temp list (import).
  const imp = await req('POST', '/v3/contacts/import', { listIds: [listId], emails: batchEmails });
  log('import to list ' + listId + ': ' + imp.status);
  // 3. Fetch the source campaign content to reuse.
  const cRes = await req('GET', '/v3/emailCampaigns/' + SOURCE_CAMPAIGN_ID);
  let src; try { src = JSON.parse(cRes.body); } catch(e) { log('campaign fetch failed: ' + cRes.body.substring(0,200)); return { success: false, error: cRes.body }; }
  // 4. Create a campaign to the temp list.
  // IMPROVED CONTENT (engagement-focused): short, value-first, one CTA — far less
  // likely to be spam-filtered than the original all-caps marketing wall.
  var warmSubject = 'Fresh removals leads in your area - 1 week free';
  var warmHtml =
    '<div style="font-family:Arial,Helvetica,sans-serif;background:#f1f5f9;color:#1e293b;padding:24px 16px">' +
    '<div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:10px;padding:26px 28px">' +
    '<div style="font-size:15px;font-weight:800;color:#0ea5e9;margin-bottom:14px">9amLeads</div>' +
    '<p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 12px">Hi,</p>' +
    '<p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 12px">Finding new customers is the hardest part of running a removals business.</p>' +
    '<p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 12px">9amLeads delivers <b>fresh, verified home-moving leads</b> from your chosen postcode areas to your inbox every morning at 9am - so you can contact homeowners <b>within hours of a listing, before your competitors</b>.</p>' +
    '<p style="font-size:14px;line-height:1.6;color:#334155;margin:0 0 18px">Try it <b>free for 1 week</b>. No card needed. Cancel anytime.</p>' +
    '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px"><tr><td style="border-radius:8px;background:#0ea5e9"><a href="https://www.9amleads.com" style="display:inline-block;padding:12px 26px;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700">Start my free week</a></td></tr></table>' +
    '<p style="font-size:13px;color:#64748b;margin:0">www.9amleads.com</p>' +
    '</div></div>';
  const campRes = await req('POST', '/v3/emailCampaigns', {
    name: '9am moving leads - warmup day ' + state.day,
    subject: warmSubject,
    previewText: 'Fresh, verified home-moving leads in your area every morning.',
    sender: { email: src.sender.email, name: src.sender.name || '9am Leads', id: src.sender.id },
    replyTo: src.replyTo || src.sender.email,
    htmlContent: warmHtml,
    recipients: { lists: [listId] },
    tag: src.tag || '9amleads'
  });
  let campId; try { campId = JSON.parse(campRes.body).id; } catch(e) { log('campaign create failed: ' + campRes.body.substring(0,300)); return { success: false, error: campRes.body }; }
  // 5. Send it.
  const sendRes = await req('PUT', '/v3/emailCampaigns/' + campId + '/send', {});
  log('sent campaign ' + campId + ': ' + sendRes.status + ' ' + sendRes.body.substring(0, 120));

  // 6. Update state.
  state.offset += size;
  state.day += 1;
  state.last_run = today;
  state.total_sent += size;
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  log('Progress: ' + state.offset + '/' + allEmails.length + ' (' + state.total_sent + ' sent)');
  return { success: true, sent: size, progress: state.offset + '/' + allEmails.length };
}

module.exports = { runWarmup };
