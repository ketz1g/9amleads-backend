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
// Usage:
//   1. Drop EPC CSV files into  <dataDir>/epc/   (any number of files).
//   2. buildIndex(dataDir)   -> writes <dataDir>/epc-index.json  (run once / when data changes)
//   3. loadIndex(dataDir)    -> loads epc-index.json into memory (fast, called at boot)
//   4. resolveFullAddress(street, postcode) -> "42 Wentloog Road, Cardiff, CF3 3HF"
//
// The index is small: only the postcodes that appear in the CSVs, each mapped to its
// list of ADDRESS1 strings. A full-UK run is ~1m postcodes / tens of MB; a per-region
// subset is a few MB and fits Render's 1GB disk comfortably.

const fs = require('fs');
const path = require('path');

let INDEX = null;          // { PCKEY: [address1, ...] }
let INDEX_META = null;

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function pcKey(pc) {
  return String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

// Minimal RFC-4180-ish CSV line splitter (handles quoted fields with commas).
function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQ = false;
      } else cur += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { out.push(cur); cur = ''; }
      else cur += c;
    }
  }
  out.push(cur);
  return out;
}

function findCol(headers, names) {
  for (let i = 0; i < headers.length; i++) {
    const h = norm(headers[i]).replace(/ /g, '');
    for (const n of names) if (h === n) return i;
  }
  return -1;
}

// Build the index from every .csv in <dataDir>/epc/. Writes <dataDir>/epc-index.json.
function buildIndex(dataDir, opts) {
  opts = opts || {};
  const epcDir = path.join(dataDir, 'epc');
  if (!fs.existsSync(epcDir)) return { ok: false, error: 'no epc/ folder at ' + epcDir };
  const files = fs.readdirSync(epcDir).filter(f => /\.csv$/i.test(f));
  if (!files.length) return { ok: false, error: 'no .csv files in ' + epcDir };
  const index = {};
  let rows = 0, kept = 0;
  for (const f of files) {
    let txt;
    try { txt = fs.readFileSync(path.join(epcDir, f), 'utf-8'); } catch (e) { continue; }
    const lines = txt.split(/\r?\n/);
    if (!lines.length) continue;
    const headers = splitCsvLine(lines[0]);
    let iA1 = findCol(headers, ['address1']);
    let iA2 = findCol(headers, ['address2']);
    let iA3 = findCol(headers, ['address3']);
    let iTown = findCol(headers, ['posttown', 'town']);
    let iPost = findCol(headers, ['postcode']);
    if (iA1 < 0 || iPost < 0) continue;
    for (let li = 1; li < lines.length; li++) {
      const line = lines[li];
      if (!line) continue;
      rows++;
      const cols = splitCsvLine(line);
      const pc = pcKey(cols[iPost]);
      const a1 = String(cols[iA1] || '').trim();
      if (!pc || !a1) continue;
      // Build the fullest readable address we can from ADDRESS1..3 + town.
      const parts = [a1];
      if (iA2 >= 0 && cols[iA2] && norm(cols[iA2]) !== norm(a1)) parts.push(String(cols[iA2]).trim());
      if (iA3 >= 0 && cols[iA3]) parts.push(String(cols[iA3]).trim());
      if (iTown >= 0 && cols[iTown]) parts.push(String(cols[iTown]).trim());
      const addr = parts.filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
      (index[pc] = index[pc] || []).push(addr);
      kept++;
    }
  }
  const outFile = path.join(dataDir, 'epc-index.json');
  fs.writeFileSync(outFile, JSON.stringify({ built_at: new Date().toISOString(), rows, kept, index }));
  INDEX = index;
  INDEX_META = { built_at: new Date().toISOString(), rows, kept, postcodes: Object.keys(index).length };
  console.log('[EPC] index built: ' + INDEX_META.postcodes + ' postcodes, ' + kept + ' addresses from ' + files.length + ' file(s)');
  return { ok: true, rows, kept, postcodes: INDEX_META.postcodes, file: outFile };
}

// Load the index. Supports BOTH:
//   - epc-index.json  { index: { PC: [addr,...] } }   (small subset — preferred on Render)
//   - epc-index.tsv   "PC<TAB>addr1|addr2|..."         (full UK — big; only if it fits)
function loadIndex(dataDir) {
  try {
    INDEX = {};
    const jf = path.join(dataDir, 'epc-index.json');
    const tf = path.join(dataDir, 'epc-index.tsv');
    const gf = path.join(dataDir, 'epc-index.tsv.gz');
    if (fs.existsSync(jf)) {
      const j = JSON.parse(fs.readFileSync(jf, 'utf-8'));
      INDEX = j.index || {};
      INDEX_META = { source: 'json', built_at: j.built_at, rows: j.rows, kept: j.kept, postcodes: Object.keys(INDEX).length };
    } else if (fs.existsSync(gf) || fs.existsSync(tf)) {
      // Gzipped TSV (89MB -> 638MB) is the full index; plain TSV also supported.
      let text;
      if (fs.existsSync(gf)) text = require('zlib').gunzipSync(fs.readFileSync(gf)).toString('utf-8');
      else text = fs.readFileSync(tf, 'utf-8');
      const lines = text.split('\n');
      for (const line of lines) {
        if (!line) continue;
        const t = line.indexOf('\t');
        if (t < 0) continue;
        const pc = line.slice(0, t).trim();
        const addrs = line.slice(t + 1).split('|').filter(Boolean);
        if (pc && addrs.length) INDEX[pc] = addrs;
      }
      INDEX_META = { source: fs.existsSync(gf) ? 'tsv.gz' : 'tsv', postcodes: Object.keys(INDEX).length };
    } else {
      INDEX = null;
      return { ok: false, error: 'no index file' };
    }
    console.log('[EPC] index loaded: ' + INDEX_META.postcodes + ' postcodes (' + INDEX_META.source + ')');
    return { ok: true, postcodes: INDEX_META.postcodes, source: INDEX_META.source };
  } catch (e) { INDEX = null; return { ok: false, error: e.message }; }
}

function isLoaded() { return !!INDEX && Object.keys(INDEX).length > 0; }
function meta() { return INDEX_META; }

// Given a street (e.g. "Wentloog Road" or "42 Wentloog Road") and a full postcode,
// return the fullest matching address from the index, or null.
function resolveFullAddress(street, postcode) {
  if (!isLoaded()) return null;
  const pc = pcKey(postcode);
  if (!pc || !INDEX[pc]) return null;
  const list = INDEX[pc];
  const s = norm(street);
  if (!s) return null;
  // The street may include a leading number already — strip it for matching.
  const streetOnly = s.replace(/^\d+[a-z]?\s+/, '').trim();
  // If the input already has a number + street, find the exact entry first.
  let best = null;
  for (const a of list) {
    const na = norm(a);
    if (streetOnly && na.indexOf(streetOnly) !== -1) {
      // Prefer an entry that starts with a number (a real premise).
      if (/^\d/.test(String(a).trim())) return a;
      if (!best) best = a;
    }
  }
  if (best) return best;
  // Fallback: the street appears anywhere in the address.
  for (const a of list) {
    const na = norm(a);
    if (s && na.indexOf(s) !== -1 && /^\d/.test(String(a).trim())) return a;
  }
  return null;
}

module.exports = { buildIndex, loadIndex, resolveFullAddress, isLoaded, meta, pcKey, norm };
