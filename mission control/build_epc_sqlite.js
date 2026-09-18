// Build a compact SQLite EPC index from epc-index.tsv.
// Usage: node build_epc_sqlite.js [dataDir]
//   reads  <dataDir>/epc-index.tsv   "PC<TAB>addr1|addr2|..."
//   writes <dataDir>/epc-index.db    table addresses(pc TEXT, addr TEXT), indexed
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.argv[2] || path.join(__dirname, 'data');
const tsv = path.join(dataDir, 'epc-index.tsv');
const dbFile = path.join(dataDir, 'epc-index.db');
if (!fs.existsSync(tsv)) { console.error('no ' + tsv); process.exit(1); }

try { fs.unlinkSync(dbFile); } catch (e) {}
const db = new DatabaseSync(dbFile);
db.exec('PRAGMA journal_mode = OFF');
db.exec('PRAGMA synchronous = OFF');
db.exec('CREATE TABLE addresses (pc TEXT, addr TEXT)');

const ins = db.prepare('INSERT INTO addresses (pc, addr) VALUES (?, ?)');
let rows = 0;
function tx(pairs) { db.exec('BEGIN'); try { for (const p of pairs) { ins.run(p[0], p[1]); rows++; } db.exec('COMMIT'); } catch (e) { db.exec('ROLLBACK'); throw e; } }

const rl = readline.createInterface({ input: fs.createReadStream(tsv) });
let batch = [];
rl.on('line', function (line) {
  if (!line) return;
  const t = line.indexOf('\t');
  if (t < 0) return;
  const pc = line.slice(0, t).trim();
  const addrs = line.slice(t + 1).split('|').filter(Boolean);
  for (const a of addrs) batch.push([pc, a]);
  if (batch.length >= 20000) { tx(batch); batch = []; }
});
rl.on('close', function () {
  if (batch.length) tx(batch);
  db.exec('CREATE INDEX idx_pc ON addresses(pc)');
  db.close();
  const mb = (fs.statSync(dbFile).size / 1048576).toFixed(1);
  console.log('[EPC-SQLITE] built: ' + rows + ' addresses (' + mb + ' MB) -> ' + dbFile);
});
