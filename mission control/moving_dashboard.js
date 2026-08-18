// Moving Lead dashboard data shaping (Stages 30/31).
//
// Pure functions that shape inventory + usage + demand into safe display objects.
// Security: the CUSTOMER view must NEVER expose provider names, API credentials,
// raw payloads, API costs, or credit data. The ADMIN view surfaces operational
// metrics (demand, districts, inventory, Propalt usage, credits).

const inventoryMod = require('./moving_property_inventory.js');

// ---------------------------------------------------------------------------
// STAGE 30: Customer dashboard view.
// ---------------------------------------------------------------------------
function customerLeadView(record) {
  if (!record) return null;
  return {
    id: record.id || '',
    fullAddress: record.verifiedAddress || record.fullAddress || '',
    street: record.street || '',
    town: record.town || '',
    postcode: record.postcode || '',
    propertyType: record.propertyType || record.property_type || '',
    bedrooms: record.bedrooms || record.num_beds || 0,
    askingPrice: record.askingPrice || record.price || 0,
    estateAgent: record.estateAgent || record.brand_name || '',
    listed: record.firstListedAt || null,
    ageHours: record.ageHours || 0,
    // Trust indicators (safe, generic - no internal scoring shown).
    isFresh: record.ageHours != null ? record.ageHours <= 24 : false,
    hasFullAddress: (record.verifiedAddress || record.fullAddress) ? true : false,
    addressVerified: !!record.addressVerificationStatus && record.addressVerificationStatus !== 'UNRESOLVED'
  };
}

// Customer dashboard summary (aggregate).
function customerDashboardSummary(customerLeads) {
  return {
    total: (customerLeads || []).length,
    primary: (customerLeads || []).filter(function(l){ return l.isFresh; }).length,
    freshLeads: (customerLeads || []).filter(function(l){ return l.isFresh; }).length,
    fullAddressLeads: (customerLeads || []).filter(function(l){ return l.hasFullAddress; }).length,
    verifiedLeads: (customerLeads || []).filter(function(l){ return l.addressVerified; }).length
  };
}

// ---------------------------------------------------------------------------
// STAGE 31: Admin operations view.
// ---------------------------------------------------------------------------
// Build the full admin dashboard payload from raw internal data.
function adminOpsView({ customers, inventory, usageLog, demand, coverage, config }) {
  const inv = inventory || [];
  const usage = usageLog || [];
  const fresh = inventoryMod.eligibleInventory(inv, null, Date.now()); // all districts

  // Inventory quality stats.
  let fullAddr = 0, uprn = 0;
  inv.forEach(function(r){ if (r.addressQuality === 'FULL' || r.verifiedAddress) fullAddr++; if (r.uprn) uprn++; });

  // Usage + cost.
  let propaltCalls = 0, credits = 0;
  usage.forEach(function(u){ if (u.endpoint === 'GET_LISTINGS' || u.endpoint === 'GET_PROPERTIES') propaltCalls++; credits += (u.credits_used || 0); });

  // Districts touched.
  const districtsTouched = {};
  usage.forEach(function(u){ if (u.postcode_district) districtsTouched[u.postcode_district] = true; });

  return {
    customers: {
      active: (customers || []).length,
      dailyDemand: demand ? demand.total_daily_demand || 0 : 0,
      selectedAreas: (coverage && coverage.uniqueAreas) || 0
    },
    coverage: {
      uniqueAreas: (coverage && coverage.uniqueAreas) || 0,
      expandedDistricts: (coverage && coverage.expandedDistricts) || 0,
      districtsQueriedToday: Object.keys(districtsTouched).length
    },
    inventory: {
      total: inv.length,
      PRIMARY: fresh.PRIMARY.length,
      FALLBACK: fresh.FALLBACK.length,
      fullAddressPercent: inv.length ? Math.round(fullAddr / inv.length * 100) : 0,
      uprnPercent: inv.length ? Math.round(uprn / inv.length * 100) : 0
    },
    propalt: {
      callsToday: propaltCalls,
      creditsToday: credits,
      monthlyProjectedCredits: credits * 30,
      fullAddressPercent: inv.length ? Math.round(fullAddr / inv.length * 100) : 0,
      uprnPercent: inv.length ? Math.round(uprn / inv.length * 100) : 0
    },
    config: {
      monthlyCreditLimit: (config && config.monthlyCreditLimit) || 0,
      warningPercent: (config && config.warningPercent) || 80,
      shadowMode: !!(config && config.shadowMode)
    }
  };
}

module.exports = {
  customerLeadView,
  customerDashboardSummary,
  adminOpsView
};
