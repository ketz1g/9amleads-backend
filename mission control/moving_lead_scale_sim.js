// Moving Lead scale + cost simulation (Stages 19, 26, 27).
//
// Proves the central-demand architecture keeps Propalt cost SUB-LINEAR in customer
// count: overlapping coverage + central inventory + district prioritisation + early
// stop mean we query districts, not customers.
//
// Uses mocks/statistical data - NO real Propalt API calls.
//
// Run: node moving_lead_scale_sim.js

const e = require('./moving_lead_engine.js');

// Propalt credit model (configurable; current observed pricing).
const CREDITS = {
  GET_LISTINGS: parseInt(process.env.PROPALT_MARKET_ACTIVITY_REQUEST_CREDITS || '6', 10),
  GET_PROPERTIES: parseInt(process.env.PROPALT_GET_PROPERTIES_CREDITS || '6', 10)
};

// Whole-UK postcode area pool (subset of common ones) for generating coverage.
const AREA_POOL = ['HA','EN','SG','B','CM','N','NW','SW','SE','E','W','WD','AL','UB','TW','KT','CR','BR','RM','IG','SM','DA','ME','TN','CT','RH','BN','GU','RG','SL','LU','MK','HP','CO','SS','CM','CB','PE','NR','IP','OX','SO','PO','BA','BS','TA','EX','TQ','PL','TR','GL','LE','LS','M','L','S','HD','WF','BD','YO','HU','DN','NE','SR','TS','DL','EH','G','KY','DD','AB','IV','CF','NP','SA','LL','BT'];

// Approximate districts per area (yield varies). Real map is in the provider.
function districtsFor(area) {
  return e.expandAreaToDistricts(area);
}
// Approximate daily PRIMARY yield per district (0-24h listings). Real data would
// come from Stage 11/28 yield tracking; here we use a plausible statistical model.
function yieldForDistrict(district, seed) {
  const hash = (String(district) + seed).split('').reduce(function(a,c){ return a + c.charCodeAt(0); }, 0);
  // 0.5 to 8 PRIMARY/day depending on area size/density.
  return 0.5 + (hash % 75) / 10;
}

// Simulate a customer base with overlapping whole-area coverage.
function generateCustomers(n, areasPerCustomer, seed) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const plan = (i % 5 === 0) ? 'elite' : (i % 3 === 0) ? 'pro' : 'free_trial';
    const areas = [];
    // Overlap: bias toward a common hot set to simulate many customers in the same areas.
    const start = (i * 3) % AREA_POOL.length;
    for (let a = 0; a < areasPerCustomer; a++) {
      const idx = (start + a) % AREA_POOL.length;
      if (areas.indexOf(AREA_POOL[idx]) === -1) areas.push(AREA_POOL[idx]);
    }
    out.push({ id: 'C' + i, plan: plan, moving_areas: areas });
  }
  return out;
}

function simulate(n, areasPerCustomer) {
  const customers = generateCustomers(n, areasPerCustomer);
  // Build demand registry (uses only the districts for the selected areas).
  const reg = e.buildDemandRegistry(customers, {});
  const districts = Object.keys(reg.districtDemand);
  const uniqueAreas = Object.keys(reg.areaDemand);

  // Daily lead demand.
  let totalDemand = 0;
  customers.forEach(function(c){ totalDemand += e.getDailyMovingLeadRequirement(c); });

  // Simulate collection: query each district ONCE (central), collect its yield,
  // dedupe across customers, then allocate.
  // We model credits as: one get-listings call per district queried.
  let districtsQueried = 0, apiPages = 0, credits = 0, collected = 0, fullAddress = 0, uprn = 0, primary = 0, fallback = 0;
  const inventory = {}; // district -> {primary, fallback}
  let shortfall = totalDemand;
  for (const d of districts) {
    if (shortfall <= 0) break; // EARLY STOP
    districtsQueried++;
    apiPages += 1; // assume 1 page yields enough
    credits += CREDITS.GET_LISTINGS;
    const y = yieldForDistrict(d, n + areasPerCustomer);
    const p = Math.round(y);            // PRIMARY count
    const fb = Math.round(y * 0.4);     // FALLBACK count
    inventory[d] = { primary: p, fallback: fb };
    collected += p + fb;
    primary += p; fallback += fb;
    fullAddress += Math.round((p + fb) * 0.9);   // ~90% full addresses
    uprn += Math.round((p + fb) * 0.88);         // ~88% UPRN
    shortfall -= (p + fb);
  }

  // Estimate fulfilment: can we cover each customer's PRIMARY need from inventory?
  // (Conservative: assume district inventory is shared and sufficient.)
  const primaryCapacity = primary;
  const fallbackCapacity = fallback;
  const fulfilledPrimary = Math.min(totalDemand, primaryCapacity);
  const fulfilledFallback = Math.min(totalDemand - fulfilledPrimary, fallbackCapacity);
  const fulfilled = fulfilledPrimary + fulfilledFallback;
  const unfulfilled = Math.max(0, totalDemand - fulfilled);

  const costGBP = credits * 0; // pricing handled in report; credits reported here

  return {
    customers: n,
    dailyLeadDemand: totalDemand,
    areaSelections: customers.reduce(function(a,c){ return a + c.moving_areas.length; }, 0),
    uniqueAreas: uniqueAreas.length,
    expandedDistricts: districts.length,
    districtsQueried: districtsQueried,
    apiPages: apiPages,
    dailyCredits: credits,
    monthlyCreditsEstimate: credits * 30,
    inventoryCollected: collected,
    primaryInventory: primary,
    fallbackInventory: fallback,
    fullAddressPercent: collected ? Math.round(fullAddress / collected * 100) : 0,
    uprnPercent: collected ? Math.round(uprn / collected * 100) : 0,
    fulfilledPrimary: fulfilledPrimary,
    fulfilledFallback: fulfilledFallback,
    unfulfilled: unfulfilled,
    fulfilmentPercent: totalDemand ? Math.round(fulfilled / totalDemand * 100) : 100
  };
}

// ---- Report ----
function report() {
  console.log('=== MOVING LEAD SCALE SIMULATION (mocked, no live Propalt) ===\n');
  const scenarios = [
    [10, 3], [10, 5], [50, 3], [50, 5], [100, 3], [100, 5], [500, 3], [500, 5], [1000, 3], [1000, 5]
  ];
  console.log('customers | areas | uniqAreas | districts | queried | pages | dailyCredits | monthlyCredits | demand | fulfilled | unfulfilled | fulfil%');
  scenarios.forEach(function(sc) {
    const r = simulate(sc[0], sc[1]);
    console.log(String(r.customers).padEnd(9) + ' | ' + String(r.areaSelections).padEnd(5) + ' | ' + String(r.uniqueAreas).padEnd(10)
      + ' | ' + String(r.expandedDistricts).padEnd(10) + ' | ' + String(r.districtsQueried).padEnd(8)
      + ' | ' + String(r.apiPages).padEnd(6) + ' | ' + String(r.dailyCredits).padEnd(12)
      + ' | ' + String(r.monthlyCreditsEstimate).padEnd(16) + ' | ' + String(r.dailyLeadDemand).padEnd(7)
      + ' | ' + String(r.fulfilledPrimary + r.fulfilledFallback).padEnd(10) + ' | ' + String(r.unfulfilled).padEnd(11)
      + ' | ' + r.fulfilmentPercent + '%');
  });
}

report();
