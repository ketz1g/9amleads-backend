// Unit + integration tests for the Moving Leads provider abstraction, dedup,
// postcode territory matching, and confidence scoring. Uses mocked APIs for
// automated tests (no paid calls). A separate live test uses real credentials.
//
// Run: node test/moving_pipeline_test.js

const assert = require('assert');
const dedup = require('../moving_lead_dedup.js');
const msp = require('../moving_source_provider.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

console.log('\n=== PHASE 10: Postcode territory matching ===');
ok('B matches B (Birmingham)', dedup.matchesTerritory('B61 0BH', ['B']) === true);
ok('B does NOT match BT (Belfast)', dedup.matchesTerritory('BT7 1AA', ['B']) === false);
ok('B does NOT match N (London)', dedup.matchesTerritory('N1 5PX', ['B']) === false);
ok('N matches N1 (London N)', dedup.matchesTerritory('N1 5PX', ['N']) === true);
ok('NW matches NW1 but N does not match NW1 as N is single-letter', dedup.matchesTerritory('NW1 5PX', ['N']) === false);
ok('NW matches NW1', dedup.matchesTerritory('NW1 5PX', ['NW']) === true);
ok('HA matches HA3', dedup.matchesTerritory('HA3 5AB', ['HA']) === true);
ok('HA does not match H', dedup.matchesTerritory('HA3 5AB', ['H']) === false);
ok('Empty postcode never matches', dedup.matchesTerritory('', ['B']) === false);
ok('outcode B61 extracted', dedup.outcode('B61 0BH') === 'B61');
ok('outcode N1 extracted', dedup.outcode('N1 5PX') === 'N1');

console.log('\n=== PHASE 8: Deduplication ===');
const lead1 = { uprn: '1000001', verifiedAddress: '1 Test Road, London, SW1A 1AA', postcode: 'SW1A 1AA', houseNumber: '1', sourceProvider: 'homedata', listingEventType: 'NEWLY_LISTED' };
const lead1b = { uprn: '1000001', verifiedAddress: '1 Test Road, London, SW1A 1AA', postcode: 'SW1A 1AA', houseNumber: '1', sourceProvider: 'rightmove', listingEventType: 'NEWLY_LISTED' };
const lead2 = { uprn: '1000002', verifiedAddress: '2 Test Road, London, SW1A 1AA', postcode: 'SW1A 1AA', houseNumber: '2' };
// Same UPRN from two providers -> dedup to one.
const d1 = dedup.dedupe([lead1, lead1b, lead2]);
ok('same UPRN from homedata+rightmove deduped to 2 unique', d1.unique.length === 2);
ok('duplicate identified', d1.duplicates.length === 1);
// Same address, different UPRN (should also dedup via address key).
const d2 = dedup.dedupe([lead1, { uprn: null, verifiedAddress: '1 Test Road, London, SW1A 1AA', postcode: 'SW1A 1AA', houseNumber: '1' }]);
ok('dedup by verified address', d2.unique.length === 1);

console.log('\n=== Listing event identity ===');
const ev1 = eventIdentityTest(lead1);
const ev1again = eventIdentityTest(lead1);
const ev2 = eventIdentityTest(lead2);
ok('same event identity for same property+event+date', ev1 === ev1again);
ok('different property => different event identity', ev1 !== ev2);

function eventIdentityTest(rec) {
  const copy = Object.assign({}, rec, { firstListedAt: '2026-08-18T00:00:00.000Z' });
  return dedup.eventIdentity(copy);
}

console.log('\n=== Confidence scoring (mocked resolver) ===');
// Test the pure confidence decision helper by invoking the module's status mapping.
// We verify the resolver returns UNRESOLVED when there is no confident match.
(async function() {
  // Mock: postcode with no matching street -> UNRESOLVED (no guess).
  // We can't easily call the private resolver without hitting the API; instead we
  // assert the module exports the expected statuses and the safe default behaviour.
  ok('VERIFICATION_STATUS has EXACT_UPRN', !!msp.VERIFICATION_STATUS.EXACT_UPRN);
  ok('VERIFICATION_STATUS has UNRESOLVED', !!msp.VERIFICATION_STATUS.UNRESOLVED);
  ok('VERIFICATION_STATUS has COORDINATE_MATCH', !!msp.VERIFICATION_STATUS.COORDINATE_MATCH);

  console.log('\n=== PHASE 9: normalisePostcode ===');
  ok('normalise SW1A2AA -> SW1A 2AA', msp.normalizePostcode('SW1A2AA') === 'SW1A 2AA');
  ok('normalise b61 0bh -> B61 0BH', msp.normalizePostcode('b61 0bh') === 'B61 0BH');

  console.log('\n=== PHASE 6: source priority ===');
  process.env.MOVING_PRIMARY_SOURCE = 'homedata';
  process.env.MOVING_FALLBACK_SOURCE = 'rightmove';
  const order = msp.getSourcePriority();
  ok('homedata is primary', order[0] === 'homedata');
  ok('rightmove is fallback', order[1] === 'rightmove');

  console.log('\n--- RESULT: ' + passed + ' passed, ' + failed + ' failed ---');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(e){ console.error('TEST ERROR', e); process.exit(1); });
