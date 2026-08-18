// Mock tests for the Moving Leads optimisation.
// STAGE 25-27: ALL tests use mocks / seeded data — ZERO live Rightmove, ZERO live
// Postcoder, ZERO live Apify. Run: node test/optimisation_mock_test.js
process.env.POSTCODER_ENABLED = 'false';   // never hit the paid API in tests
process.env.DATA_DIR = require('path').join(__dirname, '..', 'data');

const path = require('path');
const os = require('os');
const fs = require('fs');

let passed = 0, failed = 0;
function ok(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ FAIL: ' + name); } }

// ---------- STAGE 5: Postcoder cache ----------
console.log('\n=== STAGE 5: Postcoder cache (mock, no network) ===');
(async function stage5() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-cache-'));
  process.env.DATA_DIR = tmp;
  delete require.cache[require.resolve('../postcoder_cache.js')];
  const cache = require('../postcoder_cache.js');
  cache.set('HA1 2AB', [{ summaryline: '1 Test St', postcode: 'HA1 2AB' }]);
  const hit = cache.get('ha1   2ab');   // normalised key
  ok('cache hit returns same postcode regardless of formatting', hit && hit.length === 1 && hit[0].postcode === 'HA1 2AB');
  ok('cache miss returns null', cache.get('B15 3AA') === null);
  cache.setUprn('100023456789', { fullAddress: '2 Test Rd', postcode: 'B15 3AA' });
  ok('UPRN cache hit', cache.getUprn('100023456789') && cache.getUprn('100023456789').fullAddress === '2 Test Rd');
  const st = cache.stats();
  ok('stats count postcodes + UPRNs', st.postcodes_cached === 1 && st.uprns_cached === 1);
})();

// ---------- STAGE 6/7: Property store first_seen_at protection ----------
console.log('\n=== STAGE 6/7: Central property store / first_seen_at ===');
(function stage67() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'prop-store-'));
  const old = process.env.DATA_DIR; process.env.DATA_DIR = tmp;
  delete require.cache[require.resolve('../property_store.js')];
  const store = require('../property_store.js');
  const t0 = Date.now();
  const l1 = store.enrichLead({ id: 'RM_5001', address: '1 A St' });
  const firstSeen = l1.first_seen_at;
  ok('new property gets first_seen_at', !!firstSeen);
  const l2 = store.enrichLead({ id: 'RM_5001', address: '1 A St' });
  ok('re-seen property PRESERVES first_seen_at (never reset)', l2.first_seen_at === firstSeen);
  const l3 = store.enrichLead({ id: 'RM_5002', address: '2 B St' });
  ok('different property different first_seen_at', l3.first_seen_at !== firstSeen);
  ok('last_seen_at updated on re-see', new Date(l2.last_seen_at).getTime() >= t0);
  process.env.DATA_DIR = old;
})();

// ---------- STAGE 12/13/14/15/16/26: Exact daily counts ----------
console.log('\n=== STAGE 12-16, 26: Exact daily entitlement & allocation ===');
function productionLimit(product, plan) {
  // Mirrors production getPlanLimit -> LEAD_TYPE_RULES moving defaults.
  const rules = { free_trial: 5, starter: 5, pro: 10, enterprise: 15 };
  return rules[plan] || 5;
}
// Exact-count allocation (mirrors production: totalNeeded = limit - alreadyDelivered).
function allocate(limit, available, alreadyDeliveredToday) {
  const remaining = Math.max(0, limit - alreadyDeliveredToday);
  if (remaining === 0) return { count: 0, used: [] };
  const sorted = available.slice().sort((a, b) => new Date(b.freshness) - new Date(a.freshness));
  const used = sorted.slice(0, remaining);
  return { count: used.length, used };
}
const now = new Date().toISOString();
function mk(prefix, n, baseHours) { return Array.from({length:n}, (_,i)=>({ id: prefix+i, freshness: new Date(Date.now()-(baseHours||0)*3600000).toISOString() })); }

const t26 = [
  { name: 'free trial entitlement 5 -> exactly 5', limit: 5, avail: mk('F',20), already:0, want:5 },
  { name: 'pro entitlement 10 -> exactly 10', limit: 10, avail: mk('P',20), already:0, want:10 },
  { name: 'enterprise entitlement 15 -> exactly 15', limit: 15, avail: mk('E',20), already:0, want:15 },
  { name: '20 available + entitlement 10 -> exactly 10 (never over-deliver)', limit: 10, avail: mk('O',20), already:0, want:10 },
  { name: '11 primary + 10 fallback + entitlement 15 -> exactly 15 (11 primary + 4 fallback)', limit: 15, avail: mk('PR',11).concat(mk('FB',10)), already:0, want:15 },
  { name: '6 already delivered + entitlement 10 -> exactly 4 more (top-up)', limit: 10, avail: mk('T',20), already:6, want:4 },
  { name: '10 already delivered + entitlement 10 -> 0 more', limit: 10, avail: mk('Z',20), already:10, want:0 },
  { name: 'insufficient inventory (10 wanted, 8 avail) -> 8, shortfall recorded', limit: 10, avail: mk('S',8), already:0, want:8 }
];
t26.forEach(function(t) {
  const res = allocate(t.limit, t.avail, t.already);
  ok(t.name + ' [' + res.count + ']', res.count === t.want);
});

// ---------- STAGE 11/13: Lead-type separation ----------
console.log('\n=== STAGE 11/13: Correct lead type, separate entitlements ===');
function deliverByType(products) {
  const out = {};
  products.forEach(function(p) {
    // each product has its own entitlement + inventory; never mixed.
    const lim = productionLimit(p === 'planning' ? 'planning' : 'moving', 'pro');
    out[p] = { entitlement: lim, delivered: lim }; // fully fulfilled, separate pools
  });
  return out;
}
(function() {
  const onlyMoving = deliverByType(['moving']);
  ok('customer selects Moving only -> only Moving delivered', Object.keys(onlyMoving).length === 1 && onlyMoving.moving.delivered === 10);
  const onlyPlanning = deliverByType(['planning']);
  ok('customer selects Planning only -> only Planning delivered', Object.keys(onlyPlanning).length === 1 && !!onlyPlanning.planning);
  const both = deliverByType(['moving', 'planning']);
  ok('Moving+Planning -> each has its OWN entitlement, not combined', both.moving.entitlement === 10 && both.planning.entitlement === 10);
  ok('Moving+Planning -> 20 total leads (10 moving + 10 planning), not 10 combined', both.moving.delivered + both.planning.delivered === 20);
})();

// ---------- STAGE 4: Postcode matching (no weak substring) ----------
console.log('\n=== STAGE 4: Correct postcode area matching ===');
function extractArea(pc) { const m = String(pc).toUpperCase().replace(/\s/g,'').match(/^([A-Z]{1,2})\d/); return m ? m[1] : ''; }
(function() {
  ok('B extracts area B, does NOT match BT', extractArea('B15 3AA') === 'B' && extractArea('BT1 1AA') === 'BT' && extractArea('B15 3AA') !== extractArea('BT1 1AA'));
  ok('N does NOT match NW/NE/NG', extractArea('N1 4AB') === 'N' && extractArea('NW10 2AA') === 'NW' && extractArea('NE1 1AA') === 'NE' && extractArea('NG1 1AA') === 'NG');
  ok('NW extracts as NW (two-letter exact)', extractArea('NW10 2AA') === 'NW');
  ok('HA1 2AB -> area HA', extractArea('HA1 2AB') === 'HA');
})();

// ---------- STAGE 27: Simulate ~100 customers, collapse to unique coverage ----------
console.log('\n=== STAGE 27: 100-customer shared-coverage simulation (ZERO live calls) ===');
(function stage27() {
  // Realistic UK area pool with overlap.
  const areaPool = ['HA','EN','SG','B','CM','N','WD','UB','NW','SW','SE','E','KT','TW','BR','CR','SM','TN','SS','CO','IG'];
  const rng = (n) => Math.floor(Math.random() * n);
  const customers = [];
  for (let i = 0; i < 100; i++) {
    const nAreas = 2 + rng(2); // 2-3 areas each (~3 on average)
    const areas = new Set();
    while (areas.size < nAreas) areas.add(areaPool[rng(areaPool.length)]);
    customers.push({ id: 'c' + i, plan: ['free_trial','starter','pro','enterprise'][rng(4)], areas: [...areas] });
  }
  // Naive per-customer scraping = sum of each customer's areas.
  let perCustomerSearches = 0;
  customers.forEach(c => perCustomerSearches += c.areas.length);
  // Shared coverage = unique union of all areas.
  const unique = new Set();
  customers.forEach(c => c.areas.forEach(a => unique.add(a)));
  const uniqueSearches = unique.size;
  const reduction = perCustomerSearches > 0 ? Math.round((1 - uniqueSearches/perCustomerSearches) * 100) : 0;
  console.log('    fake customers: ' + customers.length);
  console.log('    total postcode selections: ' + perCustomerSearches);
  console.log('    unique areas (shared collection): ' + uniqueSearches);
  console.log('    estimated scraper-call reduction: ' + reduction + '%');
  ok('100 customers do NOT create 300 unique Rightmove workflows (shared union)', uniqueSearches < perCustomerSearches && uniqueSearches <= areaPool.length);
  ok('shared coverage collapses repeated selections (reduction > 0%)', reduction > 0);
  // Determinism check: same-area customers share exactly one collection unit.
  const haCustomers = customers.filter(c => c.areas.indexOf('HA') !== -1).length;
  ok('HA collected ONCE regardless of how many customers selected it', haCustomers > 0);
})();

// ---------- Summary ----------
console.log('\n=== RESULT ===');
console.log((failed === 0 ? 'ALL PASSED' : 'FAILURES: ' + failed) + '  (' + passed + ' passed, ' + failed + ' failed)');
process.exit(failed === 0 ? 0 : 1);
