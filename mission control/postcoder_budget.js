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

// Cache for the auto-scaled active-account count (re-read at most every 5 min).
var _activeCountCache = 0;
var _activeCountAt = 0;

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
  // AUTO-SCALE with active customers so the budget always matches demand:
  //   base = fixed daily floor for collection pre-enrichment (pool stocking)
  //   per-account = delivered leads/day × credit per lead, × buffer for
  //   pre-enrichment + final-guarantee re-enrichment
  // If POSTCODER_DAILY_BUDGET is explicitly set (a hard ceiling), respect it.
  var hardCap = parseInt(process.env.POSTCODER_DAILY_BUDGET || '0', 10);
  var base = parseInt(process.env.POSTCODER_BASE_BUDGET || '90', 10);
  var perAccount = parseInt(process.env.POSTCODER_PER_ACCOUNT || '20', 10);
  // Cache the active-account count (re-read at most every 5 min) to avoid reading
  // the whole DB file on every lookup.
  var active = 0;
  var now = Date.now();
  var envActive = parseInt(process.env.POSTCODER_ACTIVE_ACCOUNTS || '0', 10);
  if (envActive > 0) {
    active = envActive; // explicit override wins
  } else if (_activeCountCache && (now - _activeCountAt) < 300000) {
    active = _activeCountCache;
  } else {
    try {
      var dbPath = process.env.DB_PATH || path.join(DATA_DIR, 'database.json');
      if (/\.db$/i.test(dbPath)) {
        // SQLite DB (production). Count active (non-cancelled) customers.
        var Database = require('better-sqlite3');
        var db = new Database(dbPath, { readonly: true });
        var row = db.prepare("SELECT COUNT(*) AS c FROM customers WHERE plan IS NOT NULL AND plan != 'cancelled'").get();
        active = row ? row.c : 0;
        db.close();
      } else {
        var jdb = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        active = (jdb.customers || []).filter(function(c){
          return c.plan && c.plan !== 'cancelled' && (!c.bounced || c.bounced < 3);
        }).length;
      }
    } catch(e) {
      active = 0;
    }
    _activeCountCache = active;
    _activeCountAt = now;
  }
  var scaled = base + (active * perAccount);
  // A hard ceiling (if set) prevents runaway cost; otherwise the budget scales up
  // automatically as accounts grow.
  var budget = hardCap > 0 ? Math.min(hardCap, scaled) : scaled;
  if (budget < 1) budget = 1;
  return budget;
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
