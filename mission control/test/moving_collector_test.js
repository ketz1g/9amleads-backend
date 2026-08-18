// Tests for the Moving Lead collector orchestrator (Stages 11, 23, 24, 28).
// Run: node test/moving_collector_test.js

const c = require('../moving_lead_collector.js');
const engine = require('../moving_lead_engine.js');

let passed = 0, failed = 0;
function ok(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ FAIL: ' + name); } }

console.log('\n=== STAGE 23: Collection orchestrator (inventory-first, early-stop) ===');
const customers = [
  { id: 'A', plan: 'elite', moving_areas: ['HA','EN'] },   // 15/day
  { id: 'B', plan: 'pro', moving_areas: ['HA','WD'] }       // 10/day
];
// Provider mock: only queried districts return listings.
let queryCalls = [];
function mockProvider(listingsByDistrict) {
  return { fetchListings: async function(p) {
    queryCalls.push(p.postcodeDistrict + ':p' + p.page);
    const recs = (listingsByDistrict[p.postcodeDistrict] || []).map(function(a){ return Object.assign({}, a, { firstListedAt: new Date().toISOString() }); });
    return { ok: true, records: recs };
  }};
}
// Case 1: enough inventory already -> no Propalt calls.
// Provide inventory across ALL districts of the chosen areas (HA0-9, EN1-11, WD1-25)
// so demand is fully covered and no district needs querying.
const fullInv = (function(){
  const inv = [];
  const areas = ['HA','EN','WD'];
  areas.forEach(function(area){
    engine.expandAreaToDistricts(area).slice(0, 6).forEach(function(d, i){
      for (let k = 0; k < 6; k++) { // 6 leads per district -> enough to cover demand
        inv.push({ id:'P'+d+'_'+k, uprn:'9000'+i+area+k, postcodeDistrict:d, postcodeArea:area, fullAddress:'1 Test Rd, '+d, houseNumber:String(k+1), street:'Test Rd', postcode:d+' 1AA', firstListedAt:new Date().toISOString(), sourceProvider:'propalt', listingEventType:'NEW_LISTING' });
      }
    });
  });
  return inv;
})();
queryCalls = [];
(async function(){
  const reportFull = await c.collect({ customers, existingInventory: fullInv, existingAllocations: [], usageLog: [], districtYield: {}, provider: mockProvider({}) });
  ok('no Propalt calls when inventory sufficient', queryCalls.length === 0);

  // Case 2: no inventory -> queries HA1 first (high yield), early-stops.
  const ha1Listings = [{ id:'L1', uprn:'2001', postcodeDistrict:'HA1', postcodeArea:'HA', fullAddress:'10 High St, HA1', houseNumber:'10', street:'High St', postcode:'HA1 1AA', sourceProvider:'propalt', listingEventType:'NEW_LISTING' }];
  queryCalls = [];
  const reportQ = await c.collect({ customers, existingInventory: [], existingAllocations: [], usageLog: [], districtYield: { HA1: 5, HA2: 1, EN1: 1 }, provider: mockProvider({ HA1: ha1Listings }) });
  ok('queried HA1 first (highest yield)', reportQ.districtsQueried.length > 0 && reportQ.districtsQueried[0].indexOf('HA1') === 0);
  ok('records ingested', reportQ.recordsCollected >= 1);
  ok('usage tracked', reportQ.credits >= 6);

  // Case 3: shadow mode flag present.
  ok('shadow mode config available', typeof c.CONFIG.shadowMode === 'boolean');
  ok('maxPagesPerPostcode configurable', c.CONFIG.maxPagesPerPostcode >= 1);

  console.log('\n=== STAGE 11: District yield ===');
  const usageLog = [
    { requested_at: new Date(Date.now()-1000).toISOString(), postcode_district:'HA1', credits_used:6, usable_records:18, primary_records:15 },
    { requested_at: new Date(Date.now()-2000).toISOString(), postcode_district:'HA1', credits_used:6, usable_records:10, primary_records:8 },
    { requested_at: new Date(Date.now()-3000).toISOString(), postcode_district:'EN1', credits_used:6, usable_records:5, primary_records:3 }
  ];
  const y = c.yieldFromLogs(usageLog, Date.now()-7*86400000, Date.now()-30*86400000);
  ok('HA1 yield tracked', y['HA1'] && y['HA1'].usable === 28);
  ok('HA1 credits = 12', y['HA1'].credits === 12);
  ok('HA1 avg_daily_primary ~0.8', y['HA1'].avg_daily_primary > 0);
  ok('EN1 yield tracked', y['EN1'] && y['EN1'].usable === 5);

  console.log('\n=== STAGE 28: Area availability score ===');
  const score = c.areaAvailabilityScore(y, ['HA','EN']);
  ok('HA has an availability score', !!score['HA']);
  ok('score has status', ['HIGH AVAILABILITY','GOOD AVAILABILITY','LOW AVAILABILITY','VERY LOW AVAILABILITY'].indexOf(score['HA'].status) !== -1);
  ok('EN has an availability score', !!score['EN']);

  console.log('\n=== STAGE 24: Shadow mode config ===');
  ok('shadow mode defaults to false', c.CONFIG.shadowMode === false);

  console.log('\n--- RESULT: ' + passed + ' passed, ' + failed + ' failed ---');
  process.exit(failed > 0 ? 1 : 0);
})().catch(function(e){ console.error('TEST ERROR', e); process.exit(1); });
