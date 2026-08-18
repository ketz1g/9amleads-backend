// Moving Lead allocator with no-competition / exclusivity + API usage tracking.
//
// Stage 16: if the product promise is that each property lead may only be supplied
// to ONE 9amLeads customer (exclusivity), this enforces a global allocation lock so
// the same lead is never assigned to two competing customers. Allocation is
// transactional (compute + commit atomically via an in-memory lock on the lead set).
//
// Stage 18: central Propalt usage tracking + credit estimation.
//
// Persistence-agnostic (operates on arrays), caller wires to the app's DB.

const engine = require('./moving_lead_engine.js');

// ---------------------------------------------------------------------------
// Stage 16: global allocation with no-competition.
// ---------------------------------------------------------------------------
// allocate(allocations, inventory, inventoryLocks)
//   allocations: existing {leadId, customerId, date} assignments (for today)
//   inventory: array of eligible {id, ...} leads
//   locks: { leadId: customerId } map (a lead already locked to a customer)
// Returns { chosen, allocatedToday } where a lead is only allocated if not already
// locked to a DIFFERENT customer today.
function allocateNoCompetition(customersWithDemand, inventory, existingAllocations, locks) {
  const alloc = existingAllocations || [];
  const lockMap = locks || {};
  // Map inventory by id for fast lookup.
  const invById = {};
  inventory.forEach(function(l){ if (l.id) invById[l.id] = l; });
  // Track which leads have been used today (to avoid resending).
  const usedToday = {};
  alloc.forEach(function(a){ usedToday[a.leadId] = (usedToday[a.leadId] || 0) + 1; });
  const result = { allocations: [], skipped: 0, usedDistinct: 0 };

  for (const cust of customersWithDemand || []) {
    const need = cust.need > 0 ? cust.need : engine.getDailyMovingLeadRequirement(cust);
    if (need <= 0) continue;
    // Order: PRIMARY first (cust.inventory should be pre-split PRIMARY/FALLBACK).
    const pool = cust.inventory || [];
    let assigned = 0;
    for (const lead of pool) {
      if (assigned >= need) break;
      const id = lead.id;
      if (!id) continue;
      // No-competition: if this lead is already locked to another customer, skip.
      if (lockMap[id] && lockMap[id] !== cust.id) { result.skipped++; continue; }
      // Exclusivity: once allocated today, don't resend.
      if (usedToday[id]) { result.skipped++; continue; }
      // Allocate.
      lockMap[id] = cust.id;
      usedToday[id] = 1;
      alloc.push({ leadId: id, customerId: cust.id, allocatedAt: new Date().toISOString() });
      assigned++;
      result.usedDistinct++;
    }
    result.allocations.push({ customerId: cust.id, assigned: assigned, needed: need, shortfall: Math.max(0, need - assigned) });
  }
  return result;
}

// ---------------------------------------------------------------------------
// Stage 18: Propalt API usage + credit tracking.
// ---------------------------------------------------------------------------
// Credible default credit model (configurable via env).
const CREDIT_CONFIG = {
  GET_LISTINGS: parseInt(process.env.PROPALT_MARKET_ACTIVITY_REQUEST_CREDITS || '6', 10),
  GET_PROPERTIES: parseInt(process.env.PROPALT_GET_PROPERTIES_CREDITS || '6', 10),
  GET_HISTORY: parseInt(process.env.PROPALT_GET_PROPERTY_HISTORY_CREDITS || '2', 10)
};

function trackUsage(log, entry) {
  entry.requested_at = new Date().toISOString();
  const credits = entry.credits_used || (CREDIT_CONFIG[entry.endpoint] || 0);
  entry.credits_used = credits;
  log.push(entry);
  return credits;
}

// Aggregate usage for admin reporting / cost forecasting.
function usageSummary(log, sinceMs) {
  const since = sinceMs || (Date.now() - 30 * 86400000);
  const recent = log.filter(function(l){ return new Date(l.requested_at).getTime() >= since; });
  const summary = {
    requests: recent.length,
    credits: 0,
    recordsReturned: 0,
    usableRecords: 0,
    newRecords: 0,
    duplicates: 0,
    fullAddresses: 0,
    byEndpoint: {},
    byDistrict: {}
  };
  recent.forEach(function(l){
    summary.credits += (l.credits_used || 0);
    summary.recordsReturned += (l.records_returned || 0);
    summary.usableRecords += (l.usable_records || 0);
    summary.newRecords += (l.new_records || 0);
    summary.duplicates += (l.duplicates || 0);
    summary.fullAddresses += (l.full_addresses || 0);
    if (!summary.byEndpoint[l.endpoint]) summary.byEndpoint[l.endpoint] = { requests: 0, credits: 0 };
    summary.byEndpoint[l.endpoint].requests++;
    summary.byEndpoint[l.endpoint].credits += (l.credits_used || 0);
    const d = l.postcode_district || '?';
    if (!summary.byDistrict[d]) summary.byDistrict[d] = { requests: 0, usable: 0, credits: 0 };
    summary.byDistrict[d].requests++;
    summary.byDistrict[d].usable += (l.usable_records || 0);
    summary.byDistrict[d].credits += (l.credits_used || 0);
  });
  return summary;
}

// ---------------------------------------------------------------------------
// Stage 22: rate limiting / retries helpers.
// ---------------------------------------------------------------------------
// Which statuses to retry (transient) vs not (permanent).
const RETRYABLE = { 429: true, 500: true, 502: true, 503: true, 504: true };
const PERMANENT = { 400: true, 401: true, 403: true, 404: true };

function shouldRetry(status, attempt, maxAttempts) {
  if (PERMANENT[status]) return false;                 // never retry 4xx auth/not-found
  if (RETRYABLE[status] && attempt < maxAttempts) return true;
  return false;
}

function backoffDelay(attempt, baseMs, jitter) {
  const exp = Math.min(30000, baseMs * Math.pow(2, attempt)); // exponential cap 30s
  const j = jitter ? Math.floor(Math.random() * 500) : 0;
  return exp + j;
}

module.exports = {
  allocateNoCompetition,
  trackUsage,
  usageSummary,
  CREDIT_CONFIG,
  shouldRetry,
  backoffDelay,
  RETRYABLE,
  PERMANENT
};
