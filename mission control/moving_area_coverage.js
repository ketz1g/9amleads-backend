// Customer postcode AREA coverage configuration (Stage 17/29).
//
// Customers select whole postcode areas (e.g. HA, EN, SG, B, CM) — NOT districts.
// This module manages:
//   - how many included postcode areas each plan gets (configurable, not hard-coded)
//   - which areas are "included" vs future paid "add-on" areas
//   - future additional-area billing readiness (data model only, no billing yet)
//
// Config (env-driven so the business can change included-area counts later):
//   TRIAL_INCLUDED_AREAS=
//   PRO_INCLUDED_AREAS=
//   ELITE_INCLUDED_AREAS=

const CONFIG = {
  trialAreas: parseInt(process.env.TRIAL_INCLUDED_AREAS || '5', 10),
  proAreas: parseInt(process.env.PRO_INCLUDED_AREAS || '5', 10),
  eliteAreas: parseInt(process.env.ELITE_INCLUDED_AREAS || '5', 10),
  maxAddons: parseInt(process.env.MAX_AREA_ADDONS || '10', 10)
};

function includedAreaCount(plan) {
  const p = String(plan || 'starter').toLowerCase();
  if (p === 'elite') return CONFIG.eliteAreas;
  if (p === 'pro') return CONFIG.proAreas;
  return CONFIG.trialAreas;
}

// Validate a customer's selected areas against their plan's included count.
// Returns { valid, selectedAreas, includedAreas, addonAreas, includedCount, maxIncluded, overLimit, availableAddons }
function evaluateCoverage(customer) {
  const areas = (customer.moving_areas || customer.target_areas || customer.coverage_areas || []).filter(Boolean);
  const plan = customer.plan || 'starter';
  const maxIncluded = includedAreaCount(plan);
  // Distinguish included vs add-on: customer may pass separate addon_areas, or we
  // take the first N as included and the rest as potential add-ons.
  const addonAreas = (customer.addon_areas || customer.moving_area_addons || []).filter(Boolean);
  const primaryAreas = areas.slice(0, maxIncluded);
  const overLimit = areas.length > maxIncluded;
  return {
    valid: !overLimit || addonAreas.length > 0,
    selectedAreas: areas,
    includedAreas: primaryAreas,
    addonAreas: addonAreas,
    includedCount: primaryAreas.length,
    maxIncluded: maxIncluded,
    overLimit: overLimit,
    availableAddons: Math.max(0, CONFIG.maxAddons - addonAreas.length),
    areaType: function(area) {
      if (addonAreas.indexOf(area) !== -1) return 'addon_area';
      if (primaryAreas.indexOf(area) !== -1) return 'included_area';
      return 'none';
    }
  };
}

// Does the customer cover a given postcode AREA (whole-area match)?
function customerCoversArea(customer, area) {
  const want = String(area || '').toUpperCase().trim();
  if (!want) return false;
  const ev = evaluateCoverage(customer);
  return ev.includedAreas.indexOf(want) !== -1 || ev.addonAreas.indexOf(want) !== -1;
}

// Whole-area match only (not prefix) — B != BT, N != NE/NW.
function normalizeArea(area) {
  const a = String(area || '').toUpperCase().trim();
  const m = a.match(/^([A-Z]{1,2})/);
  return m ? m[1] : '';
}

module.exports = {
  CONFIG,
  includedAreaCount,
  evaluateCoverage,
  customerCoversArea,
  normalizeArea
};
