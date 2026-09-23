// Freshness-floor tests: 48h normally; on Sat/Sun/Mon (UK) extends back to FRIDAY
// 09:00 UK (the last 9am delivery) so every listing published since then fills
// Monday's accounts. (Changed from Saturday 00:00 in commit 0f0d928.)
const fr = require('../freshness.js');

console.log('\n=== Freshness floor (Monday weekend grace vs 48h normal) ===');
let failures = 0;
function ck(name, cond) { console.log((cond ? '  \u2713 ' : '  \u2717 FAIL ') + name); if (!cond) failures++; }

// Monday 17 Aug 2026 09:00 BST = 08:00Z. Cutoff must be Fri 14 Aug 09:00 BST = 08:00Z.
const monMs = new Date('2026-08-17T08:00:00Z').getTime();
const monCut = fr.getFreshCutoffIso(monMs);
ck('Monday (summer) cutoff = Fri 09:00 BST', monCut === '2026-08-14T08:00:00.000Z', monCut);
ck('Monday keeps Sat 06:00 lead', '2026-08-15T05:00:00.000Z' >= monCut);
ck('Monday keeps Sun 06:00 lead', '2026-08-16T05:00:00.000Z' >= monCut);
ck('Monday keeps Fri 12:00 lead (after Fri 9am delivery)', '2026-08-14T11:00:00.000Z' >= monCut);
ck('Monday drops Fri 08:00 BST lead (before Fri 9am)', '2026-08-14T07:00:00.000Z' < monCut);

// Monday 5 Jan 2026 09:00 GMT = 09:00Z. Cutoff = Fri 2 Jan 09:00 GMT = 09:00Z.
const monWMs = new Date('2026-01-05T09:00:00Z').getTime();
ck('Monday (winter) cutoff = Fri 09:00 GMT', fr.getFreshCutoffIso(monWMs) === '2026-01-02T09:00:00.000Z');

// Non-Monday days stay at 48h.
const wedMs = new Date('2026-08-19T08:00:00Z').getTime();
ck('Wednesday cutoff = 48h', fr.getFreshCutoffIso(wedMs) === new Date(wedMs - 48 * 3600000).toISOString());
const sunMs = new Date('2026-08-16T08:00:00Z').getTime();
ck('Sunday cutoff = 48h', fr.getFreshCutoffIso(sunMs) === new Date(sunMs - 48 * 3600000).toISOString());
const satMs = new Date('2026-08-15T08:00:00Z').getTime();
ck('Saturday cutoff = 48h', fr.getFreshCutoffIso(satMs) === new Date(satMs - 48 * 3600000).toISOString());

console.log(failures === 0 ? '\nALL PASSED' : '\nFAILURES: ' + failures);
process.exit(failures === 0 ? 0 : 1);
