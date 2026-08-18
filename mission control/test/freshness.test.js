// Freshness-floor tests: 48h normally; on Mondays (UK) extends to Saturday 00:00
// so weekend-scraped leads still fill Monday's accounts.
const fr = require('../freshness.js');

console.log('\n=== Freshness floor (Monday weekend grace vs 48h normal) ===');
let failures = 0;
function ck(name, cond) { console.log((cond ? '  \u2713 ' : '  \u2717 FAIL ') + name); if (!cond) failures++; }

// Monday 17 Aug 2026 09:00 BST = 08:00Z. Cutoff must be Sat 15 Aug 00:00 BST = Fri 14 Aug 23:00Z.
const monMs = new Date('2026-08-17T08:00:00Z').getTime();
const monCut = fr.getFreshCutoffIso(monMs);
ck('Monday (summer) cutoff = Sat 00:00 BST', monCut === '2026-08-14T23:00:00.000Z', monCut);
ck('Monday keeps Sat 06:00 lead', '2026-08-15T05:00:00.000Z' >= monCut);
ck('Monday keeps Sun 06:00 lead', '2026-08-16T05:00:00.000Z' >= monCut);
ck('Monday drops Fri 12:00 lead', '2026-08-14T11:00:00.000Z' < monCut);

// Monday 5 Jan 2026 09:00 GMT = 09:00Z. Cutoff = Sat 3 Jan 00:00 GMT = 00:00Z.
const monWMs = new Date('2026-01-05T09:00:00Z').getTime();
ck('Monday (winter) cutoff = Sat 00:00 GMT', fr.getFreshCutoffIso(monWMs) === '2026-01-03T00:00:00.000Z');

// Non-Monday days stay at 48h.
const wedMs = new Date('2026-08-19T08:00:00Z').getTime();
ck('Wednesday cutoff = 48h', fr.getFreshCutoffIso(wedMs) === new Date(wedMs - 48 * 3600000).toISOString());
const sunMs = new Date('2026-08-16T08:00:00Z').getTime();
ck('Sunday cutoff = 48h', fr.getFreshCutoffIso(sunMs) === new Date(sunMs - 48 * 3600000).toISOString());
const satMs = new Date('2026-08-15T08:00:00Z').getTime();
ck('Saturday cutoff = 48h', fr.getFreshCutoffIso(satMs) === new Date(satMs - 48 * 3600000).toISOString());

console.log(failures === 0 ? '\nALL PASSED' : '\nFAILURES: ' + failures);
process.exit(failures === 0 ? 0 : 1);
