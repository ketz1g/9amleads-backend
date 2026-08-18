// Tests for the central Moving Lead demand + inventory engine (Stages 2-15).
// Run: node test/moving_engine_test.js

const assert = require('assert');
const e = require('../moving_lead_engine.js');

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓ ' + name); }
  else { failed++; console.log('  ✗ FAIL: ' + name); }
}

console.log('\n=== STAGE 2: Plan demand ===');
ok('free_trial = 5', e.getDailyMovingLeadRequirement({ plan: 'free_trial' }) === 5);
ok('trial = 5', e.getDailyMovingLeadRequirement({ plan: 'trial' }) === 5);
ok('pro = 10', e.getDailyMovingLeadRequirement({ plan: 'pro' }) === 10);
ok('elite = 15', e.getDailyMovingLeadRequirement({ plan: 'elite' }) === 15);
ok('cancelled = 0', e.getDailyMovingLeadRequirement({ plan: 'cancelled' }) === 0);
ok('paused = 0', e.getDailyMovingLeadRequirement({ plan: 'pro', paused: true }) === 0);
ok('expired trial = 0', e.getDailyMovingLeadRequirement({ plan: 'free_trial', trial_ended: '2026-01-01' }) === 0);
ok('remaining 5 - 2 delivered = 3', e.remainingRequirement({ plan: 'trial' }, 2) === 3);
ok('remaining 5 - 5 delivered = 0', e.remainingRequirement({ plan: 'trial' }, 5) === 0);
ok('unknown plan defaults to 5', e.getDailyMovingLeadRequirement({ plan: 'mystery' }) === 5);

console.log('\n=== STAGE 3: Area -> district expansion ===');
const ha = e.expandAreaToDistricts('HA');
ok('HA expands to HA0..HA9', Array.isArray(ha) && ha.length > 5 && ha.indexOf('HA1') !== -1 && ha.indexOf('HA9') !== -1);
const b = e.expandAreaToDistricts('B');
ok('B expands to B1..B98 (many)', Array.isArray(b) && b.length > 40 && b.indexOf('B1') !== -1);
const n = e.expandAreaToDistricts('N');
ok('N expands to N1..N22', n.indexOf('N1') !== -1 && n.indexOf('N22') !== -1);
ok('N does NOT contain NW', n.indexOf('NW') === -1);
const cm = e.expandAreaToDistricts('CM');
ok('CM expands to CM0..CM24', cm.indexOf('CM1') !== -1 && cm.indexOf('CM23') !== -1);
const en = e.expandAreaToDistricts('EN');
ok('EN expands to EN1..EN11', en.indexOf('EN1') !== -1 && en.indexOf('EN11') !== -1);

console.log('\n=== STAGE 4: Central demand registry (no duplicate demand) ===');
// Customer A: Elite (15) areas HA,EN,SG. Customer B: Pro (10) areas HA,WD,AL.
// Customer C: Trial (5) areas HA,EN,UB.
const custA = { id: 'A', plan: 'elite', moving_areas: ['HA','EN','SG'] };
const custB = { id: 'B', plan: 'pro', moving_areas: ['HA','WD','AL'] };
const custC = { id: 'C', plan: 'free_trial', moving_areas: ['HA','EN','UB'] };
const reg = e.buildDemandRegistry([custA, custB, custC], {});
// HA is covered by all 3 -> demand should be 15+10+5 = 30, and only ONE HA district set.
ok('HA area total demand = 30', reg.areaDemand['HA'] && reg.areaDemand['HA'].total_daily_demand === 30);
ok('HA has 3 eligible customers', reg.areaDemand['HA'].eligible_customers.length === 3);
ok('HA1 district demand aggregated = 30 (not 90)', reg.districtDemand['HA1'] && reg.districtDemand['HA1'].estimated_demand === 30);
ok('EN total demand = 20', reg.areaDemand['EN'] && reg.areaDemand['EN'].total_daily_demand === 20);
// Prove overlap does NOT create duplicate districts: only one HA1 entry.
const ha1Count = Object.keys(reg.districtDemand).filter(function(d){ return d === 'HA1'; }).length;
ok('HA1 appears exactly once', ha1Count === 1);

console.log('\n=== STAGE 10/12/14: District query planning (inventory check + early stop) ===');
// Inventory: HA1 has 12 PRIMARY + 5 FALLBACK = 17. No inventory elsewhere.
const inv = { HA1: { primary: 12, fallback: 5 } };
const reg2 = e.buildDemandRegistry([custA, custB, custC], inv);
const plan = e.planDistrictQueries(reg2, { HA1: 5, HA2: 3, WD1: 2 });
// HA1 demand 30 - inventory 17 = 13 deficit. Other districts have 0 inventory.
ok('shortfall > 0', plan.shortfall > 0);
ok('inventoryEnough=false when shortfall exists', plan.inventoryEnough === false);
ok('districtsToQuery includes HA1 (deficit)', plan.districtsToQuery.indexOf('HA1') !== -1);
// If inventory covers everything -> no queries.
const regFull = e.buildDemandRegistry([custA, custB, custC], { HA1:{primary:50}, HA2:{primary:30}, EN1:{primary:30}, SG1:{primary:20}, WD1:{primary:15}, AL1:{primary:15}, UB1:{primary:10} });
const planFull = e.planDistrictQueries(regFull, {});
ok('no queries when inventory sufficient', planFull.districtsToQuery.length === 0);
ok('inventoryEnough=true when covered', planFull.inventoryEnough === true);

console.log('\n=== STAGE 15: PRIMARY then FALLBACK allocation ===');
const alloc = e.allocatePrimaryThenFallback({ plan: 'elite' }, { PRIMARY: ['p1','p2','p3'], FALLBACK: ['f1','f2'] }, 5);
ok('uses 3 PRIMARY + 2 FALLBACK for need 5', alloc.chosen.length === 5 && alloc.primaryUsed === 3 && alloc.fallbackUsed === 2);
ok('all PRIMARY first, then FALLBACK', alloc.chosen[0]==='p1' && alloc.chosen[3]==='f1');
const allocAllPrimary = e.allocatePrimaryThenFallback({ plan: 'trial' }, { PRIMARY: ['p1','p2','p3','p4','p5','p6'], FALLBACK: ['f1','f2'] }, 5);
ok('uses 5 PRIMARY, 0 FALLBACK when enough PRIMARY', allocAllPrimary.primaryUsed === 5 && allocAllPrimary.fallbackUsed === 0);

console.log('\n=== STAGE 7: Freshness classification ===');
const now = new Date('2026-08-18T12:00:00Z').getTime();
ok('23h = PRIMARY', e.freshnessCategory(new Date(now - 23*3600000).toISOString(), now) === 'PRIMARY');
ok('24h00 = PRIMARY boundary (<=24)', e.freshnessCategory(new Date(now - 24*3600000).toISOString(), now) === 'PRIMARY');
ok('24h01 = FALLBACK', e.freshnessCategory(new Date(now - 24.02*3600000).toISOString(), now) === 'FALLBACK');
ok('47h59 = FALLBACK', e.freshnessCategory(new Date(now - 47.9*3600000).toISOString(), now) === 'FALLBACK');
ok('48h00 = FALLBACK boundary (<=48)', e.freshnessCategory(new Date(now - 48*3600000).toISOString(), now) === 'FALLBACK');
ok('48h01 = EXPIRED', e.freshnessCategory(new Date(now - 48.02*3600000).toISOString(), now) === 'EXPIRED');
ok('invalid date = EXPIRED', e.freshnessCategory('garbage', now) === 'EXPIRED');

console.log('\n--- RESULT: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
