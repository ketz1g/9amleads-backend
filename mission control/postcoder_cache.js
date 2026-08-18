// SHARED POSTCODER RESPONSE CACHE
// Postcoder (Royal Mail PAF) is paid per lookup (~4.5p). Validating the same
// postcode repeatedly across scrapers, distributor, delivery and admin burns
// credits needlessly. This cache stores the PAF address array once per cleaned
// postcode so repeated lookups reuse the stored result and NEVER re-call the
// paid API for a postcode we already validated.
//
// Key = normalised postcode (uppercase, no spaces). Value = the raw PAF address
// array returned by Postcoder for that postcode. Lookups keyed by postcode are
// safe because a PAF postcode lookup returns the same set of addresses every time.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CACHE_FILE = path.join(DATA_DIR, 'postcoder-cache.json');

// In-memory fast path (avoids a disk read on hot loops) + persistent backing store.
var _mem = null;

function load() {
  if (_mem) return _mem;
  try {
    _mem = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
  } catch(e) { _mem = {}; }
  return _mem;
}
function save() {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(_mem));
  } catch(e) {}
}

// Normalise a postcode to a stable cache key (uppercase, strip non-alphanumerics).
function cacheKey(postcode) {
  return String(postcode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Get the cached PAF address array for a postcode, or null if not cached.
function get(postcode) {
  var key = cacheKey(postcode);
  if (!key) return null;
  var mem = load();
  var entry = mem[key];
  if (!entry) return null;
  // Cache entries older than 90 days are dropped (postcodes can change).
  if (entry.at && (Date.now() - entry.at) > 90 * 86400000) {
    delete mem[key];
    return null;
  }
  return entry.addresses;
}

// Cache a PAF address array for a postcode.
function set(postcode, addresses) {
  var key = cacheKey(postcode);
  if (!key) return;
  var mem = load();
  mem[key] = { at: Date.now(), addresses: addresses };
  save();
}

// Usage stats for admin/cost tracking.
function stats() {
  var mem = load();
  var n = 0;
  Object.keys(mem).forEach(function(k) { if (mem[k] && Array.isArray(mem[k].addresses)) n++; });
  var nu = 0;
  Object.keys(mem).forEach(function(k) { if (mem[k] && mem[k].uprn) nu++; });
  return { postcodes_cached: n, uprns_cached: nu };
}

// --- UPRN cache (AddressBase verification results) ---
// UPRNs are stable/immutable so these can be cached indefinitely.

function getUprn(uprn) {
  var key = String(uprn || '').replace(/[^0-9]/g, '');
  if (!key) return null;
  var mem = load();
  var entry = mem['UPRN:' + key];
  if (!entry) return null;
  if (entry.at && (Date.now() - entry.at) > 365 * 86400000) { delete mem['UPRN:' + key]; return null; }
  return entry.value;
}
function setUprn(uprn, value) {
  var key = String(uprn || '').replace(/[^0-9]/g, '');
  if (!key || !value) return;
  var mem = load();
  mem['UPRN:' + key] = { at: Date.now(), uprn: true, value: value };
  save();
}

module.exports = { get: get, set: set, getUprn: getUprn, setUprn: setUprn, stats: stats, cacheKey: cacheKey };
