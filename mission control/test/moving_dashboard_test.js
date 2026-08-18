// Tests for Moving Lead dashboard shaping (Stages 30/31).
// Run: node test/moving_dashboard_test.js

const d = require('../moving_dashboard.js');

let passed = 0, failed = 0;
function ok(name, cond) { if (cond) { passed++; console.log('  ✓ ' + name); } else { failed++; console.log('  ✗ FAIL: ' + name); } }

console.log('\n=== STAGE 30: Customer dashboard view (safe fields only) ===');
const rec = {
  id: 'UPRN_1', verifiedAddress: 'Flat 7, 25 Station Road, Harrow, HA1 1AA', street: 'Station Road',
  town: 'Harrow', postcode: 'HA1 1AA', propertyType: 'flat', bedrooms: 2, askingPrice: 525000,
  estateAgent: 'X', firstListedAt: new Date(Date.now()-6*3600000).toISOString(), ageHours: 6,
  addressVerificationStatus: 'EXACT_ADDRESS'
};
const v = d.customerLeadView(rec);
ok('shows full address', v.fullAddress.indexOf('Flat 7') === 0);
ok('shows bedrooms', v.bedrooms === 2);
ok('shows price', v.askingPrice === 525000);
ok('isFresh true (6h)', v.isFresh === true);
ok('addressVerified true', v.addressVerified === true);
// SECURITY: no provider, no credentials, no costs, no raw payload.
const json = JSON.stringify(v);
ok('does NOT expose provider name', json.indexOf('propalt') === -1);
ok('does NOT expose raw source data', json.indexOf('rawSourceData') === -1);
ok('does NOT expose API key', json.indexOf('api_key') === -1 && json.indexOf('PROPALT') === -1);

console.log('\n=== STAGE 30: Customer summary ===');
const sum = d.customerDashboardSummary([v, d.customerLeadView(Object.assign({}, rec, { ageHours: 30, isFresh: false }))]);
ok('summary total 2', sum.total === 2);
ok('summary primary 1', sum.primary === 1);

console.log('\n=== STAGE 31: Admin operations view ===');
const inv = [
  { id:'A', uprn:'1', postcodeDistrict:'HA1', addressQuality:'FULL', verifiedAddress:'1 X Rd HA1 1AA', firstListedAt:new Date().toISOString(), sourceProvider:'propalt' },
  { id:'B', uprn:'2', postcodeDistrict:'EN1', addressQuality:'FULL', verifiedAddress:'2 Y Rd EN1 1BB', firstListedAt:new Date(Date.now()-30*3600000).toISOString(), sourceProvider:'propalt' }
];
const usage = [
  { endpoint:'GET_LISTINGS', postcode_district:'HA1', credits_used:6 },
  { endpoint:'GET_LISTINGS', postcode_district:'EN1', credits_used:6 }
];
const admin = d.adminOpsView({ customers:[{id:'A'}], inventory:inv, usageLog:usage, demand:{total_daily_demand:15}, coverage:{uniqueAreas:2, expandedDistricts:12}, config:{monthlyCreditLimit:1000, shadowMode:true} });
ok('admin shows inventory total', admin.inventory.total === 2);
ok('admin shows PRIMARY inventory', admin.inventory.PRIMARY >= 1);
ok('admin shows Propalt calls', admin.propalt.callsToday === 2);
ok('admin shows credits', admin.propalt.creditsToday === 12);
ok('admin shows districts queried', admin.coverage.districtsQueriedToday === 2);
ok('admin shows fullAddress%', admin.inventory.fullAddressPercent === 100);
ok('admin shows shadow mode', admin.config.shadowMode === true);

console.log('\n--- RESULT: ' + passed + ' passed, ' + failed + ' failed ---');
process.exit(failed > 0 ? 1 : 0);
