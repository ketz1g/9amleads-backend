// BACKFILL SENT-LEADS DOOR NUMBERS
//
// Backfills door numbers (via the shared Postcoder/PAF pipeline) ONLY on leads
// that were actually DELIVERED to a customer and still lack a house number, so
// Postcoder credits are never spent on un-shown pool leads.
//
// Behaviour:
//   - Reads the live customer list from the admin stats endpoint.
//   - Keeps only moving + probate customers (the door-number products).
//   - Before each customer, checks Postcoder budget via system-status; stops
//     early if we're at/near the daily budget so we never exceed it.
//   - Calls /api/admin/postcoder/enrich-customer-leads with sent_only:true and a
//     per-customer max, pausing between customers to respect the 50/5min IP cap.
//
// Usage:
//   node backfill_sent_leads.js            # run against the live site
//   node backfill_sent_leads.js --dry      # preview without sending
//
// Env:
//   ADMIN_PASSWORD (required)  URL defaults to https://9amleads.com
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BACKFILL_URL || 'https://9amleads.com';
const ADMIN = process.env.ADMIN_PASSWORD || loadEnv('ADMIN_PASSWORD');
const PRODUCTS = ['moving', 'probate'];
const MAX_PER_CUSTOMER = parseInt(process.env.MAX_PER_CUSTOMER || '30', 10);
const DRY = process.argv.indexOf('--dry') !== -1;
// Stop before spending if the day is this close to the budget.
const BUDGET_SAFETY_MARGIN = parseInt(process.env.BUDGET_SAFETY_MARGIN || '10', 10);
const PAUSE_MS = parseInt(process.env.PAUSE_MS || '3500', 10);

function loadEnv(key) {
  // Check the repo .env first, then the user home dir (where this project keeps
  // its live secrets on dev machines).
  for (const dir of [__dirname, process.env.HOME || '', process.env.USERPROFILE || '']) {
    try {
      const raw = fs.readFileSync(path.join(dir, '.env'), 'utf8');
      const m = raw.match(new RegExp('^' + key + '\\s*=\\s*(.*)$', 'm'));
      if (m && m[1]) return m[1].replace(/\r$/, '').trim();
    } catch (e) { /* try next */ }
  }
  return '';
}

function api(method, p, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(BASE);
    const data = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': 'Bearer ' + ADMIN,
      'Accept': 'application/json'
    };
    if (data) headers['Content-Type'] = 'application/json';
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = https.request({ hostname: u.hostname, port: u.port || 443, path: p, method, headers }, (res) => {
      let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', reject);
    req.setTimeout(120000, () => { req.destroy(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}

async function getStatus() {
  const r = await api('GET', '/api/admin/system-status');
  if (r.status !== 200) throw new Error('system-status HTTP ' + r.status + ': ' + r.body.substring(0, 200));
  return JSON.parse(r.body);
}

async function getCustomers() {
  const r = await api('GET', '/api/admin/stats');
  if (r.status !== 200) throw new Error('stats HTTP ' + r.status + ': ' + r.body.substring(0, 200));
  const j = JSON.parse(r.body);
  const list = Array.isArray(j.by_product) ? j.by_product
    : Array.isArray(j.byProduct) ? j.byProduct
    : Array.isArray(j.customers) ? j.customers : [];
  if (list.length === 0) throw new Error('No customer list found in /api/admin/stats (checked by_product/byProduct/customers)');
  return list;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

(async () => {
  if (!ADMIN) { console.error('ADMIN_PASSWORD is required (set env or .env)'); process.exit(1); }

  const status = await getStatus();
  const budget = (status.postcoder && status.postcoder.daily_budget) || 0;
  const used = (status.postcoder && status.postcoder.used_today) || 0;
  const enabled = status.postcoder && status.postcoder.enabled;
  console.log('Postcoder enabled:', enabled, '| used_today:', used, '| daily_budget:', budget);
  if (!enabled) { console.log('Postcoder not enabled on server — nothing to do.'); return; }
  if (used >= budget) { console.log('Daily budget already exhausted (' + used + '/' + budget + '). Re-run after midnight UK.'); return; }

  const customers = await getCustomers();
  const targets = customers.filter((c) => PRODUCTS.indexOf(c.product) !== -1);
  console.log('Customers found:', customers.length, '| moving+probate targets:', targets.length, '| mode:', DRY ? 'DRY-RUN' : 'LIVE');

  let enrichedTotal = 0, doorlessTotal = 0, skipped = 0;
  for (const c of targets) {
    const s2 = await getStatus();
    const used2 = (s2.postcoder && s2.postcoder.used_today) || 0;
    const budget2 = (s2.postcoder && s2.postcoder.daily_budget) || 0;
    if (used2 + BUDGET_SAFETY_MARGIN >= budget2) {
      console.log('Stopping early: budget nearly spent (' + used2 + '/' + budget2 + '). Remaining customers skipped: ' + (targets.length - skipped));
      break;
    }
    skipped++;
    console.log('--- ' + c.email + ' (' + c.product + ') ---');
    if (DRY) { console.log('  [dry] would enrich sent-only doorless leads, max=' + MAX_PER_CUSTOMER); continue; }
    const r = await api('POST', '/api/admin/postcoder/enrich-customer-leads', {
      email: c.email, max: MAX_PER_CUSTOMER, sent_only: true
    });
    let out = {};
    try { out = JSON.parse(r.body); } catch (e) { out = { raw: r.body.substring(0, 200) }; }
    if (r.status !== 200) {
      console.log('  ERROR HTTP ' + r.status + ': ' + r.body.substring(0, 200));
    } else {
      console.log('  checked=' + (out.checked ?? '?') + ' doorless=' + (out.doorless ?? '?') + ' enriched=' + (out.enriched ?? '?'));
      enrichedTotal += (out.enriched || 0);
      doorlessTotal += (out.doorless || 0);
    }
    await sleep(PAUSE_MS);
  }
  console.log('\nDONE. doorless seen: ' + doorlessTotal + ' | newly enriched: ' + enrichedTotal);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
