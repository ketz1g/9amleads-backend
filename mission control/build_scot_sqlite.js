// Build a small SEPARATE SQLite index for Scotland from the statistics.gov.scot CSVs
// (two header rows, ADDRESS1/2/3 + POSTCODE, no post-town). Written to scot-epc.db so it
// can be loaded alongside the England & Wales epc-index.db without rebuilding the big one.
// Usage: node build_scot_sqlite.js "<scotFolder>" [dataDir]
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

const folder = process.argv[2];
const dataDir = process.argv[3] || path.join(__dirname, 'data');
if (!folder || !fs.existsSync(folder)) { console.error('folder not found: ' + folder); process.exit(1); }
const dbf = path.join(dataDir, 'scot-epc.db');
try { fs.unlinkSync(dbf); } catch (e) {}

function pcKey(pc) { return String(pc || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
function norm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
function splitCsvLine(line) {
  const out = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) { const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else { if (c === '"') inQ = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } }
  out.push(cur); return out;
}

const db = new DatabaseSync(dbf);
db.exec('PRAGMA journal_mode = OFF');
db.exec('PRAGMA synchronous = OFF');
db.exec('CREATE TABLE addresses (pc TEXT, addr TEXT)');
const ins = db.prepare('INSERT INTO addresses (pc, addr) VALUES (?, ?)');
let rows = 0, batch = [];
function flush() { if (!batch.length) return; db.exec('BEGIN'); try { for (const p of batch) { ins.run(p[0], p[1]); rows++; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } batch = []; }

(async function () {
  const files = fs.readdirSync(folder).filter(f => /\.csv$/i.test(f)).sort();
  for (const f of files) {
    await new Promise(function (resolve) {
      const rl = readline.createInterface({ input: fs.createReadStream(path.join(folder, f)), crlfDelay: Infinity });
      let header = null, rowNo = 0;
      rl.on('line', function (line) {
        if (!line) return;
        rowNo++;
        const cols = splitCsvLine(line);
        if (rowNo === 1) { header = cols.map(function (h) { return norm(h).replace(/ /g, ''); }); return; }
        if (rowNo === 2 && /property_uprn|osg_uprn|building_reference_number/i.test(line)) return;
        if (!header) return;
        const iA1 = header.indexOf('address1'), iA2 = header.indexOf('address2'), iA3 = header.indexOf('address3'), iPost = header.indexOf('postcode');
        if (iA1 < 0 || iPost < 0) return;
        const pc = pcKey(cols[iPost]); const a1 = String(cols[iA1] || '').trim();
        if (!pc || !a1) return;
        const parts = [a1];
        if (iA2 >= 0 && cols[iA2] && norm(cols[iA2]) !== norm(a1)) parts.push(String(cols[iA2]).trim());
        if (iA3 >= 0 && cols[iA3]) parts.push(String(cols[iA3]).trim());
        batch.push([pc, parts.filter(Boolean).join(', ').replace(/\s+/g, ' ').trim()]);
        if (batch.length >= 20000) flush();
      });
      rl.on('close', function () { flush(); console.log('[SCOT-SQLITE] ' + f + ' done - rows=' + rows); resolve(); });
      rl.on('error', function () { resolve(); });
    });
  }
  db.exec('CREATE INDEX idx_pc ON addresses(pc)');
  db.close();
  const mb = (fs.statSync(dbf).size / 1048576).toFixed(1);
  console.log('[SCOT-SQLITE] DONE: ' + rows + ' addresses (' + mb + ' MB) -> ' + dbf);
})();
