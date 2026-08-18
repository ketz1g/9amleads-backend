// Tests for Moving Lead coverage config (Stages 17/29).
// Run: node test/moving_coverage_test.js

const cov = require('../moving_area_coverage.js');

let passed = 0, failed = 0;
function ok(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ FAIL: ' + name); } }

console.log('\n=== STAGE 17: Included area counts per plan ===');
ok('trial = 5', cov.includedAreaCount('free_trial') === 5);
ok('pro = 5 (default)', cov.includedAreaCount('pro') === 5);
ok('elite = 5 (default)', cov.includedAreaCount('elite') === 5);

console.log('\n=== STAGE 17/29: Coverage evaluation ===');
const cust = { id: 'A', plan: 'pro', moving_areas: ['HA','EN','SG','B','CM','WD'] };
const ev = cov.evaluateCoverage(cust);
ok('over-limit flagged (6 areas vs 5 included)', ev.overLimit === true);
ok('first 5 are included', ev.includedAreas.length === 5);
ok('6th area is not included', ev.includedAreas.indexOf('WD') === -1);
ok('areaType WD = none (no addon configured)', ev.areaType('WD') === 'none');
ok('areaType HA = included_area', ev.areaType('HA') === 'included_area');

// With addon areas.
const cust2 = { id: 'B', plan: 'elite', moving_areas: ['HA','EN','SG'], addon_areas: ['WD','AL','UB','CM'] };
const ev2 = cov.evaluateCoverage(cust2);
ok('addon area WD = addon_area', ev2.areaType('WD') === 'addon_area');
ok('included area EN = included_area', ev2.areaType('EN') === 'included_area');

console.log('\n=== STAGE 3/29: Whole-area match (no naive prefix) ===');
ok('B customer covers B', cov.customerCoversArea({ moving_areas:['B'] }, 'B') === true);
ok('B customer does NOT cover BT (no prefix)', cov.customerCoversArea({ moving_areas:['B'] }, 'BT') === false);
ok('N customer covers N', cov.customerCoversArea({ moving_areas:['N'] }, 'N') === true);
ok('N customer does NOT cover NE', cov.customerCoversArea({ moving_areas:['N'] }, 'NE') === false);
ok('normalizeArea(BT7) = BT', cov.normalizeArea('BT7 1AA') === 'BT');
ok('normalizeArea(B) = B', cov.normalizeArea('B') === 'B');

console.log('\n--- RESULT: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
