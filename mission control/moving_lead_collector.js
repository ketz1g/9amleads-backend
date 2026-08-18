// Moving Lead collection orchestrator (Stage 23) + district yield tracking
// (Stage 11/28) + shadow mode (Stage 24).
//
// Orchestrates the cost-aware collection:
//   1. Build central demand from all customers (whole postcode areas).
//   2. Expand to districts, rank by yield, check existing inventory.
//   3. Query Propalt ONLY for the districts whose inventory is insufficient
//      (early-stop when demand is satisfied).
//   4. Ingest results into the central property inventory (UPRN dedup).
//   5. Track per-district yield + API usage for future prioritisation + admin.
//
// This is DECOUPLED from the 9am delivery scheduler — delivery never calls Propalt.
// The collector runs earlier (configurable time) so data is ready before 9am.
//
// Shadow mode (MOVING_LEADS_SHADOW_MODE=true): collect + store + measure but do NOT
// deliver to customers; Rightmove keeps serving production leads meanwhile.

const engine = require('./moving_lead_engine.js');
const inventoryMod = require('./moving_property_inventory.js');
const allocatorMod = require('./moving_lead_allocator.js');

const CONFIG = {
  shadowMode: String(process.env.MOVING_LEADS_SHADOW_MODE || 'false').toLowerCase() === 'true',
  testMode: String(process.env.MOVING_LEADS_TEST_MODE || 'false').toLowerCase() === 'true',
  primaryProvider: process.env.MOVING_PRIMARY_PROVIDER || 'propalt',
  fallbackProvider: process.env.MOVING_FALLBACK_PROVIDER || 'rightmove',
  maxPagesPerPostcode: parseInt(process.env.MAX_PAGES_PER_POSTCODE || '2', 10),
  maxDistrictsPerRun: parseInt(process.env.MAX_PROPALT_DISTRICTS_PER_RUN || '40', 10),
  maxConcurrency: parseInt(process.env.MAX_PROPALT_CONCURRENCY || '2', 10),
  // Cost protection.
  monthlyCreditLimit: parseInt(process.env.PROPALT_MONTHLY_CREDIT_LIMIT || '0', 10),
  warningPercent: parseInt(process.env.PROPALT_MONTHLY_CREDIT_WARNING_PERCENT || '80', 10)
};

// District yield store: district -> {listings_found_7d, listings_found_30d, usable,
// primary, avg_daily_primary, credits_spent, credits_per_usable, last_successful_at}
function yieldFromLogs(usageLog, since7d, since30d) {
  const yieldByDistrict = {};
  (usageLog || []).forEach(function(l) {
    const d = l.postcode_district || '?';
    const t = new Date(l.requested_at).getTime();
    if (!yieldByDistrict[d]) yieldByDistrict[d] = { listings_7d: 0, listings_30d: 0, usable: 0, primary: 0, credits: 0, requests: 0, last_successful_at: l.requested_at };
    const y = yieldByDistrict[d];
    y.requests++;
    y.credits += (l.credits_used || 0);
    y.usable += (l.usable_records || 0);
    y.primary += (l.primary_records || 0);
    if (t >= since7d) y.listings_7d += (l.usable_records || 0);
    if (t >= since30d) y.listings_30d += (l.usable_records || 0);
    if (l.requested_at > y.last_successful_at) y.last_successful_at = l.requested_at;
  });
  // Derive avg_daily_primary (30d) + credits_per_usable.
  Object.keys(yieldByDistrict).forEach(function(d) {
    const y = yieldByDistrict[d];
    y.avg_daily_primary = Math.round(y.listings_30d / 30 * 10) / 10;
    y.credits_per_usable = y.usable ? Math.round(y.credits / y.usable * 100) / 100 : 0;
  });
  return yieldByDistrict;
}

// Area availability score (Stage 28) from yield.
function areaAvailabilityScore(yieldByDistrict, areas) {
  const out = {};
  for (const area of areas || []) {
    const districts = engine.expandAreaToDistricts(area);
    let primary = 0, fullAddr = 0, uprn = 0, credits = 0;
    districts.forEach(function(d) {
      const y = yieldByDistrict[d];
      if (y) {
        primary += y.avg_daily_primary || 0;
        credits += y.credits_per_usable || 0;
      }
    });
    const avgDaily = Math.round(primary * 10) / 10;
    let status = 'VERY LOW AVAILABILITY';
    if (avgDaily >= 20) status = 'HIGH AVAILABILITY';
    else if (avgDaily >= 10) status = 'GOOD AVAILABILITY';
    else if (avgDaily >= 3) status = 'LOW AVAILABILITY';
    out[area] = { avg_daily_primary: avgDaily, credits_per_usable: Math.round(credits * 100) / 100, status: status };
  }
  return out;
}

// Main collection pass. Returns a report. Pure-ish (takes injected deps).
async function collect({
  customers,
  existingInventory,
  existingAllocations,
  usageLog,
  districtYield,
  provider            // fetchListings(params) -> {ok, records}
}) {
  const report = {
    shadowMode: CONFIG.shadowMode,
    demand: 0,
    areaSelections: 0,
    uniqueAreas: 0,
    expandedDistricts: 0,
    districtsQueried: [],
    pages: 0,
    credits: 0,
    recordsCollected: 0,
    inserted: 0,
    updated: 0,
    primary: 0,
    fallback: 0,
    shortfallAfter: 0
  };
  const inv = existingInventory || [];
  const usage = usageLog || [];
  const yieldMap = districtYield || {};

  // 1) Central demand.
  const demand = engine.buildDemandRegistry(customers, inventoryByDistrict(inv));
  report.demand = Object.keys(demand.areaDemand).reduce(function(s,a){ return s + (demand.areaDemand[a].total_daily_demand||0); }, 0);
  report.areaSelections = customers.reduce(function(s,c){ return s + (c.moving_areas||[]).length; }, 0);
  report.uniqueAreas = Object.keys(demand.areaDemand).length;
  report.expandedDistricts = Object.keys(demand.districtDemand).length;

  // 2) Decide which districts to query (inventory-check + yield-ranked + early-stop).
  const plan = engine.planDistrictQueries(demand, yieldMap, { maxDistricts: CONFIG.maxDistrictsPerRun });
  report.shortfallAfter = plan.shortfall;

  // 3) Query only needed districts (demand-aware, early-stop).
  const districtsToQuery = plan.districtsToQuery;
  for (const district of districtsToQuery) {
    // Cost protection: stop if monthly credit limit reached.
    if (CONFIG.monthlyCreditLimit && report.credits >= CONFIG.monthlyCreditLimit) { report.costHalted = true; break; }
    let page = 0;
    while (page < CONFIG.maxPagesPerPostcode) {
      const res = await provider.fetchListings({ postcodeDistrict: district, page: page, limit: 20 });
      if (!res.ok) { report.districtsQueried.push(district + ' (err)'); break; }
      report.pages++;
      report.districtsQueried.push(district + ':p' + page);
      // Ingest (dedup by UPRN) into central inventory.
      const ingested = inventoryMod.ingest(res.records || [], inv, []);
      report.recordsCollected += (res.records||[]).length;
      report.inserted += ingested.inserted.length;
      report.updated += ingested.updated.length;
      // Track usage.
      allocatorMod.trackUsage(usage, {
        endpoint: 'GET_LISTINGS', postcode_district: district, page_number: page,
        records_returned: (res.records||[]).length, usable_records: ingested.inserted.length,
        new_records: ingested.inserted.length, duplicates: ingested.updated.length,
        primary_records: (res.records||[]).filter(function(r){ return inventoryMod.freshnessCat(r.firstListedAt, Date.now())==='PRIMARY'; }).length,
        full_addresses: (res.records||[]).filter(function(r){ return inventoryMod.toInventoryRecord(r).addressQuality==='FULL'; }).length
      });
      report.credits += allocatorMod.CREDIT_CONFIG.GET_LISTINGS;
      // EARLY STOP if enough inventory now.
      if (report.shortfallAfter <= 0) { report.earlyStopped = true; break; }
      page++;
      if (!res.records || res.records.length < 20) break; // no more pages
    }
    if (report.earlyStopped) break;
  }

  // 4) Primary/fallback counts from inventory (freshness).
  const fresh = inventoryMod.eligibleInventory(inv, Object.keys(demand.districtDemand), Date.now());
  report.primary = fresh.PRIMARY.length;
  report.fallback = fresh.FALLBACK.length;
  report.freshness = {
    PRIMARY: fresh.PRIMARY.length,
    FALLBACK: fresh.FALLBACK.length,
    EXPIRED: inv.filter(function(r){ return inventoryMod.freshnessCat(r.firstListedAt, Date.now())==='EXPIRED'; }).length
  };
  return report;
}

function inventoryByDistrict(inv) {
  const out = {};
  for (const r of inv || []) {
    const d = r.postcodeDistrict || '?';
    if (!out[d]) out[d] = { primary: 0, fallback: 0 };
    const cat = inventoryMod.freshnessCat(r.firstListedAt, Date.now());
    if (cat === 'PRIMARY') out[d].primary++;
    else if (cat === 'FALLBACK') out[d].fallback++;
  }
  return out;
}

module.exports = {
  collect,
  yieldFromLogs,
  areaAvailabilityScore,
  inventoryByDistrict,
  CONFIG
};
