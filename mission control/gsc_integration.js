/**
 * 9amLeads Google Search Console integration (OAuth2, no external deps).
 *
 * Flow: owner adds OAuth client credentials (client_id/client_secret) either via
 * Render env (GSC_CLIENT_ID / GSC_CLIENT_SECRET) or the admin panel, then clicks
 * "Connect with Google". The browser hits the Google consent screen, Google
 * redirects to /api/admin/gsc/callback, we exchange the code for tokens, store
 * them on the persistent data disk, auto-pick the 9amleads.com property, and the
 * admin can then read search-analytics (clicks / impressions / ctr / position).
 *
 * All HTTP is raw Node https — no googleapis dependency, matching the codebase.
 */

var https = require('https');
var path = require('path');
var fs = require('fs');
var crypto = require('crypto');

var TOKEN_HOST = 'oauth2.googleapis.com';
var AUTH_HOST = 'accounts.google.com';
var SITE_LIST_HOST = 'searchconsole.googleapis.com';
var SCOPE = 'https://www.googleapis.com/auth/webmasters.readonly';

// The persistent data dir is resolved the same way production_api_server.js does.
function resolveDataDir() {
  var d = path.join(__dirname, 'data');
  if (!fs.existsSync(d)) {
    var alt = path.join(__dirname, '..', 'mission control', 'data');
    if (fs.existsSync(alt)) d = alt;
  }
  return d;
}
var DATA_DIR = process.env.GSC_DATA_DIR || resolveDataDir();
var CONFIG_PATH = process.env.GSC_CONFIG_PATH || path.join(DATA_DIR, 'gsc-config.json');

// Public redirect base: the canonical (apex) host used by Netlify + the /api proxy.
// Override with GSC_PUBLIC_BASE if the site is ever served from a different host.
var PUBLIC_BASE = (process.env.GSC_PUBLIC_BASE || 'https://9amleads.com').replace(/\/+$/, '');
var REDIRECT_URI = (process.env.GSC_REDIRECT_URI || PUBLIC_BASE + '/api/admin/gsc/callback');

function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch (e) { return {}; }
}
function saveConfig(cfg) {
  try {
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
    return true;
  } catch (e) { console.log('[GSC] Could not save config:', e.message); return false; }
}
function updateConfig(patch) {
  var cfg = loadConfig();
  Object.keys(patch).forEach(function (k) { cfg[k] = patch[k]; });
  saveConfig(cfg);
  return cfg;
}

// Credentials: env wins, then config file. Callers may pass explicit overrides.
function getCredentials(overrides) {
  var cfg = loadConfig();
  return {
    client_id: overrides && overrides.client_id ? overrides.client_id : (process.env.GSC_CLIENT_ID || cfg.client_id || ''),
    client_secret: overrides && overrides.client_secret ? overrides.client_secret : (process.env.GSC_CLIENT_SECRET || cfg.client_secret || ''),
    redirect_uri: (overrides && overrides.redirect_uri) || process.env.GSC_REDIRECT_URI || cfg.redirect_uri || REDIRECT_URI
  };
}
function isConfigured(creds) {
  creds = creds || getCredentials();
  return !!(creds.client_id && creds.client_secret);
}
function isConnected() {
  var cfg = loadConfig();
  return !!(cfg.refresh_token && cfg.property);
}

// ---- generic https helper (form or JSON) ----
function httpsRequest(opts, body, formEncode) {
  return new Promise(function (resolve, reject) {
    var data = null;
    var headers = opts.headers || {};
    if (body !== undefined && body !== null) {
      data = formEncode ? require('querystring').stringify(body) : JSON.stringify(body);
      headers['Content-Length'] = Buffer.byteLength(data);
      headers['Content-Type'] = formEncode ? 'application/x-www-form-urlencoded' : 'application/json';
    }
    var req = https.request({
      hostname: opts.hostname,
      path: opts.path,
      method: opts.method || 'GET',
      headers: headers,
      timeout: opts.timeout || 25000
    }, function (res) {
      var b = '';
      res.on('data', function (c) { b += c; });
      res.on('end', function () { resolve({ status: res.statusCode, body: b, headers: res.headers }); });
    });
    req.on('error', function (e) { reject(e); });
    req.setTimeout(opts.timeout || 25000, function () { req.destroy(new Error('timeout')); });
    if (data) req.write(data);
    req.end();
  });
}
function parseJson(body) {
  try { return JSON.parse(body); } catch (e) { return { __raw: body }; }
}

// ---- OAuth token endpoints ----
function exchangeCode(code, redirectUri, creds) {
  return httpsRequest({ hostname: TOKEN_HOST, path: '/token', method: 'POST' },
    { grant_type: 'authorization_code', code: code, redirect_uri: redirectUri || creds.redirect_uri, client_id: creds.client_id, client_secret: creds.client_secret }, true);
}
function refreshAccess(refreshToken, creds) {
  return httpsRequest({ hostname: TOKEN_HOST, path: '/token', method: 'POST' },
    { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: creds.client_id, client_secret: creds.client_secret }, true);
}

// Make sure we hold a valid (non-expired) access token, refreshing if needed.
async function ensureToken(creds) {
  creds = creds || getCredentials();
  var cfg = loadConfig();
  if (!cfg.access_token) throw new Error('Not connected to Google Search Console yet.');
  var expiresAt = parseInt(cfg.expires_at || 0, 10);
  // Refresh if no expiry recorded or it expires within 60s.
  if (!expiresAt || Date.now() > expiresAt - 60000) {
    if (!cfg.refresh_token) throw new Error('No refresh token available — reconnect Google Search Console.');
    var r = await refreshAccess(cfg.refresh_token, creds);
    var j = parseJson(r.body);
    if (r.status !== 200 || !j.access_token) throw new Error('Token refresh failed (' + r.status + '): ' + String(j.error_description || j.error || '').slice(0, 200));
    updateConfig({
      access_token: j.access_token,
      refresh_token: j.refresh_token || cfg.refresh_token,
      expires_at: String(Date.now() + (parseInt(j.expires_in, 10) || 3600) * 1000)
    });
    return j.access_token;
  }
  return cfg.access_token;
}

// ---- GSC API (Search Console) ----
async function gscRequest(method, pathStr, body) {
  var token = await ensureToken();
  var r = await httpsRequest({
    hostname: SITE_LIST_HOST,
    path: pathStr,
    method: method || 'POST',
    headers: { Authorization: 'Bearer ' + token }
  }, body, false);
  return { status: r.status, json: parseJson(r.body) };
}

async function listSites() {
  var r = await gscRequest('GET', '/webmasters/v3/sites');
  return r;
}
// Auto-pick the 9amLeads property: prefer sc-domain, then a siteUrl containing
// 9amleads.com, else the first site the account owns.
function pickProperty(sites, preferred) {
  if (!Array.isArray(sites)) sites = [];
  if (preferred) {
    var exact = sites.find(function (s) { return s.siteUrl === preferred; });
    if (exact) return exact.siteUrl;
  }
  var pref = sites.filter(function (s) { return /sc-domain:9amleads\.com/.test(s.siteUrl); }).map(function (s) { return s.siteUrl; });
  if (pref.length) return pref[0];
  var anyHost = sites.filter(function (s) { return /9amleads\.com/.test(s.siteUrl); }).map(function (s) { return s.siteUrl; });
  if (anyHost.length) return anyHost[0];
  return sites.length ? sites[0].siteUrl : '';
}

async function searchAnalytics(siteUrl, startDate, endDate, dims, rowLimit) {
  var body = { startDate: startDate, endDate: endDate };
  if (dims && dims.length) body.dimensions = dims;
  if (rowLimit) body.rowLimit = rowLimit;
  var enc = encodeURIComponent(siteUrl);
  var r = await gscRequest('POST', '/webmasters/v3/sites/' + enc + '/searchAnalytics/query', body);
  return r;
}

function isoDaysAgo(n) {
  var d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
}

// Pull a dashboard snapshot: totals, top queries, top pages, top countries (optional).
async function fetchDashboard(days, siteUrl) {
  days = parseInt(days, 10) || 28;
  var cfg = loadConfig();
  var prop = siteUrl || cfg.property || '';
  if (!prop) {
    var sites = await listSites();
    prop = pickProperty(sites.json && sites.json.siteEntry, null);
    if (!prop) throw new Error('No Search Console property available — verify 9amleads.com in Google Search Console first.');
    updateConfig({ property: prop });
  }
  var end = isoDaysAgo(1); // GSC data lags ~2 days; yesterday is the latest meaningful end.
  var start = isoDaysAgo(days);
  var totals = await searchAnalytics(prop, start, end, [], null);
  var queries = await searchAnalytics(prop, start, end, ['query'], 20);
  var pages = await searchAnalytics(prop, start, end, ['page'], 10);
  var daily = await searchAnalytics(prop, start, end, ['date'], days);

  function rows(r) { return r.json && r.json.rows ? r.json.rows : []; }
  var tRows = rows(totals);
  var t = tRows.length ? tRows[0] : null;
  return {
    property: prop,
    startDate: start,
    endDate: end,
    days: days,
    totals: {
      clicks: t ? Math.round((t.clicks || 0)) : 0,
      impressions: t ? Math.round((t.impressions || 0)) : 0,
      ctr: t ? roundPct(t.ctr) : 0,
      position: t ? round1(t.position) : 0
    },
    topQueries: rows(queries).map(function (q) { return { query: q.keys[0], clicks: Math.round(q.clicks || 0), impressions: Math.round(q.impressions || 0), ctr: roundPct(q.ctr), position: round1(q.position) }; }),
    topPages: rows(pages).map(function (p) { return { page: p.keys[0], clicks: Math.round(p.clicks || 0), impressions: Math.round(p.impressions || 0), ctr: roundPct(p.ctr), position: round1(p.position) }; }),
    daily: rows(daily).map(function (d) { return { date: d.keys[0], clicks: Math.round(d.clicks || 0), impressions: Math.round(d.impressions || 0), position: round1(d.position) }; })
  };
}

function roundPct(v) { v = parseFloat(v); return v ? Math.round(v * 1000) / 10 : 0; }
function round1(v) { v = parseFloat(v); return v ? Math.round(v * 10) / 10 : 0; }

module.exports = {
  getCredentials: getCredentials,
  isConfigured: isConfigured,
  isConnected: isConnected,
  loadConfig: loadConfig,
  updateConfig: updateConfig,
  saveConfig: saveConfig,
  exchangeCode: exchangeCode,
  ensureToken: ensureToken,
  listSites: listSites,
  pickProperty: pickProperty,
  searchAnalytics: searchAnalytics,
  fetchDashboard: fetchDashboard,
  PUBLIC_BASE: PUBLIC_BASE,
  REDIRECT_URI: REDIRECT_URI,
  SCOPE: SCOPE,
  CONFIG_PATH: CONFIG_PATH
};
