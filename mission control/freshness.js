// Shared freshness-floor logic for the "fresh leads" promise.
//
// Normally the freshness floor is 48h. On MONDAYS (UK time) it extends back to
// Saturday 00:00 so leads scraped over the weekend (Saturday + Sunday) still
// fill Monday's accounts — keeping the exact daily-count promise even after two
// non-delivery days (Sat/Sun have no 9am run).

// UK offset from UTC in minutes at a given timestamp (Intl handles BST/GMT).
function ukOffsetMin(ts) {
  var tzName = 'GMT';
  try {
    tzName = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', timeZoneName: 'longOffset' }).formatToParts(new Date(ts)).find(function(p){ return p.type === 'timeZoneName'; }).value;
  } catch(e) {}
  var m = /GMT([+-])(\d{1,2})(?::(\d{2}))?/.exec(tzName);
  if (!m) return 0;
  var mins = parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0);
  return m[1] === '-' ? -mins : mins;
}

function getFreshCutoffIso(nowMs) {
  nowMs = nowMs || Date.now();
  try {
    var offMin = ukOffsetMin(nowMs);
    // Timestamp whose UTC clock-read equals the UK wall clock.
    var ukMs = nowMs + offMin * 60000;
    var ukD = new Date(ukMs);
    if (ukD.getUTCDay() === 1) { // Monday in UK
      var sat = new Date(ukMs);
      sat.setUTCDate(sat.getUTCDate() - 2); // back to Saturday
      sat.setUTCHours(0, 0, 0, 0);          // Sat 00:00 UK wall clock
      return new Date(sat.getTime() - offMin * 60000).toISOString(); // real UTC instant
    }
  } catch(e) {}
  return new Date(nowMs - 48 * 3600000).toISOString();
}

module.exports = { ukOffsetMin: ukOffsetMin, getFreshCutoffIso: getFreshCutoffIso };
