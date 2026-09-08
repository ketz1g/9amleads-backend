// run_buyer_subtypes.js — per-subtype directory scrape.
// For each subtype in the taxonomy, scans Thomson Local across UK towns until it
// has `target` business emails, saving per-subtype CSV + progress (resumable).
//
// Usage:
//   node run_buyer_subtypes.js --product=moving --target=150      (one product)
//   node run_buyer_subtypes.js --subtype=moving-storage --target=150
//   node run_buyer_subtypes.js --all --target=120                  (all products, modest)
const https = require('https');
const fs = require('fs');
const path = require('path');
const { SUBTYPES } = require('./buyer_taxonomy.js');

const DATA_DIR = path.join(__dirname, 'data');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

function loadTowns() {
  try {
    const o = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'uk-postcode-areas.json'), 'utf-8'));
    return Object.keys(o).map(k => o[k].name).filter(n => n && n.length > 2);
  } catch (e) { return []; }
}

function get(url, timeout, depth) {
  depth = depth || 0;
  if (depth > 4) return Promise.resolve({ status: 0, html: '' });
  return new Promise(resolve => {
    let u; try { u = new URL(url); } catch (e) { resolve({ status: 0, html: '' }); return; }
    const r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-GB,en;q=0.9' }, timeout: timeout || 12000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume(); let n = res.headers.location; if (n.startsWith('/')) n = 'https://' + u.hostname + n; get(n, timeout, depth + 1).then(resolve); return;
      }
      let b = ''; res.on('data', c => { if (b.length < 5000000) b += c; }); res.on('end', () => resolve({ status: res.statusCode, html: b }));
    });
    r.on('error', () => resolve({ status: 0, html: '' }));
    r.setTimeout(timeout || 12000, () => { r.destroy(); resolve({ status: 0, html: '' }); });
    r.end();
  });
}

function extractEmails(html) {
  const out = []; const re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g; let m;
  while ((m = re.exec(html)) !== null) {
    const e = m[0].toLowerCase(); const local = e.split('@')[0], dom = e.split('@')[1];
    if (!local || local.length < 2) continue;
    if (/^(example|test|noreply|no-reply|sent|yourname|name|email|you|domain|site|hostmaster|postmaster|support|webmaster|admin|contact)$/i.test(local)) continue;
    if (/\.(png|jpg|jpeg|gif|svg|css|js|webp|ico|woff2?|eot|ttf|pdf|zip)$/i.test(e)) continue;
    if (dom && /^([a-z0-9._%+-]+\.)?(google|facebook|twitter|youtube|microsoft|apple|adobe|wix|squarespace|godaddy|sentry|cloudflare|wordpress|weebly|1and1|123-reg|wixpress|mailchimp|stripe|paypal)\.(com|net|org|io)$/i.test(dom)) continue;
    if (/(@|\.)(gmail|yahoo|hotmail|outlook|aol|btinternet|sky\.com|icloud|googlemail|protonmail|proton|live\.co|msn|ymail|gmx|mail\.com|tutanota)\./i.test(e)) continue;
    if (/(@|\.)(gmail|yahoo|hotmail|outlook|aol|btinternet|sky|icloud|googlemail|proton|live|msn)\.(com|co\.uk|net|org)$/i.test(e)) continue;
    if (out.indexOf(e) === -1) out.push(e);
  }
  return out;
}

function parseListings(html) {
  const out = []; const blocks = html.split(/<li class="listing clearFix/);
  for (let i = 1; i < blocks.length; i++) {
    const b = blocks[i];
    const web = (b.match(/class="listingHeadLink blue1BG website"[\s\S]*?href="(https?:\/\/[^"]+)"/) || [])[1] || '';
    let name = '';
    const n = (b.match(/href="\/search\/[^"]+\/([^/]+)\/\d+\/\d+"/) || [])[1];
    if (n) name = decodeURIComponent(n).replace(/-/g, ' ');
    if (web && name) out.push({ name: name.replace(/\s+/g, ' ').trim(), website: web.replace(/\/+$/, '') });
  }
  const seen = {}; return out.filter(x => { if (seen[x.website]) return false; seen[x.website] = 1; return true; });
}

async function findEmailOnSite(baseUrl) {
  const paths = ['', '/contact', '/contact-us', '/contactus', '/get-in-touch', '/about', '/about-us'];
  for (let p = 0; p < paths.length; p++) {
    const h = await get(baseUrl + paths[p], 10000);
    const em = extractEmails(h.html);
    const dom = new URL(baseUrl).hostname.replace(/^www\./, '').toLowerCase();
    const onDomain = em.filter(e => e.split('@')[1] === dom);
    const other = em.filter(e => e.split('@')[1] !== dom);
    if (onDomain.length) return onDomain[0];
    if (other.length) return other[0];
    if (h.status !== 200) break;
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function csv(s) { return '"' + String(s || '').replace(/"/g, '""') + '"'; }

function slugifyTown(town) { return town.toLowerCase().split(/[\s,]+/)[0].replace(/[^a-z]/g, '') || 'london'; }

// Progress per subtype stored at data/buyer-<subtype>.json  {doneTowns, sites: [{name,website,email}]}
async function runSubtype(id, target, maxTowns, maxPages) {
  const st = SUBTYPES[id];
  if (!st) { console.log('unknown subtype', id); return { id, status: 'unknown' }; }
  const stateFile = path.join(DATA_DIR, 'buyer-' + id + '.json');
  let state = { doneTowns: [], sites: [] };
  try { if (fs.existsSync(stateFile)) state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')); } catch (e) {}
  const towns = loadTowns();
  let sites = state.sites;
  let done = state.doneTowns;
  let byEmail = {}; sites.forEach(s => { if (s.email) byEmail[s.email] = 1; });

  const slug = st.slug;
  const slugs = [st.slug].concat(st.alts || []);
  const haveEmails = () => Object.keys(byEmail).length;

  outer:
  for (const town of towns) {
    if (done.includes(town)) continue;
    if (haveEmails() >= target) break;
    if (maxTowns && done.length >= maxTowns) break;
    done.push(town);
    const tSlug = slugifyTown(town);
    let listed = [];
    for (const cat of slugs) {
      for (let pg = 1; pg <= (maxPages || 4); pg++) {
        const url = `https://www.thomsonlocal.com/search/${cat}/${tSlug}?page=${pg}`;
        const t = await get(url, 10000);
        const list = parseListings(t.html);
        if (!list.length) break;
        listed = listed.concat(list);
        await sleep(180);
      }
    }
    // dedupe listed against sites seen
    const seenWeb = {}; sites.forEach(s => { seenWeb[s.website] = 1; });
    const newSites = listed.filter(l => !seenWeb[l.website]);
    console.log(`[${id}] ${town}: +${newSites.length} listed (running total ${sites.length}, emails ${haveEmails()})`);
    for (let i = 0; i < newSites.length && haveEmails() < target; i++) {
      const c = newSites[i];
      const em = await findEmailOnSite(c.website);
      sites.push({ name: c.name, website: c.website, email: em });
      if (em && !byEmail[em]) { byEmail[em] = 1; if (haveEmails() % 10 === 0) console.log(`    [${id}] ${haveEmails()} emails`); }
      await sleep(120);
    }
    // checkpoint per town
    fs.writeFileSync(stateFile, JSON.stringify({ doneTowns: done, sites }, null, 2));
    if (haveEmails() >= target) break outer;
  }

  // Write CSV
  const seenE = {}; const rows = [];
  sites.forEach(s => { if (s.email && !seenE[s.email]) { seenE[s.email] = 1; rows.push(csv(s.name) + ',' + csv(s.website) + ',' + csv(s.email)); } });
  const csvFile = path.join(DATA_DIR, 'buyer-' + id + '-emails.csv');
  fs.writeFileSync(csvFile, 'name,website,email\n' + rows.join('\n'));
  return { id, emails: Object.keys(byEmail).length, sites: sites.length, doneTowns: done.length, status: haveEmails() >= target ? 'target-met' : 'towns-exhausted' };
}

async function main() {
  const args = {}; process.argv.slice(2).forEach(a => { const m = a.match(/^--(\w+)=(.+)$/); if (m) args[m[1]] = m[2]; });
  const target = parseInt(args.target, 10) || 150;
  const maxTowns = parseInt(args.maxtowns, 10) || 0;
  const maxPages = parseInt(args.pages, 10) || 4;
  let ids = [];
  if (args.subtype) ids = [args.subtype];
  else if (args.product) ids = Object.keys(SUBTYPES).filter(id => SUBTYPES[id].product === args.product);
  else ids = Object.keys(SUBTYPES);

  console.log('Running', ids.length, 'subtypes, target', target, 'emails each');
  const results = [];
  for (const id of ids) {
    const r = await runSubtype(id, target, maxTowns, maxPages);
    console.log(`== RESULT ${r.id}: ${r.emails} emails / ${r.sites} sites / ${r.doneTowns} towns (${r.status})`);
    results.push(r);
  }
  console.log('ALL DONE');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
