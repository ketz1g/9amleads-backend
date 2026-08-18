// Central Moving Lead demand + inventory engine.
//
// The core redesign goal: keep Propalt API costs LOW while reliably fulfilling
// customer daily lead allocations at scale (10 -> 1000+ customers). We never
// query Propalt per-customer. Instead:
//
//   ALL CUSTOMER DEMAND
//     -> WHOLE POSTCODE AREA COVERAGE
//     -> EXPAND TO DISTRICTS
//     -> CHECK CENTRAL INVENTORY
//     -> QUERY ONLY DISTRICTS WE NEED (ranked by yield)
//     -> STORE CENTRALLY
//     -> STOP WHEN DEMAND SATISFIED
//     -> ALLOCATE (PRIMARY then FALLBACK)
//     -> DELIVER AT 9AM
//
// This module is pure (no network) so it can be unit-tested and used by both the
// collector (to decide what to query) and the allocator (to assign to customers).
//
// Plan daily allowances (single source of truth, not hard-coded in many places).
const PLAN_DAILY = {
  free_trial: 5,
  trial: 5,
  pro: 10,
  elite: 15,
  starter: 5,
  essential: 5
};

// Freshness categories.
const FRESH = {
  PRIMARY: 'PRIMARY',   // 0-24h
  FALLBACK: 'FALLBACK', // 24-48h
  EXPIRED: 'EXPIRED'    // >48h
};

// ---------------------------------------------------------------------------
// Stage 2: plan demand
// ---------------------------------------------------------------------------
function getDailyMovingLeadRequirement(customer) {
  if (!customer) return 0;
  // Inactive / cancelled / expired trial / paused accounts need 0.
  if (customer.plan === 'cancelled') return 0;
  if (customer.paused) return 0;
  if (customer.plan === 'free_trial' || customer.plan === 'trial') {
    if (customer.trial_ended && Date.now() > new Date(customer.trial_ended).getTime()) return 0; // expired
  }
  const plan = (customer.plan || 'starter').toLowerCase();
  return PLAN_DAILY[plan] || PLAN_DAILY.starter || 5;
}

// Demand already fulfilled today (leads delivered to this customer today).
function remainingRequirement(customer, deliveredToday) {
  return Math.max(0, getDailyMovingLeadRequirement(customer) - (deliveredToday || 0));
}

// ---------------------------------------------------------------------------
// Stage 3: whole postcode AREA -> districts. Reuse the outward-code map from
// moving_lead_dedup / moving_source_provider (UK_OUTWARD_CODES). Here we expose
// a clean function and validate no naive prefix collisions.
// ---------------------------------------------------------------------------
function expandAreaToDistricts(area) {
  try {
    const msp = require('./moving_source_provider.js');
    // reuse the Propalt provider's outward-code expansion (area -> [B1, B2, ...])
    const list = msp.expandAreaToOutcodes ? msp.expandAreaToOutcodes(area) : [];
    return list;
  } catch (e) {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Stage 4: central demand registry.
// Build a per-district demand structure from all customers' area coverage.
// Ensures overlapping coverage does NOT create duplicate demand (one district =
// one aggregate demand regardless of how many customers cover it).
// ---------------------------------------------------------------------------
function buildDemandRegistry(customers, inventoryByIdDistrict) {
  const areaDemand = {};      // area -> {area, eligible_customers[], total_daily_demand, unfulfilled}
  const districtDemand = {};  // district -> {district, parent_area, eligible_customers[], estimated_demand, inventory_available, ...}
  const seenDistricts = {};   // district -> true (dedup across customers)

  for (const c of customers || []) {
    const req = getDailyMovingLeadRequirement(c);
    if (req <= 0) continue;
    const areas = (c.moving_areas || c.target_areas || c.coverage_areas || []).filter(Boolean);
    for (const areaRaw of areas) {
      const area = String(areaRaw).toUpperCase().trim();
      if (!area) continue;
      if (!areaDemand[area]) areaDemand[area] = { area, eligible_customers: [], total_daily_demand: 0, unfulfilled_daily_demand: 0, active: true };
      if (areaDemand[area].eligible_customers.indexOf(c.id || c.email) === -1) areaDemand[area].eligible_customers.push(c.id || c.email);
      areaDemand[area].total_daily_demand += req;
      // Expand to districts (only once per area via seenDistricts to avoid dup work).
      if (!seenDistricts[area]) {
        seenDistricts[area] = true;
        const districts = expandAreaToDistricts(area);
        for (const d of districts) {
          if (!districtDemand[d]) districtDemand[d] = {
            district: d, parent_area: area, eligible_customers: [], estimated_demand: 0,
            inventory_available: 0, last_collected_at: null, historical_yield: 0, priority_score: 0
          };
        }
      }
      // Aggregate customer demand onto each district of this area.
      const districts = expandAreaToDistricts(area);
      for (const d of districts) {
        if (!districtDemand[d]) districtDemand[d] = { district: d, parent_area: area, eligible_customers: [], estimated_demand: 0, inventory_available: 0, last_collected_at: null, historical_yield: 0, priority_score: 0 };
        if (districtDemand[d].eligible_customers.indexOf(c.id || c.email) === -1) districtDemand[d].eligible_customers.push(c.id || c.email);
        districtDemand[d].estimated_demand += req;
      }
    }
  }

  // Inventory available per district (from the central inventory).
  const invByD = inventoryByIdDistrict || {};
  Object.keys(districtDemand).forEach(function(d) {
    const inv = invByD[d];
    if (inv) {
      districtDemand[d].inventory_available = (inv.primary || 0) + (inv.fallback || 0);
      districtDemand[d].inventory_primary = inv.primary || 0;
      districtDemand[d].inventory_fallback = inv.fallback || 0;
    }
  });
  // Unfulfilled = total demand - inventory available (floor at 0).
  Object.keys(areaDemand).forEach(function(a) {
    const related = Object.keys(districtDemand).filter(function(d) { return districtDemand[d].parent_area === a; });
    let inv = 0;
    related.forEach(function(d) { inv += (districtDemand[d].inventory_available || 0); });
    areaDemand[a].unfulfilled_daily_demand = Math.max(0, areaDemand[a].total_daily_demand - inv);
  });

  return { areaDemand, districtDemand };
}

// ---------------------------------------------------------------------------
// Stage 10/12/14: decide which districts to query, ranked by yield, stopping
// when enough inventory exists. Returns an ordered list of districts to query
// and the shortfall they must fill.
// ---------------------------------------------------------------------------
function planDistrictQueries(demandRegistry, yieldByDistrict, opts) {
  opts = opts || {};
  const maxDistricts = opts.maxDistricts || 200;
  const targetFill = opts.targetFill || 0.0; // 0 = fill full demand
  const { areaDemand, districtDemand } = demandRegistry;
  const result = { districtsToQuery: [], shortfall: 0, inventoryEnough: true };

  // Aggregate all unfulfilled demand.
  let totalUnfulfilled = 0;
  Object.keys(areaDemand).forEach(function(a) { totalUnfulfilled += areaDemand[a].unfulfilled_daily_demand || 0; });
  result.shortfall = totalUnfulfilled;
  if (totalUnfulfilled <= 0) return result; // inventory already sufficient -> no API calls

  // Rank districts: by yield (high first) then estimated demand.
  const ranked = Object.keys(districtDemand).map(function(d) {
    const dd = districtDemand[d];
    const y = (yieldByDistrict && yieldByDistrict[d]) || 0;
    const priority = (dd.estimated_demand || 0) * (1 + y); // demand-weighted by yield
    return { district: d, demand: dd.estimated_demand || 0, inventory: dd.inventory_available || 0, yield: y, priority: priority };
  }).sort(function(a, b) { return b.priority - a.priority; });

  // Walk high-priority districts, only querying those whose inventory can't cover
  // their own demand, until total unfulfilled is covered.
  let need = totalUnfulfilled;
  const toQuery = [];
  for (const r of ranked) {
    if (toQuery.length >= maxDistricts) break;
    const deficit = Math.max(0, r.demand - r.inventory);
    if (deficit > 0) {
      toQuery.push(r.district);
      need -= deficit; // assume one query yields enough to cover this district
      if (need <= 0) break; // EARLY STOP: enough districts queued to cover demand
    }
  }
  result.districtsToQuery = toQuery;
  result.inventoryEnough = toQuery.length === 0;
  return result;
}

// ---------------------------------------------------------------------------
// Stage 15: allocate to a customer - PRIMARY (0-24h) first, FALLBACK (24-48h) only
// if insufficient PRIMARY. Returns the selected lead ids.
// ---------------------------------------------------------------------------
function allocatePrimaryThenFallback(customer, inventoryByFreshness, need) {
  const primary = (inventoryByFreshness && inventoryByFreshness.PRIMARY) || [];
  const fallback = (inventoryByFreshness && inventoryByFreshness.FALLBACK) || [];
  const chosen = [];
  // PRIMARY first.
  for (const p of primary) { if (chosen.length >= need) break; chosen.push(p); }
  // FALLBACK only to fill the remainder.
  if (chosen.length < need) {
    for (const f of fallback) { if (chosen.length >= need) break; chosen.push(f); }
  }
  return { chosen, primaryUsed: chosen.filter(function(l){ return primary.indexOf(l) !== -1; }).length, fallbackUsed: chosen.length - chosen.filter(function(l){ return primary.indexOf(l) !== -1; }).length };
}

// ---------------------------------------------------------------------------
// Stage 7: freshness classification from the SOURCE listing timestamp.
// ---------------------------------------------------------------------------
function freshnessCategory(firstListedAt, nowMs) {
  const t = new Date(firstListedAt).getTime();
  if (isNaN(t)) return FRESH.EXPIRED;
  const hours = (nowMs - t) / 3600000;
  if (hours <= 24) return FRESH.PRIMARY;
  if (hours <= 48) return FRESH.FALLBACK;
  return FRESH.EXPIRED;
}

module.exports = {
  PLAN_DAILY,
  FRESH,
  getDailyMovingLeadRequirement,
  remainingRequirement,
  expandAreaToDistricts,
  buildDemandRegistry,
  planDistrictQueries,
  allocatePrimaryThenFallback,
  freshnessCategory
};
