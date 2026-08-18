// Tests for the central property inventory (Stages 6, 8, 9).
// Run: node test/moving_inventory_test.js

const inv = require('../moving_property_inventory.js');

let passed = 0, failed = 0;
function ok(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ FAIL: ' + name); } }

console.log('\n=== STAGE 8: Address quality ===');
const h = inv.canonicalAddress({ house_number: '25', street: 'Station Road', town: 'Harrow', postcode: 'HA1 1AA' });
ok('numbered house = FULL', h.addressQuality === 'FULL');
ok('numbered house address', h.fullAddress === '25 Station Road, Harrow, HA1 1AA');

const f = inv.canonicalAddress({ flat_number: 'Flat 7', house_number: '25', street: 'Station Road', town: 'Harrow', postcode: 'HA1 1AA' });
ok('flat = FULL', f.addressQuality === 'FULL');
ok('flat address', f.fullAddress.indexOf('Flat 7') === 0 && f.fullAddress.indexOf('25 Station Road') !== -1);

const named = inv.canonicalAddress({ building_name: 'Rose Cottage', street: 'High Street', town: 'Harrow', postcode: 'HA1 1AA' });
ok('named house = FULL (no numeric number but legitimate)', named.addressQuality === 'FULL');
ok('named address has Rose Cottage', named.fullAddress.indexOf('Rose Cottage') !== -1);

const noNum = inv.canonicalAddress({ street: 'Station Road', postcode: 'HA1 1AA' });
ok('street+pc no number = NO_NUMBER', noNum.addressQuality === 'NO_NUMBER');

const noStreet = inv.canonicalAddress({ town: 'London', postcode: 'SW1A 1AA' });
ok('missing street = PARTIAL', noStreet.addressQuality === 'PARTIAL');

const invalid = inv.canonicalAddress({});
ok('empty = INVALID', invalid.addressQuality === 'INVALID');

const badPc = inv.canonicalAddress({ street: 'X Road', postcode: 'not-a-pc' });
ok('bad postcode = PARTIAL', badPc.addressQuality === 'PARTIAL');

console.log('\n=== STAGE 9: UPRN + dedup ===');
// Same property from Propalt and Rightmove (same UPRN) -> ONE inventory record.
const p1 = { uprn: '100001', sourceProvider: 'propalt', sourceEventId: 'L1', listingEventType: 'NEW_LISTING', house_number: '1', street: 'Test Road', town: 'London', postcode: 'SW1A 1AA', firstListedAt: new Date().toISOString(), price: 500000 };
const r1 = { uprn: '100001', sourceProvider: 'rightmove', sourceEventId: 'RM1', listingEventType: 'NEW_LISTING', house_number: '1', street: 'Test Road', town: 'London', postcode: 'SW1A 1AA', firstListedAt: new Date().toISOString(), price: 500000 };
const invA = [];
const res1 = inv.ingest([p1, r1], invA, []);
ok('same UPRN from 2 providers -> 1 inserted, 1 updated', res1.inserted.length === 1 && res1.updated.length === 1 && invA.length === 1);

// Different flats must NOT merge (same house number, different flat).
const flat1 = inv.canonicalAddress({ flat_number: 'Flat 1', house_number: '10', street: 'Block Road', postcode: 'N1 1AA' });
const flat2 = inv.canonicalAddress({ flat_number: 'Flat 2', house_number: '10', street: 'Block Road', postcode: 'N1 1AA' });
ok('flat 1 and flat 2 have different canonical address', flat1.fullAddress !== flat2.fullAddress);

// Same event twice -> only one event logged.
const rec = { uprn: '200002', sourceEventId: 'E1', listingEventType: 'NEW_LISTING', house_number: '2', street: 'Same Road', postcode: 'NW1 1AA', firstListedAt: '2026-08-18T10:00:00Z' };
const invB = [];
const evLog = [];
inv.ingest([rec, Object.assign({}, rec, { sourceEventId: 'E1' })], invB, evLog);
ok('duplicate event not re-logged', evLog.filter(function(e){ return e.event_key === inv.eventKey(invB[0].id, 'NEW_LISTING', '2026-08-18T10:00:00Z'); }).length === 1);

console.log('\n=== STAGE 6: canonical record fields ===');
const canon = inv.toInventoryRecord({ uprn: '300003', sourceProvider: 'propalt', house_number: '7', street: 'Canon Road', postcode: 'HA1 1ZZ', listingEventType: 'NEW_LISTING' });
ok('record has uprn', canon.uprn === '300003');
ok('record has postcodeDistrict HA1', canon.postcodeDistrict === 'HA1');
ok('record has postcodeArea HA', canon.postcodeArea === 'HA');
ok('record id keyed by UPRN', canon.id === 'UPRN_300003');

console.log('\n--- RESULT: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
