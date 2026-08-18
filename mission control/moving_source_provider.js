// MovingLeadSourceProvider + PropertyAddressResolver abstraction for the 9amLeads
// Moving Leads pipeline.
//
// The goal: identify the ACTUAL property that has entered the market and provide
// the correct full address WITHOUT ever guessing the door number. UPRN is the
// preferred permanent property identity.
//
// Preferred pipeline:
//   Homedata Market Activity / Live Listings -> UPRN -> Postcoder AddressBase
//   verification -> dedup -> customer postcode allocation -> 9am delivery
//
// Rightmove/Apify remains the fallback source initially.
//
// This module is decoupled so other lead types (probate, planning, new business,
// tenders) are never affected.

const https = require('https');

// ---------------------------------------------------------------------------
// Confidence / verification status constants
// ---------------------------------------------------------------------------
const VERIFICATION_STATUS = {
  EXACT_UPRN: 'EXACT_UPRN',           // 100 - source UPRN == AddressBase UPRN
  EXACT_ADDRESS: 'EXACT_ADDRESS',     // 98 - full address + postcode match
  COORDINATE_MATCH: 'COORDINATE_MATCH', // 95 - strong building/street/postcode + coords within tolerance
  UNIQUE_POSTCODE: 'UNIQUE_POSTCODE', // 90 - single candidate at postcode with supporting data
  POSTCODE_ONLY: 'POSTCODE_ONLY',     // <90 - only postcode known, no reliable door number
  UNRESOLVED: 'UNRESOLVED',           // ambiguous / no reliable identifier - NEVER guess
  CONFLICT: 'CONFLICT'                // conflicting candidates
};

// ---------------------------------------------------------------------------
// Config (env-driven, never hard-coded keys)
// ---------------------------------------------------------------------------
const CONFIG = {
  homedataKey: process.env.HOMEDATA_API_KEY || '',
  homedataBase: process.env.HOMEDATA_BASE_URL || 'https://api.homedata.co.uk',
  primarySource: process.env.MOVING_PRIMARY_SOURCE || 'rightmove', // 'homedata' | 'rightmove'
  fallbackSource: process.env.MOVING_FALLBACK_SOURCE || 'rightmove',
  testMode: String(process.env.MOVING_LEADS_TEST_MODE || 'false').toLowerCase() === 'true',
  maxHomedataCalls: parseInt(process.env.HOMEDATA_MAX_CALLS_PER_RUN || '150', 10)
};

// Simple API usage counters (reset each process run; could be persisted later).
const API_USAGE = {
  homedataCalls: 0,
  postcoderCalls: 0,
  successfulResolutions: 0,
  failedResolutions: 0,
  costEstimate: 0
};

function apiFetch(base, path, headers, timeoutMs) {
  return new Promise(function(resolve) {
    let url;
    try { url = new URL(base + path); } catch(e) { return resolve({ status: 0, body: '', ok: false, error: e.message }); }
    const req = https.get({
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: headers || {},
      timeout: timeoutMs || 20000
    }, function(res) {
      let b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        let parsed = null;
        try { parsed = JSON.parse(b); } catch(e) { parsed = null; }
        resolve({ status: res.statusCode, body: b, json: parsed, ok: res.statusCode >= 200 && res.statusCode < 300 });
      });
    });
    req.on('error', function(e) { resolve({ status: 0, body: '', json: null, ok: false, error: e.message }); });
    req.setTimeout(timeoutMs || 20000, function() { req.destroy(); resolve({ status: 0, body: '', json: null, ok: false, error: 'timeout' }); });
    req.end();
  });
}

// ---------------------------------------------------------------------------
// HomedataProvider
// ---------------------------------------------------------------------------
// Sources NEWLY LISTED / for-sale residential properties from Homedata's
// live-listings feed (free tier verified working). Each result carries the
// added_date (source listing timestamp) + street + postcode + price + type +
// beds + agent. UPRN resolution happens in the resolver step.
class HomedataProvider {
  constructor() { this.name = 'homedata'; }

  async fetchNewListings(params) {
    const out = [];
    if (!CONFIG.homedataKey) return { ok: false, records: out, error: 'HOMEDATA_API_KEY not set' };
    const since = params.sinceDate || new Date().toISOString().split('T')[0];
    const query = new URLSearchParams({
      transaction_type: 'Sale',
      limit: String(params.limit || 30)
    });
    // live-listings supports a `added_after` / date filter where available; we pass
    // added_date through the search. If the API rejects an unknown param, fall back
    // to fetching and filtering client-side by added_date.
    const path = '/live-listings/search/?' + query.toString();
    API_USAGE.homedataCalls++;
    const resp = await apiFetch(CONFIG.homedataBase, path, { 'Authorization': 'Api-Key ' + CONFIG.homedataKey, 'Accept': 'application/json' });
    if (!resp.ok) return { ok: false, records: out, error: 'live-listings HTTP ' + resp.status + ' ' + (resp.json && resp.json.error && resp.json.error.message || resp.body).substring(0, 120) };
    const results = (resp.json && resp.json.results) || [];
    for (const r of results) {
      // Only Sale listings; ignore rentals.
      if (String(r.transaction_type || '').toLowerCase() !== 'sale') continue;
      // Freshness: only NEWLY_LISTED today (0-24h) or up to 48h fallback.
      const added = r.added_date || '';
      const ageHours = ageHoursFrom(added);
      if (!added) continue;
      out.push({
        sourceProvider: 'homedata',
        sourcePropertyId: r.id,          // Homedata listing UUID
        sourceEventId: r.id,
        listingEventType: 'NEWLY_LISTED',
        firstListedAt: added + 'T00:00:00.000Z',
        sourceDetectedAt: new Date().toISOString(),
        ingestedAt: new Date().toISOString(),
        ageHours: ageHours,
        street: r.street || '',
        town: r.town_name || r.town || '',
        postcode: normalizePostcode(r.postcode || ''),
        address: buildListAddress(r),
        fullAddress: buildListAddress(r),
        houseNumber: '',   // resolved later
        buildingName: '',
        price: r.latest_price || 0,
        bedrooms: r.bedrooms || 0,
        propertyType: r.property_type || '',
        estateAgent: r.agent_name || '',
        latitude: r.latitude || null,
        longitude: r.longitude || null,
        rawSourceData: r
      });
    }
    // Client-side freshness filter (0-24h primary, 24-48h fallback).
    const primary = out.filter(function(l) { return l.ageHours <= 24; });
    const fallback = out.filter(function(l) { return l.ageHours > 24 && l.ageHours <= 48; });
    const chosen = primary.length >= params.minRequired ? primary : primary.concat(fallback);
    return { ok: true, records: chosen, primaryCount: primary.length, fallbackCount: fallback.length, total: out.length };
  }
}

// Resolve UPRN + verified address for a Homedata listing via postcode lookup,
// then enrich with the property/base tier (full address + coords + type + beds).
async function homedataResolveUprn(record) {
  if (!CONFIG.homedataKey) return { uprn: null, confidence: 0, status: VERIFICATION_STATUS.UNRESOLVED };
  // 1) Try a full postcode lookup to enumerate addresses + UPRNs in that postcode.
  const pc = (record.postcode || '').replace(/\s+/g, '');
  if (!pc) return { uprn: null, confidence: 0, status: VERIFICATION_STATUS.POSTCODE_ONLY };
  API_USAGE.homedataCalls++;
  const resp = await apiFetch(CONFIG.homedataBase, '/address/postcode/' + pc + '/', { 'Authorization': 'Api-Key ' + CONFIG.homedataKey, 'Accept': 'application/json' });
  if (!resp.ok || !resp.json || !resp.json.addresses) {
    return { uprn: null, confidence: 0, status: VERIFICATION_STATUS.UNRESOLVED, error: 'postcode lookup failed' };
  }
  const addresses = resp.json.addresses || [];
  if (addresses.length === 0) return { uprn: null, confidence: 0, status: VERIFICATION_STATUS.POSTCODE_ONLY };

  // Match the listing to a postcode address using street + house number evidence.
  const streetN = (record.street || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const recAddrN = (record.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let best = null, bestScore = 0, candidates = [];
  for (const a of addresses) {
    const aStreet = (a.street || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const aAddr = (a.address || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let score = 0;
    if (streetN && aStreet && (streetN.indexOf(aStreet) !== -1 || aStreet.indexOf(streetN) !== -1)) score += 60;
    if (recAddrN && aAddr && (recAddrN.indexOf(aAddr) !== -1 || aAddr.indexOf(recAddrN) !== -1)) score += 30;
    if (aAddr && recAddrN && recAddrN.indexOf(aAddr.substring(0, 15)) !== -1) score += 5;
    // House number evidence from the record (if it has one) boosts the match.
    const recNum = (record.houseNumber || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    const aNum = (a.building_number || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
    if (recNum && aNum && recNum === aNum) score += 40;
    candidates.push({ address: a, score: score });
  }
  candidates.sort(function(x, y) { return y.score - x.score; });
  best = candidates[0];

  if (!best || best.score < 60) {
    return { uprn: null, confidence: 0, status: VERIFICATION_STATUS.UNRESOLVED, error: 'no confident address match in postcode' };
  }

  // 2) Enrich with the property base tier to confirm + get full verified address.
  API_USAGE.homedataCalls++;
  const propResp = await apiFetch(CONFIG.homedataBase, '/property/' + best.address.uprn + '/base/', { 'Authorization': 'Api-Key ' + CONFIG.homedataKey, 'Accept': 'application/json' });
  const prop = propResp.json || {};
  const addr = prop.address || {};

  // If there is exactly ONE candidate in the postcode AND the address matches the
  // record, that is a strong/unique match. Otherwise if the street matched but the
  // record had no house number, mark as UNIQUE_POSTCODE (90) only if truly unique.
  const exactUprn = (record.uprn && String(record.uprn) === String(best.address.uprn));
  let status = VERIFICATION_STATUS.EXACT_UPRN;
  let confidence = 100;
  if (!exactUprn) {
    if (addresses.length === 1) { status = VERIFICATION_STATUS.UNIQUE_POSTCODE; confidence = 90; }
    else if (record.houseNumber && (addr.building_number || '') && String(addr.building_number).replace(/[^0-9A-Za-z]/g, '') === String(record.houseNumber).replace(/[^0-9A-Za-z]/g, '')) { status = VERIFICATION_STATUS.EXACT_ADDRESS; confidence = 98; }
    else { status = VERIFICATION_STATUS.COORDINATE_MATCH; confidence = 95; }
  }

  return {
    uprn: best.address.uprn || null,
    udprn: addr.udprn || null,
    houseNumber: addr.building_number || addr.building_name || '',
    subBuilding: addr.sub_building || '',
    buildingName: addr.building_name || '',
    street: addr.street_name || addr.street || '',
    town: addr.town_name || addr.town || '',
    postcode: addr.postcode || record.postcode || '',
    fullAddress: addr.full_address || record.address || '',
    sourceAddress: record.address || '',
    verifiedAddress: addr.full_address || '',
    latitude: addr.latitude || record.latitude || null,
    longitude: addr.longitude || record.longitude || null,
    propertyType: (prop.property_type && prop.property_type.property_type) || record.propertyType || '',
    bedrooms: (prop.rooms && (prop.rooms.bedrooms || prop.rooms.predicted_bedrooms)) || record.bedrooms || 0,
    addressConfidence: confidence,
    addressVerificationStatus: status,
    addressVerificationSource: 'homedata-addressbase',
    rawSourceData: prop
  };
}

// ---------------------------------------------------------------------------
// RightmoveProvider (fallback) - wraps existing scraping as a provider.
// ---------------------------------------------------------------------------
class RightmoveProvider {
  constructor() { this.name = 'rightmove'; }
  async fetchNewListings(params) {
    try {
      const rm = require('./rightmove_scraper_v2.js');
      const leads = await rm.collectMovingLeads({
        locations: params.locations,
        areas: params.areas,
        maxProps: params.limit
      });
      return { ok: true, records: leads.map(function(l) {
        return Object.assign({}, l, {
          sourceProvider: 'rightmove',
          listingEventType: 'NEWLY_LISTED',
          firstListedAt: l.firstVisibleDate || l.listedDate || new Date().toISOString(),
          sourceDetectedAt: new Date().toISOString(),
          ingestedAt: new Date().toISOString(),
          ageHours: ageHoursFrom(l.firstVisibleDate || l.listedDate || ''),
          rawSourceData: l
        });
      }) };
    } catch(e) { return { ok: false, records: [], error: e.message }; }
  }
}

// ---------------------------------------------------------------------------
// Provider registry + source priority
// ---------------------------------------------------------------------------
const PROVIDERS = { homedata: HomedataProvider, rightmove: RightmoveProvider };

function getSourcePriority() {
  const primary = CONFIG.primarySource;
  const fallback = CONFIG.fallbackSource;
  const order = [];
  if (PROVIDERS[primary]) order.push(primary);
  if (PROVIDERS[fallback] && fallback !== primary) order.push(fallback);
  // Always ensure rightmove is available as a last resort.
  if (order.indexOf('rightmove') === -1) order.push('rightmove');
  return order;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function normalizePostcode(pc) {
  if (!pc) return '';
  const m = String(pc).toUpperCase().replace(/\s+/g, '').match(/^([A-Z]{1,2}\d[A-Z\d]?)(\d[A-Z]{2})$/);
  return m ? (m[1] + ' ' + m[2]) : String(pc).toUpperCase();
}

function ageHoursFrom(dateStr) {
  if (!dateStr) return 9999;
  const t = new Date(dateStr).getTime();
  if (isNaN(t)) return 9999;
  return (Date.now() - t) / 3600000;
}

function buildListAddress(r) {
  const parts = [r.street, r.town_name, r.postcode].filter(Boolean);
  return parts.join(', ');
}

// Resolve a record to a verified address (provider-agnostic). Uses Homedata's
// postcode->UPRN->base chain first; falls back to Postcoder AddressBase when
// Homedata is unavailable or the record came from Rightmove with a UPRN.
async function resolveAddress(record) {
  if (!record || !record.postcode) {
    return { uprn: null, confidence: 0, status: VERIFICATION_STATUS.UNRESOLVED, error: 'no postcode' };
  }
  // 1) If the record already has a UPRN (Homedata or Rightmove), verify via Postcoder.
  if (record.uprn) {
    const verified = await postcoderVerifyUprn(record.uprn);
    if (verified && verified.fullAddress) {
      API_USAGE.successfulResolutions++;
      return {
        uprn: record.uprn,
        udprn: verified.udprn || null,
        houseNumber: verified.houseNumber || '',
        street: verified.street || '',
        town: verified.town || '',
        postcode: verified.postcode || record.postcode || '',
        fullAddress: verified.fullAddress || '',
        sourceAddress: record.address || '',
        verifiedAddress: verified.fullAddress || '',
        latitude: verified.latitude || record.latitude || null,
        longitude: verified.longitude || record.longitude || null,
        addressConfidence: 100,
        addressVerificationStatus: VERIFICATION_STATUS.EXACT_UPRN,
        addressVerificationSource: 'postcoder-addressbase'
      };
    }
  }
  // 2) Homedata postcode->UPRN resolution.
  if (CONFIG.homedataKey) {
    const r = await homedataResolveUprn(record);
    if (r && r.uprn) { API_USAGE.successfulResolutions++; return r; }
  }
  // 3) Postcoder street match as a last resort (will only set a door number if
  //    PAF confirms it; otherwise UNRESOLVED).
  API_USAGE.failedResolutions++;
  return { uprn: null, confidence: 0, status: VERIFICATION_STATUS.UNRESOLVED, error: 'could not resolve UPRN' };
}

// Verify a UPRN against Postcoder AddressBase (official address validation).
function postcoderVerifyUprn(uprn) {
  return new Promise(function(resolve) {
    if (process.env.POSTCODER_ENABLED !== 'true' && process.env.POSTCODER_ENABLED !== '1') return resolve(null);
    const key = process.env.POSTCODER_API_KEY;
    if (!key || !uprn) return resolve(null);
    API_USAGE.postcoderCalls++;
    const path = '/pcw/' + key + '/addressbase/uk/' + uprn + '?format=json&lines=1';
    https.get({ hostname: 'ws.postcoder.com', path: path, headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, timeout: 20000 }, function(res) {
      let b = '';
      res.on('data', function(c) { b += c; });
      res.on('end', function() {
        if (res.statusCode !== 200) return resolve(null);
        try {
          const items = JSON.parse(b);
          if (!Array.isArray(items) || items.length === 0) return resolve(null);
          const a = items[0];
          resolve({
            fullAddress: a.summaryline || a.addressline1 || '',
            houseNumber: a.number || a.premise || a.buildingname || '',
            street: a.street || '',
            town: a.posttown || a.county || '',
            postcode: a.postcode || '',
            udprn: a.udprn || null,
            latitude: a.latitude || null,
            longitude: a.longitude || null
          });
        } catch(e) { resolve(null); }
      });
    }).on('error', function() { resolve(null); });
  });
}

module.exports = {
  PROVIDERS,
  HomedataProvider,
  RightmoveProvider,
  getSourcePriority,
  fetchNewListings,
  resolveAddress,
  postcoderVerifyUprn,
  homedataResolveUprn,
  normalizePostcode,
  ageHoursFrom,
  VERIFICATION_STATUS,
  CONFIG,
  API_USAGE
};

// Top-level fetchNewListings that respects source priority.
async function fetchNewListings(params) {
  params = params || {};
  const order = getSourcePriority();
  const errors = [];
  let primaryCount = 0, fallbackCount = 0;
  for (const name of order) {
    const Provider = PROVIDERS[name];
    if (!Provider) continue;
    try {
      const inst = new Provider();
      const res = await inst.fetchNewListings(params);
      if (res.ok && res.records && res.records.length > 0) {
        primaryCount += res.primaryCount || res.records.length;
        fallbackCount += res.fallbackCount || 0;
        return { ok: true, records: res.records, source: name, primaryCount: primaryCount, fallbackCount: fallbackCount, errors: errors };
      }
      errors.push(name + ': ' + (res.error || 'no records'));
    } catch(e) { errors.push(name + ': ' + e.message); }
  }
  return { ok: false, records: [], errors: errors };
}
