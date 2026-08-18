// LIGHTWEIGHT SCRAPER USAGE TRACKING
// Records how many Rightmove pages / Apify actor calls / search runs happen per day
// and how many properties are new vs already-known. This is cost + dedup visibility
// (Rightmove direct scraping is free; Apify actor runs cost credits). Kept minimal —
// a JSON ledger + an in-memory fast path, surfaced via admin/system-status.
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USAGE_FILE = path.join(DATA_DIR, 'scraper-usage.json');

var _mem = null;

function load() {
  if (_mem) return _mem;
  try { _mem = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf-8')); } catch(e) { _mem = {}; }
  return _mem;
}
function save() {
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true });
    fs.writeFileSync(USAGE_FILE, JSON.stringify(_mem));
  } catch(e) {}
}
function today() { return new Date().toISOString().split('T')[0]; }

function day(todayStr) {
  var mem = load();
  var t = todayStr || today();
  if (!mem[t]) mem[t] = { rightmove_pages: 0, apify_runs: 0, apify_props: 0, searches: 0, new_props: 0, known_props: 0, failed_searches: 0 };
  return mem[t];
}

// Increment a named counter for today.
function inc(field, n) {
  var mem = load();
  var t = today();
  if (!mem[t]) mem[t] = { rightmove_pages: 0, apify_runs: 0, apify_props: 0, searches: 0, new_props: 0, known_props: 0, failed_searches: 0 };
  mem[t][field] = (mem[t][field] || 0) + (n || 1);
  save();
}

function stats() {
  var mem = load();
  return { today: mem[today()] || {}, last_days: Object.keys(mem).sort().slice(-7) };
}

module.exports = { inc: inc, day: day, stats: stats, today: today };
