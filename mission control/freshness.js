// Shared freshness-floor logic for the "fresh leads" promise.
//
// Normally the freshness floor is 48h. On MONDAYS (UK time) it extends back to
// FRIDAY 09:00 UK so EVERY listing published since the last 9am delivery (Friday
// 9am) qualifies — Saturday + Sunday + Friday-afternoon leads all fill Monday's
// accounts, keeping the exact daily-count promise across the weekend.

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

function isMondayUK(nowMs) {
  nowMs = nowMs || Date.now();
  try {
    var offMin = ukOffsetMin(nowMs);
    var ukD = new Date(nowMs + offMin * 60000);
    return ukD.getUTCDay() === 1;
  } catch(e) {}
  return false;
}

function getFreshCutoffIso(nowMs) {
  nowMs = nowMs || Date.now();
  try {
    var offMin = ukOffsetMin(nowMs);
    // Timestamp whose UTC clock-read equals the UK wall clock.
    var ukMs = nowMs + offMin * 60000;
    var ukD = new Date(ukMs);
    if (ukD.getUTCDay() === 1) { // Monday in UK
      var fri = new Date(ukMs);
      fri.setUTCDate(fri.getUTCDate() - 3); // back to Friday
      fri.setUTCHours(9, 0, 0, 0);          // Fri 09:00 UK wall clock (last delivery)
      return new Date(fri.getTime() - offMin * 60000).toISOString(); // real UTC instant
    }
  } catch(e) {}
  return new Date(nowMs - 48 * 3600000).toISOString();
}

// POOL PRUNE CUTOFF: leads older than this are deleted from the pools so we never
// build a backlog of unused leads (we scrape daily). Floor = 72h (3 days). On
// MONDAYS it extends back to Friday 09:00 UK so Saturday/Sunday/Friday-afternoon
// leads survive to fill Monday's accounts — then age out like any other lead.
function getPruneCutoffIso(nowMs) {
  nowMs = nowMs || Date.now();
  try {
    var offMin = ukOffsetMin(nowMs);
    var ukMs = nowMs + offMin * 60000;
    var ukD = new Date(ukMs);
    if (ukD.getUTCDay() === 1) { // Monday in UK
      var fri = new Date(ukMs);
      fri.setUTCDate(fri.getUTCDate() - 3); // back to Friday
      fri.setUTCHours(9, 0, 0, 0);          // Fri 09:00 UK (last delivery)
      var mondayFloor = new Date(fri.getTime() - offMin * 60000).getTime();
      if (mondayFloor > nowMs - 72 * 3600000) return new Date(mondayFloor).toISOString();
    }
  } catch(e) {}
  return new Date(nowMs - 72 * 3600000).toISOString();
}

module.exports = { ukOffsetMin: ukOffsetMin, getFreshCutoffIso: getFreshCutoffIso, isMondayUK: isMondayUK, getPruneCutoffIso: getPruneCutoffIso };
