// EPC ADDRESS INDEX
// =================
// Resolves a house number for a street+postcode using the FREE UK Energy Performance
// Certificate open data (https://epc.opendatacommunities.org), which contains the full
// address of ~25m UK properties under the Open Government Licence.
//
// Why: Rightmove / Zoopla / OnTheMarket all HIDE the house number in list view, so most
// scraped leads are street-only and fail the mailable gate. Given a street + full
// postcode we can look the real addresses up locally — no per-lookup cost, no bandwidth.
//
// Storage: SQLite (epc-index.db) queried per postcode — the full UK index (19m addresses)
// is far too big to load into RAM, but as a SQLite file (~1.2GB) on a >=2GB disk it is
// instant and near-zero memory. Built from the gzipped TSV (epc-index.tsv.gz, ~90MB).
//
// A small JSON subset (epc-index.json) is also supported as a fallback.

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const zlib = require('zlib');
let DatabaseSync = null;
try { DatabaseSync = require('node:sqlite').DatabaseSync; } catch (e) {}

let DB = null;         // open sqlite db
let INDEX = null;      // small in-memory subset (fallback)
let INDEX_META = null;

function norm(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function pcKey(pc) {
  return String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Build epc-index.db from epc-index.tsv.gz (or .tsv). Safe to call on Render.
function buildSqlite(dataDir, onDone) {
  return new Promise(function (resolve) {
    try {
      if (!DatabaseSync) { resolve({ ok: false, error: 'node:sqlite unavailable' }); return; }
      const gz = path.join(dataDir, 'epc-index.tsv.gz');
      const tsv = path.join(dataDir, 'epc-index.tsv');
      const dbf = path.join(dataDir, 'epc-index.db');
      if (!fs.existsSync(gz) && !fs.existsSync(tsv)) { resolve({ ok: false, error: 'no tsv/tsv.gz' }); return; }
      try { fs.unlinkSync(dbf); } catch (e) {}
      const db = new DatabaseSync(dbf);
      db.exec('PRAGMA journal_mode = OFF');
      db.exec('PRAGMA synchronous = OFF');
      db.exec('CREATE TABLE addresses (pc TEXT, addr TEXT)');
      const ins = db.prepare('INSERT INTO addresses (pc, addr) VALUES (?, ?)');
      let rows = 0, batch = [];
      function flush() { if (!batch.length) return; db.exec('BEGIN'); try { for (const p of batch) { ins.run(p[0], p[1]); rows++; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } batch = []; }
      const input = fs.existsSync(gz) ? fs.createReadStream(gz).pipe(zlib.createGunzip()) : fs.createReadStream(tsv);
      const rl = readline.createInterface({ input: input, crlfDelay: Infinity });
      rl.on('line', function (line) {
        if (!line) return;
        const t = line.indexOf('\t');
        if (t < 0) return;
        const pc = line.slice(0, t).trim();
        const addrs = line.slice(t + 1).split('|').filter(Boolean);
        for (const a of addrs) batch.push([pc, a]);
        if (batch.length >= 20000) flush();
      });
      rl.on('close', function () {
        try { flush(); db.exec('CREATE INDEX idx_pc ON addresses(pc)'); db.close(); } catch (e) {}
        try { if (DB) DB.close(); } catch (e) {}
        try { DB = new DatabaseSync(dbf); } catch (e) { DB = null; }
        const mb = (fs.statSync(dbf).size / 1048576).toFixed(1);
        console.log('[EPC] sqlite built: ' + rows + ' addresses (' + mb + ' MB)');
        resolve({ ok: true, rows: rows, mb: mb });
      });
      rl.on('error', function (e) { resolve({ ok: false, error: e.message }); });
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

function loadIndex(dataDir) {
  try {
    // 1. SQLite (full index) — preferred.
    const dbf = path.join(dataDir, 'epc-index.db');
    if (DatabaseSync && fs.existsSync(dbf)) {
      try { if (DB) DB.close(); } catch (e) {}
      DB = new DatabaseSync(dbf, { readOnly: true });
      INDEX = null;
      INDEX_META = { source: 'sqlite' };
      console.log('[EPC] sqlite index loaded');
      return { ok: true, source: 'sqlite' };
    }
    // 2. Small JSON subset.
    const jf = path.join(dataDir, 'epc-index.json');
    if (fs.existsSync(jf)) {
      const j = JSON.parse(fs.readFileSync(jf, 'utf-8'));
      INDEX = j.index || {};
      INDEX_META = { source: 'json', built_at: j.built_at, postcodes: Object.keys(INDEX).length };
      console.log('[EPC] json subset loaded: ' + INDEX_META.postcodes + ' postcodes');
      return { ok: true, source: 'json', postcodes: INDEX_META.postcodes };
    }
    INDEX = null; DB = null; INDEX_META = null;
    return { ok: false, error: 'no index file' };
  } catch (e) { INDEX = null; DB = null; return { ok: false, error: e.message }; }
}

function isLoaded() { return !!DB || (!!INDEX && Object.keys(INDEX).length > 0); }
function meta() { return INDEX_META; }

function _matchFromList(list, street) {
  const s = norm(street);
  if (!s) return null;
  const streetOnly = s.replace(/^\d+[a-z]?\s+/, '').trim();
  let best = null;
  for (const a of list) {
    const na = norm(a);
    if (streetOnly && na.indexOf(streetOnly) !== -1) {
      if (/^\d/.test(String(a).trim())) return a;
      if (!best) best = a;
    }
  }
  if (best) return best;
  for (const a of list) {
    const na = norm(a);
    if (s && na.indexOf(s) !== -1 && /^\d/.test(String(a).trim())) return a;
  }
  return null;
}

// Given a street (e.g. "Wentloog Road" or "42 Wentloog Road") and a full postcode,
// return the fullest matching address from the index, or null.
function resolveFullAddress(street, postcode) {
  if (!isLoaded()) return null;
  const pc = pcKey(postcode);
  if (!pc) return null;
  let list = null;
  if (DB) {
    try { list = DB.prepare('SELECT addr FROM addresses WHERE pc = ?').all(pc).map(function (r) { return r.addr; }); }
    catch (e) { list = null; }
  } else if (INDEX && INDEX[pc]) {
    list = INDEX[pc];
  }
  if (!list || !list.length) return null;
  return _matchFromList(list, street);
}

module.exports = { buildIndex: null, buildSqlite, loadIndex, resolveFullAddress, isLoaded, meta, pcKey, norm };
