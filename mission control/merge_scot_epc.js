// Merge the Scottish EPC CSVs (statistics.gov.scot, two header rows, no post-town) into
// the existing data/epc-index.tsv (postcode<TAB>addr|addr|...), de-duplicating.
// Usage: node merge_scot_epc.js "<scotFolder>" [dataDir]
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const folder = process.argv[2];
const dataDir = process.argv[3] || path.join(__dirname, 'data');
if (!folder || !fs.existsSync(folder)) { console.error('folder not found: ' + folder); process.exit(1); }

function pcKey(pc) { return String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function splitCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } }
  out.push(cur); return out;
}

(async function () {
  // 1. Load the existing E&W index into a Map<postcode, Set<addr>>.
  const tsv = path.join(dataDir, 'epc-index.tsv');
  const index = new Map();
  if (fs.existsSync(tsv)) {
    await new Promise(function (resolve) {
      const rl = readline.createInterface({ input: fs.createReadStream(tsv) });
      rl.on('line', function (line) { if (!line) return; const t = line.indexOf('\t'); if (t < 0) return;
        const pc = line.slice(0, t).trim(); const addrs = line.slice(t + 1).split('|').filter(Boolean);
        let set = index.get(pc); if (!set) { set = new Set(); index.set(pc, set); } for (const a of addrs) set.add(a); });
      rl.on('close', resolve);
    });
  }
  console.log('[MERGE] existing index: ' + index.size + ' postcodes');

  // 2. Add the Scottish CSVs.
  const files = fs.readdirSync(folder).filter(f => /\.csv$/i.test(f)).sort();
  let added = 0;
  for (const f of files) {
    await new Promise(function (resolve) {
      const rl = readline.createInterface({ input: fs.createReadStream(path.join(folder, f)), crlfDelay: Infinity });
      let header = null, rowNo = 0;
      rl.on('line', function (line) {
        if (!line) return;
        rowNo++;
        const cols = splitCsvLine(line);
        if (rowNo === 1) {
          header = cols.map(function (h) { return norm(h).replace(/ /g, ''); });
          return;
        }
        // Second row is a human-readable header - skip it.
        if (rowNo === 2 && /property_uprn|osg_uprn|building_reference_number/i.test(line)) return;
        if (!header) return;
        const iA1 = header.indexOf('address1'); const iA2 = header.indexOf('address2');
        const iA3 = header.indexOf('address3'); const iPost = header.indexOf('postcode');
        const iTown = header.indexOf('posttown');
        if (iA1 < 0 || iPost < 0) return;
        const pc = pcKey(cols[iPost]); const a1 = String(cols[iA1] || '').trim();
        if (!pc || !a1) return;
        const parts = [a1];
        if (iA2 >= 0 && cols[iA2] && norm(cols[iA2]) !== norm(a1)) parts.push(String(cols[iA2]).trim());
        if (iA3 >= 0 && cols[iA3]) parts.push(String(cols[iA3]).trim());
        if (iTown >= 0 && cols[iTown]) parts.push(String(cols[iTown]).trim());
        const addr = parts.filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
        let set = index.get(pc); if (!set) { set = new Set(); index.set(pc, set); }
        if (!set.has(addr)) { set.add(addr); added++; }
      });
      rl.on('close', resolve);
      rl.on('error', resolve);
    });
    console.log('[MERGE] ' + f + ' done - total postcodes=' + index.size + ' added=' + added);
  }

  // 3. Write the merged TSV.
  const ws = fs.createWriteStream(tsv);
  let pcs = 0;
  for (const [pc, set] of index) { const a = Array.from(set); if (!a.length) continue; pcs++; ws.write(pc + '\t' + a.join('|') + '\n'); }
  ws.end(function () { console.log('[MERGE] DONE: ' + pcs + ' postcodes, added ' + added + ' Scottish addresses -> ' + tsv); });
})();
