// STREAMING EPC INDEX BUILDER
// Reads the (huge) domestic EPC CSV zip WITHOUT extracting it, keeps only the columns we
// need, and writes a compact postcode -> [address] index to data/epc-index.json.
//
// Usage:
//   node build_epc_index.js <path-to-zip> [dataDir] [areaFilterCsv]
//     areaFilterCsv (optional): e.g. "L,CH,WA,CF,BS,NP,GL,BA" - only keep postcodes whose
//     area matches. Omit to index the whole UK (much bigger).
const fs = require('fs');
const path = require('path');
const yauzl = require('yauzl');

const zipPath = process.argv[2];
const dataDir = process.argv[3] || path.join(__dirname, 'data');
const areaArg = process.argv[4] || '';
const areaFilter = areaArg ? areaArg.toUpperCase().split(',').map(s => s.trim()).filter(Boolean) : null;

if (!zipPath || !fs.existsSync(zipPath)) { console.error('zip not found: ' + zipPath); process.exit(1); }

const index = {};            // PCKEY -> Set("42 Wentloog Road, Cardiff", ...)
let rows = 0, kept = 0, files = 0;

function pcKey(pc) { return String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function pcArea(pc) { const m = String(pc || '').toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2})/); return m ? m[1] : ''; }
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }

function splitCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; }
  }
  out.push(cur); return out;
}
function findCol(headers, names) {
  for (let i = 0; i < headers.length; i++) { const h = norm(headers[i]).replace(/ /g, ''); for (const n of names) if (h === n) return i; }
  return -1;
}

function handleEntry(zipfile, entry) {
  // ONLY the certificate files carry addresses - skip recommendations-*.csv etc.
  if (!/certificates-\d{4}\.csv$/i.test(entry.fileName)) { zipfile.readEntry(); return; }
  files++;
  zipfile.openReadStream(entry, function(err, rs) {
    if (err) { console.error('[EPC-BUILD] stream err ' + entry.fileName + ': ' + err.message); zipfile.readEntry(); return; }
    let iA1 = -1, iA2 = -1, iTown = -1, iPost = -1, headerDone = false;
    let buf = '';
    rs.on('data', function(chunk) {
      buf += chunk.toString('utf-8');
      let nl;
      while ((nl = buf.indexOf('\n')) !== -1) {
        let line = buf.slice(0, nl); buf = buf.slice(nl + 1);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        if (!line) continue;
        if (!headerDone) {
          const h = splitCsvLine(line);
          iA1 = findCol(h, ['address1']); iA2 = findCol(h, ['address2']);
          iTown = findCol(h, ['posttown', 'town']); iPost = findCol(h, ['postcode']);
          headerDone = true;
          if (iA1 < 0 || iPost < 0) { console.error('[EPC-BUILD] unexpected header in ' + entry.fileName); rs.destroy(); break; }
          continue;
        }
        rows++;
        const cols = splitCsvLine(line);
        const rawPc = cols[iPost];
        const pc = pcKey(rawPc);
        const a1 = String(cols[iA1] || '').trim();
        if (!pc || !a1) continue;
        if (areaFilter && areaFilter.indexOf(pcArea(rawPc)) === -1) continue;
        const parts = [a1];
        if (iA2 >= 0 && cols[iA2] && norm(cols[iA2]) !== norm(a1)) parts.push(String(cols[iA2]).trim());
        if (iTown >= 0 && cols[iTown]) parts.push(String(cols[iTown]).trim());
        const addr = parts.filter(Boolean).join(', ').replace(/\s+/g, ' ').trim();
        if (!index[pc]) index[pc] = new Set();
        if (!index[pc].has(addr)) { index[pc].add(addr); kept++; }
      }
    });
    rs.on('end', function() {
      console.log('[EPC-BUILD] ' + entry.fileName + ' done - rows=' + rows + ' kept=' + kept + ' postcodes=' + Object.keys(index).length);
      zipfile.readEntry();
    });
    rs.on('error', function(e) { console.error('[EPC-BUILD] read err: ' + e.message); zipfile.readEntry(); });
  });
}

yauzl.open(zipPath, { lazyEntries: true, autoClose: true }, function(err, zipfile) {
  if (err) { console.error('[EPC-BUILD] open err: ' + err.message); process.exit(1); }
  zipfile.on('entry', function(entry) { handleEntry(zipfile, entry); });
  zipfile.on('end', function() {
    // LINE-BASED (one postcode per line) so we never hit V8's single-string limit.
    // Format: PC<TAB>addr1|addr2|addr3...
    const outFile = path.join(dataDir, 'epc-index.tsv');
    const ws = fs.createWriteStream(outFile);
    let pcs = 0;
    Object.keys(index).forEach(function(pc) {
      const addrs = Array.from(index[pc]);
      if (!addrs.length) return;
      pcs++;
      ws.write(pc + '\t' + addrs.join('|') + '\n');
    });
    ws.end(function() {
      const mb = (fs.statSync(outFile).size / 1048576).toFixed(1);
      console.log('[EPC-BUILD] DONE: ' + pcs + ' postcodes, ' + kept + ' unique addresses (' + mb + ' MB) -> ' + outFile);
    });
  });
  zipfile.on('error', function(e) { console.error('[EPC-BUILD] zip err: ' + e.message); process.exit(1); });
  zipfile.readEntry();
});
