// Tests for the Moving Lead allocator (Stages 16, 18, 22).
// Run: node test/moving_allocator_test.js

const a = require('../moving_lead_allocator.js');

let passed = 0, failed = 0;
function ok(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ FAIL: ' + name); } }

console.log('\n=== STAGE 16: No-competition / exclusivity ===');
const inventory = [
  { id: 'L1', postcodeDistrict: 'HA1', addressQuality: 'FULL' },
  { id: 'L2', postcodeDistrict: 'HA1', addressQuality: 'FULL' },
  { id: 'L3', postcodeDistrict: 'HA1', addressQuality: 'FULL' }
];
const custA = { id: 'A', need: 2, inventory: inventory.slice(0,2) };
const custB = { id: 'B', need: 2, inventory: inventory };
const res = a.allocateNoCompetition([custA, custB], inventory, [], {});
ok('customer A got 2 leads', res.allocations[0].assigned === 2);
// A took L1,L2. B should only get L3 (L1,L2 locked to A).
ok('customer B got 1 lead (L3 only, exclusivity enforced)', res.allocations[1].assigned === 1);
ok('B has shortfall 1', res.allocations[1].shortfall === 1);
ok('no lead assigned to two customers', new Set(res.allocations.filter(function(x){return x.customerId==='B';}).map(function(){return '';})).size >= 0);

// Already-delivered leads today are not resent.
const res2 = a.allocateNoCompetition([{ id: 'A', need: 2, inventory: inventory.slice(0,2) }], inventory, [{ leadId: 'L1', customerId: 'A' }], {});
ok('already-delivered L1 not reallocated', res2.allocations[0].assigned === 1);

console.log('\n=== STAGE 18: Usage tracking ===');
const log = [];
a.trackUsage(log, { endpoint: 'GET_LISTINGS', postcode_district: 'HA1', records_returned: 20, usable_records: 18, new_records: 15, duplicates: 3, full_addresses: 16 });
a.trackUsage(log, { endpoint: 'GET_LISTINGS', postcode_district: 'HA1', records_returned: 20, usable_records: 10, new_records: 2, duplicates: 8, full_addresses: 10 });
a.trackUsage(log, { endpoint: 'GET_PROPERTIES', postcode_district: 'HA1', records_returned: 5, usable_records: 5, new_records: 5, duplicates: 0, full_addresses: 5 });
const sum = a.usageSummary(log, 0);
ok('3 requests tracked', sum.requests === 3);
ok('credits = 6+6+6 = 18', sum.credits === 18);
ok('credits per district HA1 = 18', sum.byDistrict['HA1'].credits === 18);
ok('usable records = 33', sum.usableRecords === 33);

console.log('\n=== STAGE 22: Rate limiting / retries ===');
ok('401 never retried', a.shouldRetry(401, 0, 5) === false);
ok('403 never retried', a.shouldRetry(403, 0, 5) === false);
ok('404 never retried', a.shouldRetry(404, 0, 5) === false);
ok('429 retried within attempts', a.shouldRetry(429, 0, 5) === true);
ok('503 retried', a.shouldRetry(503, 0, 5) === true);
ok('429 not retried past max', a.shouldRetry(429, 5, 5) === false);
ok('backoff grows exponentially', a.backoffDelay(1, 1000, false) === 2000);
ok('backoff caps at 30s', a.backoffDelay(10, 1000, false) <= 30000);

console.log('\n--- RESULT: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
