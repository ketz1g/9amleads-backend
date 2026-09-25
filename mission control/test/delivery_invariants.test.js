// Delivery invariants test - the safety net for "fix A breaks B".
//
// The delivery engine is a large monolith run once a day against live data, so a
// change can silently drop one of the hard-won guarantees. This suite locks the
// critical invariants in two ways:
//   1) behaviour tests for the extracted pure modules (address_premise, freshness);
//   2) structural guards that assert the server source still contains the exact
//      filters/gates that make the 9am promise hold. If someone removes one, this
//      test fails and the change can be caught before it reaches production.
//
// Run: node test/delivery_invariants.test.js   (exit code 1 on any failure)
const fs = require('fs');
const path = require('path');

let passed = 0, failed = 0;
function ok(name, cond, detail) {
  if (cond) { passed++; console.log('  \u2713 ' + name); }
  else { failed++; console.log('  \u2717 FAIL: ' + name + (detail ? ' :: ' + detail : '')); }
}

const ap = require('../address_premise.js');
const fr = require('../freshness.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'production_api_server.js'), 'utf8');
function has(s) { return SRC.indexOf(s) !== -1; }

console.log('\n=== Address premise gate ===');
ok('door number accepted', ap.hasUsablePremiseAddress('12 High Street, London', 'SW1A 1AA') === true);
ok('flat number accepted', ap.hasUsablePremiseAddress('Flat 2, Eaton Mansions', 'SW1W 8HF') === true);
ok('bare street rejected', ap.hasUsablePremiseAddress('Park Road', 'N11 2JD') === false);
ok('named building without number rejected', ap.hasUsablePremiseAddress('The Old Rectory', 'GU21 4PU') === false);
ok('tower block without flat number rejected', ap.hasUsablePremiseAddress('Landmark East Tower, 24 Marsh Wall', 'E14 9EG') === false);

console.log('\n=== Freshness floor ===');
ok('Monday floor = Friday 09:00 UK', fr.getFreshCutoffIso(new Date('2026-08-17T08:00:00Z').getTime()) === '2026-08-14T08:00:00.000Z');
ok('Wednesday floor = 48h', fr.getFreshCutoffIso(new Date('2026-08-19T08:00:00Z').getTime()) === new Date(new Date('2026-08-19T08:00:00Z').getTime() - 48 * 3600000).toISOString());

console.log('\n=== Delivery engine structural invariants ===');
ok('engine excludes internal/test/demo accounts in a real run',
  has('isInternalAccount(c) && !(testOnly && _isTest)'));
ok('engine keeps test.* only in test_only mode',
  has('if (testOnly && !_isTest) return false;'));
ok('reports use the same internal + entitlement filter',
  (SRC.split('!isInternalAccount(c) && isEntitledForDelivery(c)').length - 1) >= 3);
ok('EPC is resolved before Postcoder in the pool scan',
  has('EPC FIRST (FREE, local, in-memory)'));
ok('door numbers come from EPC (free) before the paid fallback',
  SRC.indexOf('EPC_INDEX.resolveFullAddress') !== -1 && has('enrichMovingLeadsPostcoder'));
ok('paid door-number top-up is gated on remaining Postcoder budget',
  has('shortBy > 0 && _pcBudgetNow > 0') && has('finalShort > 0 && _pcBudgetNow > 0'));
ok('delivery has a per-run deadline (not a shared global)',
  has('function _registerDeliveryDeadline') && has('function _releaseDeliveryDeadline'));
ok('pool scan stops at the per-run deadline',
  (SRC.split('_deliveryDeadline && Date.now() > _deliveryDeadline').length - 1) >= 3);
ok('over-delivery is auto-trimmed by the guarantee audit',
  has('over_trimmed = trimOverdeliveredLeads()') && has('function trimOverdeliveredLeads'));
ok('hard cap never exceeds the promised quota',
  has('custLeads.length > totalDailyLimit') && has('hard-capped'));
ok('exact-count fill cannot exceed the promise',
  has('FILL_CAP') || has('EXACT_COUNT_FILL_CAP'));

console.log('\n=== Exact-count (never over / never under) invariants ===');
// A single source of truth for the daily promise, matching the delivery engine
// (plan limit + multi-product sum + cap override). Every watchdog/preview/top-up
// path must use it, or "promised" disagrees and causes silent under-delivery or
// over-trimming.
ok('single-source daily quota helper exists',
  has('function getCustomerDailyQuota(c)'));
ok('quota helper honours the admin cap override',
  has('if (capOverride && capOverride > quota) quota = capOverride;'));
ok('quota helper sums multi-product entitlements',
  has('quota = Math.max(quota, sum)'));
ok('over-trim uses the shared quota (never trims a higher promise)',
  has('try { target = getCustomerDailyQuota(c); }'));
ok('completion watchdog uses the shared quota',
  has('typeof getCustomerDailyQuota === \'function\' ? getCustomerDailyQuota(c)'));
ok('delivery preview / readiness use the shared quota',
  has('var limit = getCustomerDailyQuota(cust) || 5;'));
ok('exact-count fill targets the REMAINING allowance',
  has('var finalShort = Math.max(0, totalNeeded - custLeads.length);'));
ok('fill-back targets the REMAINING allowance',
  has('if ((!alreadyEmailedToday || forceFull) && custLeads.length < totalNeeded)'));
ok('pre-email hard cap clamps to the REMAINING allowance',
  has('if (custLeads.length > totalNeeded)') && has('custLeads.slice(0, totalNeeded)'));
ok('diagnostic records the FINAL resolved quota (not undefined)',
  has('if (_deliverDiag[cust.email]) _deliverDiag[cust.email].totalDailyLimit = totalDailyLimit;'));
ok('cross-customer exclusivity sets update live within a run',
  has('LIVE GLOBAL EXCLUSIVITY') && has('globalDeliveredUrls[_mku] = true;'));
ok('dashboard address is synced from full address (door number shown)',
  has('DISPLAY SYNC (door-number fix)') && has('parsed.address = _faClean;'));
ok('expired-trial classification is entitlement-based (not plan label)',
  has('if (typeof trialExpiredUnpaid === \'function\') return trialExpiredUnpaid(c);'));
ok('daily digest counts only lead-owing customers (no expired-trial false shortfall)',
  has('REAL, LEAD-OWING customers only') && has('activeCusts.forEach(function(c) {'));
ok('daily digest ignores stale/pre-emptive readiness noise',
  has("if (!e || !e.at || e.kind === 'readiness') return false;"));
ok('Postcoder daily cap reported as self-imposed (not an error / credit balance)',
  has('self-imposed cap; EPC resolves the rest') && has('var pcLow = false;'));
ok('paying customers are flagged paid (never shown as expired trial)',
  has('const paid = !!(c.stripe_subscription_id') && has('paid: paid,'));
ok('successful subscription payments alert the founder (deduped)',
  has('Payment received: £') && has('_pdb.paid_invoice_alerts'));
ok('stripe subscription reconcile self-heals missed webhooks',
  has('async function reconcileStripeSubscriptions') && has('cleared_trial_ends') && has('/api/admin/reconcile-subscriptions'));
ok('morning readiness summary is digest-mode (silent when all ready)',
  has("all ' + rows.length + ' ready - no email (digest mode)"));
ok('early readiness + guarantee do not send duplicate pre-9am emails',
  has('(no email - digest mode)') && has('email handled by the 07:58 morning summary'));
ok('pre-9am rehearsal exists and is scheduled before 9am',
  has('function runDeliveryRehearsal') && has("runDeliveryRehearsal('07:45 schedule')"));
ok('test/internal accounts never get real emails',
  has('Skipped un-deliverable test address'));
ok('internal deliveries never block real customers',
  has('_internalCustIds'));

console.log('\n' + (failed === 0 ? 'ALL PASSED' : 'FAILURES: ' + failed) + '  (' + passed + ' passed, ' + failed + ' failed)');
process.exit(failed === 0 ? 0 : 1);
