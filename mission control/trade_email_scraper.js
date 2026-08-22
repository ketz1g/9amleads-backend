// trade_email_scraper.js
// Finds the NEWEST UK businesses (from the Companies House-backed newbusiness
// pool / CH API), classifies them by SIC code into the trades behind our 5 lead
// types, finds each company's contact EMAIL (via their website), and returns them
// for import into Brevo lists per trade — so we can run trade-specific campaigns.
//
// Flow: newest companies -> SIC -> trade -> website (search) -> email -> Brevo list.
const https = require('https');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'trade_emails_state.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36';

// ===== SIC -> TRADE classification (covers the trades behind our 5 lead types) =====
// Each trade maps to the 9amLeads lead type it is a customer FOR:
//   moving -> removals/storage  newbusiness -> accountants/web/marketing/etc
//   probate -> estate agents/solicitors  planning -> builders/trades  tenders -> construction/cleaning/security
const SIC_TRADE = {
  '41201': 'builders-trades', '41202': 'builders-trades', '41100': 'builders-trades', '41200': 'builders-trades',
  '42110': 'builders-trades', '42120': 'builders-trades', '42220': 'builders-trades', '42990': 'builders-trades',
  '43110': 'builders-trades', '43120': 'builders-trades', '43210': 'electricians-plumbers', '43220': 'electricians-plumbers',
  '43290': 'builders-trades', '43310': 'builders-trades', '43320': 'builders-trades', '43330': 'builders-trades',
  '43341': 'builders-trades', '43342': 'builders-trades', '43390': 'builders-trades', '43910': 'builders-trades',
  '43999': 'builders-trades',
  '69201': 'accountants', '69202': 'accountants', '69203': 'accountants', '69204': 'accountants',
  '62012': 'web-designers-developers', '62020': 'web-designers-developers', '62090': 'web-designers-developers', '62011': 'web-designers-developers',
  '49410': 'removals-storage', '49420': 'removals-storage', '52103': 'removals-storage',
  '81210': 'cleaning', '81221': 'cleaning', '81222': 'cleaning', '81299': 'cleaning',
  '80100': 'security', '80200': 'security',
  '68310': 'estate-agents', '68320': 'estate-agents',
  '69109': 'solicitors-legal', '69101': 'solicitors-legal', '69102': 'solicitors-legal',
  '73110': 'marketing', '73120': 'marketing', '73121': 'marketing', '74100': 'design',
  '70210': 'pr-communications', '70220': 'consultancy',
  '82990': 'other-business-services', '96090': 'other-services'
};
// SIC code prefix fallback (e.g. '43' -> builders-trades)
const SIC_PREFIX_TRADE = {
  '41': 'builders-trades', '43': 'builders-trades', '42': 'builders-trades',
  '69': 'accountants', '62': 'web-designers-developers',
  '49': 'removals-storage', '52': 'removals-storage',
  '81': 'cleaning', '80': 'security',
  '68': 'estate-agents', '69': 'solicitors-legal',
  '73': 'marketing', '74': 'design'
};

function classifyTrade(sic) {
  if (!sic) return 'other-services';
  var s = String(sic).replace(/\D/g, '').slice(0, 5);
  if (SIC_TRADE[s]) return SIC_TRADE[s];
  var pre = s.slice(0, 2);
  if (SIC_PREFIX_TRADE[pre]) return SIC_PREFIX_TRADE[pre];
  return 'other-services';
}

function httpGet(url, timeoutMs) {
  return new Promise(function(resolve) {
    var u;
    try { u = new URL(url); } catch(e) { resolve(''); return; }
    var r = https.request({ hostname: u.hostname, path: u.pathname + u.search, method: 'GET', headers: { 'User-Agent': UA, 'Accept': 'text/html,application/json', 'Accept-Language': 'en-GB,en;q=0.9' }, timeout: timeoutMs || 20000 }, function(res) {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) { res.resume(); var n = res.headers.location; if (n.startsWith('/')) n = 'https://' + u.hostname + n; httpGet(n, timeoutMs).then(resolve); return; }
      var b = ''; res.on('data', function(c) { if (b.length < 900000) b += c; }); res.on('end', function() { resolve(b); });
    });
    r.on('error', function() { resolve(''); });
    r.setTimeout(timeoutMs || 20000, function() { r.destroy(); resolve(''); });
    r.end();
  });
}

function extractEmails(html) {
  var out = [];
  var re = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
  var m;
  while ((m = re.exec(html)) !== null) {
    var e = m[0].toLowerCase();
    if (/\b(example|test|noreply|no-reply|sent|domain)\b/.test(e)) continue;
    if (e.indexOf('.png') !== -1 || e.indexOf('.jpg') !== -1 || e.indexOf('@2x') !== -1) continue;
    if (out.indexOf(e) === -1) out.push(e);
  }
  return out;
}

// Find a company's email: try (1) a direct domain guess, (2) DuckDuckGo results
// including directory pages (Endole etc. sometimes list the contact email).
// Returns [{ email, website }].
async function findCompanyEmail(companyName, webCache) {
  var name = String(companyName || '').replace(/[^a-zA-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!name || name.length < 4) return [];
  var found = [];
  // 1) Direct domain guess from the name.
  var slug = name.toLowerCase().replace(/[^a-z0-9]/g, '').replace(/ltd|limited|co$|com$|uk$|llp$/g, '').replace(/[^a-z0-9]/g, '');
  if (slug.length >= 4) {
    for (var gi = 0; gi < 3 && !found.length; gi++) {
      var gHost = gi === 0 ? ('www.' + slug + '.co.uk') : gi === 1 ? ('www.' + slug + '.com') : (slug + '.co.uk');
      var gUrl = 'https://' + gHost;
      var g = await httpGet(gUrl);
      if (g && g.length > 800 && !/404|not found/i.test(g.substring(0, 500))) {
        var gEmails = extractEmails(g);
        if (!gEmails.length) { var gc = await httpGet(gUrl + '/contact'); gEmails = extractEmails(gc); }
        if (gEmails.length) found = gEmails.map(function(e) { return { email: e, website: gUrl }; });
        break;
      }
      await new Promise(function(r) { setTimeout(r, 250); });
    }
  }
  // 2) DuckDuckGo search (including directory results which sometimes list emails).
  if (!found.length) {
    var q = encodeURIComponent(name + ' contact email');
    var search = await httpGet('https://html.duckduckgo.com/html/?q=' + q);
    var raw = search.match(/uddg=([^"&]+)/g) || [];
    var urls = raw.map(function(x) { try { return decodeURIComponent(x.replace('uddg=', '')); } catch(e) { return ''; } }).filter(function(u) {
      if (!u || !/^https?:\/\//.test(u)) return false;
      if (/duckduckgo|youtube|facebook|linkedin|twitter|x\.com|instagram|find-and-update|companieshouse/.test(u)) return false;
      return true;
    });
    for (var i = 0; i < urls.length && i < 5 && !found.length; i++) {
      var site = urls[i].split('/').slice(0, 3).join('/');
      if (webCache[site]) continue;
      var home = await httpGet(urls[i]);
      var emails = extractEmails(home);
      if (!emails.length) { var c2 = await httpGet(urls[i].replace(/\/$/, '') + '/contact'); emails = extractEmails(c2); }
      if (emails.length) found = emails.map(function(e) { return { email: e, website: site }; });
      webCache[site] = true;
      await new Promise(function(r) { setTimeout(r, 300); });
    }
  }
  return found.slice(0, 2);
}

// Load the newest companies from the newbusiness pool (Companies House-backed).
async function loadNewestPoolCompanies(maxCount) {
  try {
    var poolFile = path.join(DATA_DIR, 'newbusiness-leads.json');
    if (!fs.existsSync(poolFile)) return [];
    var pool = JSON.parse(fs.readFileSync(poolFile, 'utf-8'));
    if (!Array.isArray(pool)) pool = pool.newbusiness || [];
    // Sort by incorporationDate desc, take the newest
    pool.sort(function(a, b) { return String(b.incorporationDate || b.scrapedAt || '').localeCompare(String(a.incorporationDate || a.scrapedAt || '')); });
    return pool.slice(0, maxCount || 300);
  } catch(e) { return []; }
}

// Brevo helpers
function brevoReq(method, pathName, body) {
  return new Promise(function(resolve) {
    var data = body ? JSON.stringify(body) : null;
    var h = { 'api-key': process.env.BREVO_API_KEY || '', 'Accept': 'application/json' };
    if (data) { h['Content-Length'] = Buffer.byteLength(data); h['Content-Type'] = 'application/json'; }
    var r = https.request({ hostname: 'api.brevo.com', port: 443, method: method, path: pathName, headers: h }, function(res) { var b=''; res.on('data', function(c){b+=c;}); res.on('end', function(){ resolve({ status: res.statusCode, body: b }); }); });
    r.on('error', function(e) { resolve({ status: 0, body: String(e) }); });
    if (data) r.write(data); r.end();
  });
}

// Ensure a Brevo list exists for a trade, returning its id.
var _brevoListCache = {};
async function ensureBrevoList(trade) {
  if (_brevoListCache[trade]) return _brevoListCache[trade];
  var name = 'Trades - ' + trade.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
  try {
    var lists = JSON.parse((await brevoReq('GET', '/v3/contacts/lists?limit=50')).body).lists || [];
    var existing = lists.find(function(l) { return String(l.name).toLowerCase() === name.toLowerCase(); });
    if (existing) { _brevoListCache[trade] = existing.id; return existing.id; }
    var created = JSON.parse((await brevoReq('POST', '/v3/contacts/lists', { name: name, folderId: 2 })).body);
    _brevoListCache[trade] = created.id;
    return created.id;
  } catch(e) { return null; }
}

async function importToBrevo(trade, contacts) {
  if (!contacts.length) return 0;
  var listId = await ensureBrevoList(trade);
  if (!listId) return 0;
  var imp = await brevoReq('POST', '/v3/contacts/import', {
    listIds: [listId],
    emailBlacklist: false,
    updateExistingContacts: false,
    contacts: contacts.map(function(c) { return { email: c.email, attributes: { COMPANYNAME: c.company, TRADE: trade } }; })
  });
  return imp.status === 202 ? contacts.length : 0;
}

// Main entry: newest pool companies -> classify -> find emails -> Brevo lists.
async function collectTradeEmails(maxCompanies, useBrevo) {
  var companies = await loadNewestPoolCompanies(maxCompanies || 300);
  var webCache = {};
  var found = [];
  for (var i = 0; i < companies.length; i++) {
    var c = companies[i];
    var name = c.companyName || c.name || c.company || '';
    var sic = c.sicCode || c.sic_codes || '';
    var trade = classifyTrade(sic);
    var res = await findCompanyEmail(name, webCache);
    res.forEach(function(r) { found.push({ company: name, trade: trade, email: r.email, website: r.website, sic: sic }); });
    if (i % 20 === 0) console.log('[TRADE-EMAIL] checked ' + i + '/' + companies.length + ' found ' + found.length);
  }
  // Dedupe
  var seen = {}; var deduped = [];
  found.forEach(function(f) { if (f.email && !seen[f.email]) { seen[f.email] = 1; deduped.push(f); } });
  console.log('[TRADE-EMAIL] total found emails: ' + deduped.length);
  // Import to Brevo per trade
  if (useBrevo) {
    var byTrade = {};
    deduped.forEach(function(f) { (byTrade[f.trade] = byTrade[f.trade] || []).push(f); });
    for (var t in byTrade) {
      var n = await importToBrevo(t, byTrade[t]);
      console.log('[TRADE-EMAIL] Brevo import ' + t + ': ' + n);
    }
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify({ last_run: new Date().toISOString(), companies_checked: companies.length, emails_found: deduped.length }, null, 2));
  return { success: true, checked: companies.length, emails_found: deduped.length, samples: deduped.slice(0, 10) };
}

module.exports = { collectTradeEmails, classifyTrade };
