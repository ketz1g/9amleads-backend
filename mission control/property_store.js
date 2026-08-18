// CENTRAL PROPERTY STORE
// A lightweight persistent record of every property we've ever seen, keyed by the
// Rightmove/property listing ID (the source's own unique identifier). Its only job
// is to preserve first_seen_at across scrape runs so a property that drops out of
// the 48h pool window and reappears is NEVER treated as "new" again (no falsely
// refreshed freshness).
//
// We keep the data minimal: id, first_seen_at, last_seen_at. The heavy listing
// details live in the per-product pool files; this store is only the identity +
// first-seen ledger used to guard freshness.
//
// Kept deliberately simple (single JSON file, in-memory map) — no enterprise infra.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'property-store.json');

var _store = null;

function load() {
  if (_store) return _store;
  try {
    _store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
    if (!_store || typeof _store !== 'object') _store = {};
  } catch(e) { _store = {}; }
  return _store;
}
function save() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE, JSON.stringify(_store));
  } catch(e) {}
}

// Record that a property id was seen. On first sight sets first_seen_at; on every
// sight updates last_seen_at. NEVER overwrites an existing first_seen_at.
function recordSeen(id, opts) {
  var key = String(id || '').trim();
  if (!key) return null;
  var store = load();
  var now = new Date().toISOString();
  var entry = store[key];
  if (!entry) {
    entry = { first_seen_at: now, last_seen_at: now };
    if (opts && opts.product) entry.product = opts.product;
    store[key] = entry;
    save();
  } else {
    var dirty = false;
    if (entry.last_seen_at !== now) { entry.last_seen_at = now; dirty = true; }
    if (opts && opts.product && entry.product !== opts.product) { entry.product = opts.product; dirty = true; }
    if (dirty) save();
  }
  return entry;
}

// Get the stored first/last seen timestamps for an id, or null if unknown.
function lookup(id) {
  var key = String(id || '').trim();
  if (!key) return null;
  return load()[key] || null;
}

// Enrich a pool lead with its stored first_seen_at (recording it if new).
// Returns the lead with first_seen_at / last_seen_at attached.
function enrichLead(lead) {
  var id = (lead && (lead.id || lead.listingId || lead.uprn || '')) || '';
  var rec = recordSeen(id);
  if (rec && lead) {
    lead.first_seen_at = rec.first_seen_at;
    lead.last_seen_at = rec.last_seen_at;
  }
  return lead;
}

function stats() {
  var store = load();
  var n = Object.keys(store).length;
  return { properties_seen: n };
}

module.exports = { recordSeen: recordSeen, lookup: lookup, enrichLead: enrichLead, stats: stats };
