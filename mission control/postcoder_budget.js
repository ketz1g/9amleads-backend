// SHARED POSTCODER DAILY-CREDIT GUARD
// Postcoder (Royal Mail PAF) is paid per lookup (~4.5p). Every enrichment path
// (scrapers, distributor, delivery, admin) MUST spend through this single guard,
// otherwise the daily budget is per-run instead of per-day and credits burn fast.
// Persists a rolling daily counter so the budget is enforced across restarts,
// multiple scrape runs, and every code path.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USAGE_FILE = path.join(DATA_DIR, 'postcoder-usage.json');

function load() {
  try { return JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8')); } catch(e) { return {}; }
}
function save(u) {
  try { fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true }); fs.writeFileSync(USAGE_FILE, JSON.stringify(u)); } catch(e) {}
}

function enabled() {
  return process.env.POSTCODER_ENABLED === 'true' || process.env.POSTCODER_ENABLED === '1';
}

function getDailyBudget() {
  var b = parseInt(process.env.POSTCODER_DAILY_BUDGET || '150', 10);
  return b > 0 ? b : 150;
}

// Try to spend one lookup credit. Returns true if allowed (and records the spend),
// false if the daily budget is exhausted or Postcoder is disabled.
function spend() {
  if (!enabled()) return false;
  var today = new Date().toISOString().split('T')[0];
  var u = load();
  if (u.date !== today) { u.date = today; u.used = 0; }
  if (u.used >= getDailyBudget()) return false;
  u.used++;
  save(u);
  return true;
}

// RATE-LIMIT GUARD: Postcoder restricts 50 lookups per 5-minute window per IP
// (and may restrict the IP entirely after repeated bursts). Track the number of
// lookups in the current rolling 5-minute window and refuse once we approach the
// limit, so a heavy delivery/scrape never triggers an IP restriction.
var RATE_WINDOW_MS = 5 * 60 * 1000;
var RATE_LIMIT = 48; // stay under Postcoder's 50/5min so the IP is never restricted

function canLookup() {
  if (!enabled()) return false;
  if (!spend()) return false; // also enforces the daily budget
  var now = Date.now();
  var u = load();
  if (!u.window || !u.window.length) u.window = [];
  // Drop entries older than the window
  u.window = u.window.filter(function(t) { return (now - t) < RATE_WINDOW_MS; });
  if (u.window.length >= RATE_LIMIT) {
    // Roll back the spend — we're rate-limited, not budget-limited.
    u.used = Math.max(0, (u.used || 1) - 1);
    save(u);
    console.log('[POSTCODER] Rate limit reached (' + RATE_LIMIT + '/5min) — pausing lookups to avoid IP restriction.');
    return false;
  }
  u.window.push(now);
  save(u);
  return true;
}

function usage() {
  var today = new Date().toISOString().split('T')[0];
  var u = load();
  return u.date === today ? (u.used || 0) : 0;
}

module.exports = { spend, usage, getDailyBudget, enabled, canLookup, RATE_LIMIT, RATE_WINDOW_MS };
