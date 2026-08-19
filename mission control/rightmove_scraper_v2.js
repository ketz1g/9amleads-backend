// Rightmove Direct Scraper v2
// Extracts property data from __NEXT_DATA__ embedded in search HTML
// No Apify required - completely free

const https = require('https');

// Lightweight usage ledger (pages, searches, Apify runs, new/known props).
function _usageInc(field, n) {
  try { require('./scraper_usage').inc(field, n); } catch(e) {}
}

// Full-UK coverage: Rightmove's 12 official regions cover the ENTIRE UK
// (England's 9 regions + Scotland, Wales, Northern Ireland). These are the
// reliable REGION^ identifiers that resolve correctly (verified HTTP 200).
// The daily scrape hits every region so customers anywhere in the UK get
// fresh leads in their postcode area every morning.
const LOCATIONS = [
  // Baseline page depth. Deeper scraping is done via a dedicated background worker
  // (see scrape scheduling) so the daily scrape completes within the request timeout.
  { id: 'REGION%5E87490', name: 'Greater London', pages: 5 },
  { id: 'REGION%5E87486', name: 'North East England', pages: 3 },
  { id: 'REGION%5E87487', name: 'North West England', pages: 4 },
  { id: 'REGION%5E87488', name: 'Yorkshire and The Humber', pages: 3 },
  { id: 'REGION%5E87489', name: 'East Midlands', pages: 3 },
  { id: 'REGION%5E87491', name: 'West Midlands', pages: 4 },
  { id: 'REGION%5E87495', name: 'East of England', pages: 5 },
  { id: 'REGION%5E87496', name: 'South East England', pages: 5 },
  { id: 'REGION%5E87497', name: 'South West England', pages: 4 },
  { id: 'REGION%5E87492', name: 'Scotland', pages: 5 },
  { id: 'REGION%5E87493', name: 'Wales', pages: 3 },
  { id: 'REGION%5E87494', name: 'Northern Ireland', pages: 2 },
];

// Maps a UK postcode AREA code (e.g. "B", "HA", "NW") to the official Rightmove
// REGION identifier that covers it. Every UK postcode area is mapped so customers
// anywhere in the country get their chosen areas scraped. (Full-UK regions are
// 87486-87497; London is 87490.)
const AREA_TO_REGIONS = {
  // LONDON + HOME COUNTIES -> Greater London / South East
  'E': [87490], 'EC': [87490], 'N': [87490], 'NW': [87490], 'SE': [87490], 'SW': [87490], 'W': [87490], 'WC': [87490],
  'EN': [87490], 'HA': [87490], 'BR': [87490], 'CR': [87490], 'DA': [87490], 'KT': [87496], 'RM': [87490],
  'SM': [87490], 'TW': [87490], 'UB': [87490], 'IG': [87490], 'WD': [87490], 'SL': [87496], 'GU': [87496], 'RG': [87496],
  'AL': [87495], 'SG': [87495], 'CM': [87495], 'SS': [87495], 'CO': [87495], 'HP': [87496], 'LU': [87495], 'MK': [87496],
  'TN': [87496], 'ME': [87496], 'CT': [87496], 'BN': [87496], 'RH': [87496], 'SO': [87496], 'PO': [87496], 'SP': [87496], 'OX': [87496],
  // SOUTH WEST
  'BA': [87497], 'BS': [87497], 'GL': [87497], 'SN': [87497], 'TA': [87497], 'DT': [87497], 'BH': [87497],
  'EX': [87497], 'PL': [87497], 'TQ': [87497], 'TR': [87497],
  // WEST MIDLANDS
  'B': [87491], 'CV': [87491], 'DY': [87491], 'HR': [87491], 'ST': [87491], 'SY': [87491], 'TF': [87491], 'WR': [87491], 'WS': [87491], 'WV': [87491],
  // EAST MIDLANDS
  'DE': [87489], 'DN': [87489], 'LE': [87489], 'LN': [87489], 'NG': [87489], 'NN': [87489], 'PE': [87489],
  // EAST OF ENGLAND
  'CB': [87495], 'IP': [87495], 'NR': [87495], 'PE': [87495],
  // NORTH WEST
  'M': [87487], 'L': [87487], 'BL': [87487], 'CH': [87487], 'CW': [87487], 'FY': [87487], 'LA': [87487], 'OL': [87487], 'PR': [87487], 'SK': [87487], 'WA': [87487], 'WN': [87487], 'BB': [87487],
  // YORKSHIRE & HUMBER
  'HD': [87488], 'HG': [87488], 'HU': [87488], 'HX': [87488], 'LS': [87488], 'S': [87488], 'WF': [87488], 'YO': [87488], 'BD': [87488],
  // NORTH EAST
  'DH': [87486], 'DL': [87486], 'NE': [87486], 'SR': [87486], 'TS': [87486],
  // SCOTLAND
  'AB': [87492], 'DD': [87492], 'DG': [87492], 'EH': [87492], 'FK': [87492], 'G': [87492], 'HS': [87492], 'IV': [87492], 'KA': [87492], 'KW': [87492], 'KY': [87492], 'ML': [87492], 'PA': [87492], 'PH': [87492], 'TD': [87492], 'ZE': [87492],
  // WALES
  'CF': [87493], 'LD': [87493], 'LL': [87493], 'NP': [87493], 'SA': [87493], 'SY': [87493],
  // NORTHERN IRELAND
  'BT': [87494],
};

function fetchRightmovePage(locationId, locationName, pageIndex) {
  return new Promise((resolve) => {
    function doFetch(path, redirects) {
      const opts = {
        hostname: 'www.rightmove.co.uk',
        path: path,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Referer': 'https://www.rightmove.co.uk/',
        },
        rejectUnauthorized: false
      };
      const req = https.get(opts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects < 4) {
          res.resume();
          var loc = res.headers.location;
          var nextPath = loc.startsWith('http') ? new URL(loc).pathname + new URL(loc).search : loc;
          console.log('[RIGHTMOVE] ' + locationId + ' -> ' + res.statusCode + ' redirect to ' + nextPath.substring(0, 60));
          doFetch(nextPath, redirects + 1);
          return;
        }
        let body = '';
        let tooBig2 = false;
        res.on('data', (c) => { if (body.length > 1500000) { tooBig2 = true; res.destroy(); return; } body += c; });
        res.on('end', () => {
          if (tooBig2 || res.statusCode !== 200) {
            console.log('[RIGHTMOVE] HTTP ' + res.statusCode + ' for ' + locationId + ' index=' + pageIndex);
            resolve([]);
            return;
          }
          const match = body.match(/__NEXT_DATA__[^>]*>([^<]+)<\/script>/);
          if (!match) {
            console.log('[RIGHTMOVE] No __NEXT_DATA__ found for ' + locationId);
            resolve([]);
            return;
          }
          try {
            const data = JSON.parse(match[1]);
            const searchResults = data.props?.pageProps?.searchResults;
            if (!searchResults || !searchResults.properties) {
              resolve([]);
              return;
            }
            const properties = searchResults.properties.map(function(p) {
              var status = 'Available';
              var statusReason = (p.listingUpdate && p.listingUpdate.listingUpdateReason || '').toLowerCase();
              if (statusReason.includes('sold') || statusReason.includes('sstc') || statusReason.includes('under offer')) status = 'Under Offer';
              else if (statusReason.includes('reduced')) status = 'Reduced';
              else if (statusReason === 'new') status = 'New';
              if (p.displayStatus) status = p.displayStatus;
              if (p.auction) status = 'Auction';
              return {
                id: 'RM_' + p.id,
                listingId: p.id || p.listingId || '',
                title: p.displayAddress || '',
                address: p.displayAddress || '',
                price: p.price ? (p.price.amount || 0) : 0,
                bedrooms: p.bedrooms || 0,
                propertyType: p.propertySubType || '',
                listingStatus: status,
                firstVisibleDate: p.firstVisibleDate || '',
                updateDate: p.updateDate || '',
                url: 'https://www.rightmove.co.uk' + (p.propertyUrl || ''),
                agent: p.customer ? (p.customer.branchDisplayName || p.customer.branchName || '') : '',
                source: 'Rightmove',
                scrapedAt: new Date().toISOString(),
                city: (function() {
                  // Area-targeted regions are named like "E area", "NW area" — strip
                  // the " area" suffix so it never leaks into the displayed town.
                  var locN = typeof searchResults.location === 'object' ? (searchResults.location.name || locationName) : (searchResults.location || locationName);
                  return String(locN || '').replace(/\s+area$/i, '').trim();
                })(),
                postcode: (p.displayAddress || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i) ? (p.displayAddress.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i)[0].trim()) : '',
                // UPRN / coordinates / identity where Rightmove exposes them (Phase 5).
                uprn: p.uprn || p.propertyUprn || (p.location && p.location.uprn) || '',
                latitude: (p.location && p.location.latitude) || null,
                longitude: (p.location && p.location.longitude) || null
              };
            });
            resolve(properties);
          } catch (e) {
            console.log('[RIGHTMOVE] Parse error:', e.message);
            resolve([]);
          }
        });
      });
      req.on('error', function(e) { console.log('[RIGHTMOVE] req error', e.message); resolve([]); });
      req.setTimeout(30000, function() { req.destroy(); resolve([]); });
      req.end();
    }
    var path = '/property-for-sale/find.html?locationIdentifier=' + locationId + '&index=' + pageIndex + '&includeSSTC=true&sortType=6&propertyTypes=&mustHave=&dontShow=&furnishTypes=&keywords=';
    doFetch(path, 0);
  });
}
// COMMERCIAL PROPERTY — Rightmove's commercial section (offices, retail, warehouses,
// industrial, pubs, land, etc). Same OUTCODE/REGION identifiers as residential but
// under /commercial-property-for-sale/ and /commercial-property-to-let/. Results use
// the same __NEXT_DATA__ structure; we tag them commercial:true so the distributor
// can mix or separate them per customer.
function fetchCommercialRightmovePage(locationId, locationName, pageIndex, isLet) {
  return new Promise((resolve) => {
    var section = isLet ? 'commercial-property-to-let' : 'commercial-property-for-sale';
    var path = '/' + section + '/find.html?locationIdentifier=' + locationId + '&index=' + pageIndex + (isLet ? '' : '&includeSSTC=true') + '&sortType=6&keywords=';
    const opts = {
      hostname: 'www.rightmove.co.uk',
      path: path,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Referer': 'https://www.rightmove.co.uk/commercial-property-for-sale/',
      },
      rejectUnauthorized: false
    };
    const req = https.get(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('[RIGHTMOVE-COMMERCIAL] HTTP ' + res.statusCode + ' for ' + locationId + ' index=' + pageIndex);
          resolve([]);
          return;
        }
        const match = body.match(/__NEXT_DATA__[^>]*>([^<]+)<\/script>/);
        if (!match) {
          console.log('[RIGHTMOVE-COMMERCIAL] No __NEXT_DATA__ for ' + locationId);
          resolve([]);
          return;
        }
        try {
          const data = JSON.parse(match[1]);
          const searchResults = data.props?.pageProps?.searchResults;
          if (!searchResults || !searchResults.properties) { resolve([]); return; }
          const properties = searchResults.properties.map(function(p) {
            var status = 'Available';
            var statusReason = (p.listingUpdate && p.listingUpdate.listingUpdateReason || '').toLowerCase();
              if (statusReason.includes('sold') || statusReason.includes('sstc') || statusReason.includes('under offer')) status = 'Under Offer';
            else if (statusReason === 'new') status = 'New';
            if (p.displayStatus) status = p.displayStatus;
            if (p.auction) status = 'Auction';
            return {
              id: 'RMC_' + p.id,
              listingId: p.id || p.listingId || '',
              title: p.displayAddress || '',
              address: p.displayAddress || '',
              price: p.price ? (p.price.amount || 0) : 0,
              bedrooms: 0,
              commercial: true,
              commercial_let: !!isLet,
              sqft: p.features && p.features.SIZE ? p.features.SIZE : '',
              propertyType: p.propertySubType || (p.displaySubType || 'Commercial'),
              listingStatus: status,
              firstVisibleDate: p.firstVisibleDate || '',
              updateDate: p.updateDate || '',
              url: 'https://www.rightmove.co.uk' + (p.propertyUrl || ''),
              agent: p.customer ? (p.customer.branchDisplayName || p.customer.branchName || '') : '',
              source: 'Rightmove Commercial',
              scrapedAt: new Date().toISOString(),
              city: (function() {
                var locN = typeof searchResults.location === 'object' ? (searchResults.location.name || locationName) : (searchResults.location || locationName);
                return String(locN || '').replace(/\s+area$/i, '').trim();
              })(),
              postcode: (p.displayAddress || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i) ? (p.displayAddress.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i)[0].trim()) : '',
              uprn: p.uprn || p.propertyUprn || (p.location && p.location.uprn) || '',
              latitude: (p.location && p.location.latitude) || null,
              longitude: (p.location && p.location.longitude) || null
            };
          });
          resolve(properties);
        } catch (e) {
          console.log('[RIGHTMOVE-COMMERCIAL] Parse error:', e.message);
          resolve([]);
        }
      });
    });
    req.on('error', function(e) { resolve([]); });
    req.setTimeout(30000, function() { req.destroy(); resolve([]); });
    req.end();
  });
}

// Collect commercial leads for a list of locations. `config`:
//   { areas: [postcode area codes], locations: [...], include_let: bool, pages: n }
async function collectCommercialLeads(config) {
  config = config || {};
  // DATACENTER-IP MODE: when force_apify is set (or env FORCE_COMMERCIAL_APIFY=1),
  // skip the slow direct Rightmove scrape entirely and use the Apify actor — direct
  // commercial scraping is usually blocked from datacenter IPs (Render) and can hang
  // for minutes before returning nothing.
  var forceApify = config.force_apify || process.env.FORCE_COMMERCIAL_APIFY === '1' || process.env.FORCE_COMMERCIAL_APIFY === 'true';
  if (forceApify) {
    try {
      var apAreas = (config.areas && Array.isArray(config.areas) && config.areas.length) ? config.areas : (config.locations || []).map(function(l){ return String(l.name || '').replace(' area', '').trim(); }).filter(Boolean);
      if (apAreas.length) {
        console.log('[RIGHTMOVE-COMMERCIAL] Using Apify (datacenter mode) for ' + apAreas.join(','));
        var apifyLeads = await fetchRightmoveApifyCommercial(apAreas, (config.pages || 3) * 24);
        var seenA = {};
        var outA = (apifyLeads || []).filter(function(p) { if (seenA[p.id]) return false; seenA[p.id] = true; return true; });
        console.log('[RIGHTMOVE-COMMERCIAL] Apify total: ' + outA.length + ' commercial properties');
        return outA;
      }
    } catch (apifyErr) { console.log('[RIGHTMOVE-COMMERCIAL] Apify error: ' + apifyErr.message); }
    return [];
  }
  let locations = config.locations || LOCATIONS.slice();
  if (config.areas && Array.isArray(config.areas) && config.areas.length > 0) {
    const added = {};
    const extraLocs = [];
    config.areas.forEach(function(area) {
      const key = String(area).toUpperCase().trim();
      (AREA_TO_REGIONS[key] || []).forEach(function(rid) {
        const locKey = 'REGION%5E' + rid;
        if (!added[locKey]) {
          added[locKey] = true;
          extraLocs.push({ id: locKey, name: key + ' area', pages: config.pages || 3 });
        }
      });
    });
    if (extraLocs.length) {
      locations = extraLocs.concat(locations);
      console.log('[RIGHTMOVE-COMMERCIAL] Added ' + extraLocs.length + ' area-targeted regions for ' + config.areas.join(','));
    }
  }
  var includeLet = config.include_let !== false; // default: sales + lettings
  const allProperties = [];
  for (const loc of locations) {
    try {
      var maxPages = loc.pages || 3;
      var sections = includeLet ? ['sale', 'let'] : ['sale'];
      for (var s = 0; s < sections.length; s++) {
        var isLet = sections[s] === 'let';
        for (var pi = 0; pi < maxPages; pi++) {
          var pg = await fetchCommercialRightmovePage(loc.id, loc.name, pi * 24, isLet);
          if (pg.length === 0) break;
          console.log('[RIGHTMOVE-COMMERCIAL] ' + loc.name + ' ' + sections[s] + ' page ' + (pi + 1) + ': ' + pg.length);
          allProperties.push.apply(allProperties, pg);
          if (pg.length < 24) break;
        }
        await new Promise(function(r) { setTimeout(r, 300); });
      }
    } catch (e) {
      console.log('[RIGHTMOVE-COMMERCIAL] Error scraping ' + loc.name + ':', e.message);
    }
  }
  var seenIds = {};
  var deduped = allProperties.filter(function(p) {
    if (seenIds[p.id]) return false;
    seenIds[p.id] = true;
    return true;
  });
  console.log('[RIGHTMOVE-COMMERCIAL] Total: ' + deduped.length + ' unique commercial properties from ' + locations.length + ' areas');
  // APIFY FALLBACK: direct Rightmove commercial scraping is often blocked from
  // datacenter IPs. If we got nothing, retry via the Apify actor with a residential
  // proxy so commercial leads still reach the pool.
  if (deduped.length === 0) {
    try {
      var apifyAreas = (config.areas && Array.isArray(config.areas) && config.areas.length) ? config.areas : (config.locations || []).map(function(l){ return String(l.name || '').replace(' area', '').trim(); }).filter(Boolean);
      if (apifyAreas.length) {
        console.log('[RIGHTMOVE-COMMERCIAL] Direct scrape empty — trying Apify for ' + apifyAreas.join(','));
        var apifyLeads = await fetchRightmoveApifyCommercial(apifyAreas, config.pages ? config.pages * 24 : 60);
        (apifyLeads || []).forEach(function(l) { if (!seenIds[l.id]) { seenIds[l.id] = true; deduped.push(l); } });
        console.log('[RIGHTMOVE-COMMERCIAL] Apify fallback added ' + (apifyLeads || []).length + ' (total ' + deduped.length + ')');
      }
    } catch (apifyErr) { console.log('[RIGHTMOVE-COMMERCIAL] Apify fallback error: ' + apifyErr.message); }
  }
  return deduped;
}

// Look up the full address (house number + street + postcode) via Postcoder
// (licensed Royal Mail PAF data). Given the street name and full postcode from
// the Rightmove detail page, Postcoder returns the numbered addresses so we can
// append the correct house number.
// NOTE: Postcoder charges credits per lookup (2 credits ≈ 7p). It is DISABLED by
// default — the Rightmove detail page already returns a full numbered address for
// free, so Postcoder is only a precision upgrade. Enable only if explicitly set
// (POSTCODER_ENABLED=true) and keep usage to the final delivered leads only.
function lookupPostcoderAddress(postcode, streetHint, doorNumber) {
  return new Promise((resolve) => {
    if (process.env.POSTCODER_ENABLED !== 'true' && process.env.POSTCODER_ENABLED !== '1') {
      return resolve(null);
    }
    const cleanPc = (postcode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanPc) return resolve(null);

    // CACHE-FIRST: if we've already validated this postcode, reuse the stored PAF
    // address array. This avoids paying Postcoder for identical information.
    let addresses = null;
    try {
      const pcCache = require('./postcoder_cache');
      addresses = pcCache.get(cleanPc);
    } catch(ce) { /* cache unavailable — fall through to live lookup */ }

    if (addresses && Array.isArray(addresses) && addresses.length) {
      return resolve(matchPafAddress(addresses, cleanPc, streetHint, doorNumber));
    }

    // SHARED DAILY-CREDIT GUARD: spend through the single daily budget counter.
    // Without this, every path (scraper x2/day, distributor, delivery, admin)
    // spends up to POSTCODER_DAILY_BUDGET independently → credits burn 3-4x
    // faster than intended. One global pool of credits per day.
    try {
      const pcBudget = require('./postcoder_budget');
      if (!pcBudget.canLookup()) {
        console.log('[POSTCODER] Daily/rate limit reached — skipping lookup for ' + (postcode || ''));
        return resolve(null);
      }
    } catch(pe) { console.log('[POSTCODER] Budget guard error:', pe.message); }
    const key = process.env.POSTCODER_API_KEY;
    if (!key) return resolve(null);
    const opts = {
      hostname: 'ws.postcoder.com',
      path: '/pcw/' + key + '/address/uk/' + cleanPc + '?format=json&lines=10&page=0',
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 20000
    };
    const req = https.get(opts, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        // 429 = rate-limited; 401 = key issue. Report the status so callers can retry.
        if (res.statusCode === 429 || res.statusCode === 403) {
          resolve({ rateLimited: true });
          return;
        }
        if (res.statusCode !== 200) { resolve(null); return; }
        try {
          const parsed = JSON.parse(body);
          if (!Array.isArray(parsed) || parsed.length === 0) { resolve(null); return; }
          // Cache the successful result so the next lookup for this postcode is free.
          try {
            const pcCache = require('./postcoder_cache');
            pcCache.set(cleanPc, parsed);
          } catch(ce) {}
          resolve(matchPafAddress(parsed, cleanPc, streetHint, doorNumber));
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Match a cleaned postcode + (optional) street hint / door number against a PAF
// address array. Extracted from lookupPostcoderAddress so the same matching logic
// runs identically on a cached result or a fresh Postcoder response.
function matchPafAddress(addresses, cleanPc, streetHint, doorNumber) {
  if (!Array.isArray(addresses) || addresses.length === 0) return null;
  // Normalise the Rightmove street hint for matching
  const hint = (streetHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (hint) {
    // If we know the exact door number (from the property photo via vision),
    // we REQUIRE a PAF address whose building number matches it. The whole
    // point is accuracy for Print & Post: we must never guess a number. So if
    // PAF cannot confirm this exact number in this postcode, reject the lead
    // (return null) rather than fall back to a wrong-numbered address.
    if (doorNumber) {
      const dn = String(doorNumber).toUpperCase().replace(/[^A-Z0-9]/g, '');
      const numberMatch = addresses.find(function(a) {
        const n = String(a.number || a.premise || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return n === dn || (n && dn && n.indexOf(dn) !== -1);
      });
      if (numberMatch) return {
        fullAddress: numberMatch.summaryline || numberMatch.addressline1 || '',
        address1: numberMatch.addressline1 || '',
        street: numberMatch.street || '',
        buildingNumber: numberMatch.number || numberMatch.premise || '',
        town: numberMatch.posttown || numberMatch.county || '',
        postcode: numberMatch.postcode || cleanPc,
        udprn: numberMatch.udprn || ''
      };
      // The vision hint didn't match a PAF building number directly (e.g. the
      // hint read "Flat 1" but the building number is "52"). That's fine — the
      // PAF address is authoritative, so fall through to pick a street match
      // that HAS a real building number. We never guess: we only ever use a
      // number that PAF publishes.
      console.log('[POSTCODER] Door number hint ' + dn + ' did not directly match PAF for ' + cleanPc + ' — using PAF building number.');
    }
    // STREET-NAME MATCH (no door number hint): Rightmove never publishes house
    // numbers, so we match the lead's street name against the PAF addresses in the
    // postcode. CRITICAL: we must NEVER assign a generic number (e.g. "1") when a
    // street has multiple numbered properties — that would mail to the wrong house.
    // We only accept the match when it is UNAMBIGUOUS:
    //   - the street name appears for exactly ONE PAF address in the postcode, OR
    //   - the property is a named building/flat (premise present) with no competing
    //     numbered house on the same street in that postcode.
    // If the street has several distinct door numbers, we cannot know which one, so
    // we reject (return null) — accuracy over count. The customer gets only leads
    // whose exact house number PAF confirms without ambiguity.
    const streetNorm = hint.replace(/[^a-z]/g, '');
    const streetMatches = addresses.filter(function(a) {
      const s = String(a.street || '').toLowerCase().replace(/[^a-z]/g, '');
      if (!s) return false;
      // Exact street match, or the hint is a full/partial prefix of the PAF street.
      return s === streetNorm || streetNorm.indexOf(s) === 0 || s.indexOf(streetNorm) === 0 || (s.indexOf(streetNorm) !== -1 && streetNorm.length >= 6);
    });
    // Deduplicate by number/premise — if the street resolves to a SINGLE distinct
    // address we can confirm it; if it resolves to MULTIPLE, it is ambiguous and we
    // must NOT guess a number.
    const distinct = [];
    const seenK = {};
    streetMatches.forEach(function(a) {
      const k = String(a.number || a.premise || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (!k) return;
      if (seenK[k]) return;
      seenK[k] = 1;
      distinct.push(a);
    });
    // Exactly one distinct numbered/premise address on the street -> confirmed.
    if (distinct.length === 1 && (distinct[0].number || distinct[0].premise)) {
      const sm = distinct[0];
      return {
        fullAddress: sm.summaryline || sm.addressline1 || '',
        address1: sm.addressline1 || '',
        street: sm.street || '',
        buildingNumber: sm.number || sm.premise || '',
        town: sm.posttown || sm.county || '',
        postcode: sm.postcode || cleanPc,
        udprn: sm.udprn || ''
      };
    }
    // Multiple distinct numbers on this street in this postcode -> ambiguous, no guess.
    if (distinct.length > 1) {
      console.log('[POSTCODER] Ambiguous street match for ' + cleanPc + ' (' + streetNorm + '): ' + distinct.length + ' numbers — rejecting (never guess)');
      return null;
    }
  }
  // No confirmable address -> reject (accuracy over count).
  return null;
}

// Fetch a property's detail page to extract the full address and postcode
// (Rightmove list view hides street numbers and full postcodes).
function fetchPropertyDetail(propertyUrl) {
  return new Promise((resolve) => {
    if (!propertyUrl) return resolve(null);
    const opts = {
      hostname: 'www.rightmove.co.uk',
      path: propertyUrl.split('#')[0],
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-GB,en;q=0.9',
        'Referer': 'https://www.rightmove.co.uk/',
      },
      rejectUnauthorized: false
    };
    const req = https.get(opts, (res) => {
      let body = '';
      let tooBig = false;
      res.on('data', (c) => { if (body.length > 1200000) { tooBig = true; res.destroy(); return; } body += c; });
      res.on('end', () => {
        if (tooBig || res.statusCode !== 200) return resolve(null);
        const result = {};
        // Full street address from the h1 (includes building name/number + street)
        const street = body.match(/itemProp="streetAddress">([^<]+)<\/h1>/);
        if (street) result.fullAddress = street[1].trim();
      // Property photo URL (used to read the door number via vision AI).
      // Rightmove hides the house number in text but it is often visible in the photo.
      const photo = body.match(/https:\/\/media\.rightmove\.co\.uk\/property-photo\/[^"'\\]+\.jpe?g/i);
      if (photo) result.photo = photo[0].replace(/\\\//g, '/');
        // Full postcode: the last 7-char postcode near the property id in the JSON blob
        const idMatch = propertyUrl.match(/(\d+)/);
        if (idMatch) {
          const id = idMatch[1];
          const idPos = body.indexOf(',' + id);
          if (idPos > -1) {
            const before = body.substring(Math.max(0, idPos - 200), idPos);
            const pc = before.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s[0-9][A-Z]{2}/g);
            if (pc && pc.length) result.postcode = pc[pc.length - 1];
          }
        }
        // Fallback: any full postcode in the page if the above failed
        if (!result.postcode) {
          const pcAll = body.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s[0-9][A-Z]{2}/g);
          if (pcAll && pcAll.length) result.postcode = pcAll[pcAll.length - 1];
        }
        resolve(Object.keys(result).length ? result : null);
      });
    });
    req.on('error', function() { resolve(null); });
    req.setTimeout(20000, function() { req.destroy(); resolve(null); });
    req.end();
  });
}

// Enrich a batch of list-view leads with full addresses and postcodes
// by fetching their detail pages (parallel). This runs quickly so we can get
// real postcodes for area matching BEFORE assignment.
async function enrichMovingLeads(leads, concurrency) {
  concurrency = concurrency || 6;
  const enriched = new Array(leads.length);
  let idx = 0;
  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= leads.length) break;
      const lead = leads[i];
      const detail = await fetchPropertyDetail(lead.url);
      if (detail) {
        lead.address = detail.fullAddress || lead.address;
        lead.postcode = detail.postcode || lead.postcode || '';
        lead.fullAddress = detail.fullAddress || lead.address;
        lead.photo = detail.photo || lead.photo || '';
        // COLLECTION-TIME DOOR NUMBER (HINT ONLY): read the house number from the
        // photo via vision, but NEVER write it into the address unverified. Vision
        // is unreliable and often guesses "1" or "Flat 1", which would corrupt the
        // real address. Instead store it ONLY as a hint (doorNumberHint) that the
        // delivery-time Postcoder/PAF lookup uses to disambiguate the exact address.
        // The address is only corrected with a number that PAF has confirmed.
        // DISABLED BY DEFAULT (MOVING_VISION_ENABLED=true to enable): photo download
        // + OpenAI + native image processing is slow and can crash the scraper
        // (SIGABRT); the delivery-time PAF handles numbers without it.
        if (lead.photo && !lead.doorNumberHint && (process.env.MOVING_VISION_ENABLED === 'true' || process.env.MOVING_VISION_ENABLED === '1')) {
          try {
            const dn = await readDoorNumberFromPhoto(lead.photo);
            if (dn && /^\s*\d+[A-Za-z]?/i.test(dn)) {
              lead.doorNumberHint = dn.trim();
            }
          } catch (vnErr) { /* ignore; PAF handles at delivery */ }
        }
      }
      enriched[i] = lead;
    }
  }
  const workers = [];
  for (let w = 0; w < concurrency; w++) workers.push(worker());
  await Promise.all(workers);
  return enriched.filter(Boolean);
}

// Resolve a full address (with house number) by finding the same property on
// Zoopla. Zoopla publishes the real street address (incl. house number) on its
// DETAIL pages, unlike Rightmove which hides it everywhere. This works in two
// steps: (1) run a Zoopla search actor on the postcode to find the twin listing
// by price/street and grab its detail URL, then (2) fetch that detail page and
// parse the full address from its HTML. Used as a FALLBACK when vision+PAF
// fails to produce a house number. Returns a lead-style address object or null.
async function lookupZooplaAddress(postcode, streetHint, priceGbp) {
  return new Promise((resolve) => {
    try {
      const key = process.env.APIFY_API_KEY || '';
      if (!key) return resolve(null);
      const cleanPc = (postcode || '').toUpperCase().replace(/\s+/g, ' ');
      if (!cleanPc) return resolve(null);
      const input = {
        location: cleanPc,
        results_wanted: 30,
        proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] }
      };
      const body = JSON.stringify(input);
      const req = https.request({
        hostname: 'api.apify.com',
        path: '/v2/acts/shahidirfan~zoopla-scraper/run-sync-get-dataset-items?token=' + key + '&memory=256&timeout=60',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'application/json' },
        timeout: 90000
      }, function(res) {
        let b = ''; res.on('data', function(c) { b += c; }); res.on('end', function() {
          try {
            const items = JSON.parse(b);
            if (!Array.isArray(items) || items.length === 0) { resolve(null); return; }
            const hint = (streetHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            let best = null;
            // Prefer a listing matching the street hint, then one close in price.
            items.forEach(function(it) {
              const st = String(it.address || it.title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              if (hint && st && st.indexOf(hint) !== -1) { if (!best || best.priceDist > (it.priceValue != null ? Math.abs(it.priceValue - (priceGbp || 0)) : 1e9)) { best = { item: it, priceDist: (it.priceValue != null ? Math.abs(it.priceValue - (priceGbp || 0)) : 1e9) }; } }
            });
            if (!best) best = { item: items[0], priceDist: (items[0].priceValue != null ? Math.abs(items[0].priceValue - (priceGbp || 0)) : 1e9) };
            const url = best.item.detailUrl || best.item.url || '';
            // Fetch the Zoopla detail page and parse the real street address.
            if (!url) { resolve(null); return; }
            const u = new URL(url);
            const req2 = https.get({ hostname: u.hostname, path: u.pathname, headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0 Safari/537.36', 'Accept': 'text/html', 'Accept-Language': 'en-GB,en;q=0.9' }, rejectUnauthorized: false, timeout: 25000 }, function(res2) {
              let html = ''; res2.on('data', function(c) { html += c; }); res2.on('end', function() {
                const addr = parseZooplaAddress(html);
                if (addr) resolve(addr); else resolve(null);
              });
            });
            req2.on('error', function() { resolve(null); });
            req2.setTimeout(25000, function() { req2.destroy(); resolve(null); });
            req2.end();
          } catch(e) { resolve(null); }
        });
      });
      req.on('error', function() { resolve(null); });
      req.setTimeout(90000, function() { req.destroy(); resolve(null); });
      req.write(body); req.end();
    } catch(e) { resolve(null); }
  });
}

// Parse a full UK street address (with house number) from Zoopla detail HTML.
function parseZooplaAddress(html) {
  try {
    if (!html) return null;
    // Zoopla exposes the full address in an h1 address / meta description.
    const patterns = [
      /itemprop="streetAddress"[^>]*>([^<]+)</i,
      /<h1[^>]*class="[^"]*address[^"]*"[^>]*>([^<]+)</i,
      /property-description[^>]*>\s*<h1[^>]*>([^<]+)</i
    ];
    let full = null;
    for (const p of patterns) { const m = html.match(p); if (m && m[1]) { full = m[1].trim(); if (full) break; } }
    if (!full) {
      // Fallback: og:title or title often reads "Number Street, Area, Postcode".
      const t = html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i) || html.match(/<meta[^>]+content="([^"]+)"[^>]+property="og:title"/i);
      if (t && t[1]) full = t[1].split('|')[0].trim();
    }
    if (!full) return null;
    // Extract the leading house number from the address.
    const num = (full.match(/^\s*(\d+[A-Za-z]?)/) || [null, ''])[1];
    return {
      fullAddress: full,
      address1: full,
      street: full,
      buildingNumber: num || '',
      postcode: (full.match(/([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})/i) || [null, ''])[1] || ''
    };
  } catch(e) { return null; }
}

// Resolve a full address (with house number) using the Apify "Rightmove
// Land Registry Full Address & House Number Finder" actor. This is authoritative
// (HM Land Registry sold-price data) but only returns a match for properties
// that have a past sale record — so it is used as a FALLBACK when the photo/PAF
// route fails to produce a number. Returns a lead-style address object or null.
async function lookupLandRegistryAddress(postcode, streetHint, soldPrice, soldYear) {
  return new Promise((resolve) => {
    try {
      const key = process.env.APIFY_API_KEY || '';
      if (!key) return resolve(null);
      const cleanPc = (postcode || '').toUpperCase().replace(/\s+/g, ' ');
      if (!cleanPc) return resolve(null);
      const input = { fullPostCode: cleanPc, onlyMatched: false, email: '' };
      if (soldPrice) input.soldPrice = String(soldPrice);
      if (soldYear) input.soldYear = String(soldYear);
      const body = JSON.stringify({ ...input });
      const req = https.request({
        hostname: 'api.apify.com',
        path: '/v2/acts/dhrumil~rightmove-landregistry-full-address-house-number-finder/run-sync-get-dataset-items?token=' + key + '&memory=256&timeout=60',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'application/json' },
        timeout: 90000
      }, function(res) {
        let b = ''; res.on('data', function(c) { b += c; }); res.on('end', function() {
          try {
            const items = JSON.parse(b);
            if (!Array.isArray(items) || items.length === 0) { resolve(null); return; }
            const hint = (streetHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');
            // Prefer an item whose street matches our Rightmove hint.
            const item = items.find(function(it) {
              const st = String(it.street || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              return hint && st && st.indexOf(hint) !== -1;
            }) || items[0];
            const premise = String(item.premise || item.houseNumber || '');
            const street = String(item.street || '');
            resolve({
              fullAddress: item.fullAddress || [premise, street, item.town, item.postcode].filter(Boolean).join(', '),
              address1: [premise, street].filter(Boolean).join(' '),
              street: street,
              buildingNumber: premise,
              town: item.town || item.district || '',
              postcode: item.postcode || cleanPc,
              udprn: item.udprn || ''
            });
          } catch(e) { resolve(null); }
        });
      });
      req.on('error', function() { resolve(null); });
      req.setTimeout(90000, function() { req.destroy(); resolve(null); });
      req.write(body); req.end();
    } catch(e) { resolve(null); }
  });
}

// Read the door/house number from a property photo using OpenAI vision.
// Rightmove hides house numbers in text, but they are often visible on the
// building in the main property photo. Returns the number string or '' if none.
async function readDoorNumberFromPhoto(photoUrl) {
  try {
    const key = process.env.OPENAI_API_KEY;
    if (!key || !photoUrl) return '';
    // Download the photo
    const imgBuf = await new Promise((resolve) => {
      const u = new URL(photoUrl);
      const req = https.get({ hostname: u.hostname, path: u.pathname, headers: { 'User-Agent': 'node', 'Referer': 'https://www.rightmove.co.uk/' }, rejectUnauthorized: false, timeout: 15000 }, (res) => {
        const chunks = []; res.on('data', (c) => chunks.push(c)); res.on('end', () => resolve(Buffer.concat(chunks)));
      });
      req.on('error', () => resolve(null));
      req.setTimeout(15000, () => { req.destroy(); resolve(null); });
      req.end();
    });
    if (!imgBuf || !imgBuf.length) return '';
    const b64 = imgBuf.toString('base64');
    const body = {
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'This is a photo of a UK house. Read the house/door NUMBER clearly visible on the front of the building (front door, facade, or street number plate). Reply with JUST the number (e.g. 11, 11A, 1, 23, 145). If no number is clearly visible, reply with exactly NONE.' },
        { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + b64 } }
      ] }],
      max_tokens: 20
    };
    const resp = await new Promise((resolve) => {
      const data = JSON.stringify(body);
      const req = https.request({ hostname: 'api.openai.com', path: '/v1/chat/completions', method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data), 'User-Agent': 'node' }, timeout: 30000 }, (res) => {
        let b = ''; res.on('data', (c) => b += c); res.on('end', () => resolve(b));
      });
      req.on('error', () => resolve(''));
      req.setTimeout(30000, () => { req.destroy(); resolve(''); });
      req.write(data); req.end();
    });
    try {
      const j = JSON.parse(resp);
      const ans = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
      if (!ans || ans.toUpperCase() === 'NONE') return '';
      return ans;
    } catch(e) { return ''; }
  } catch(e) { return ''; }
}

// Enrich a SMALL batch (the final selected leads) with exact house numbers via
// Postcoder (licensed Royal Mail PAF). Rightmove never publishes house numbers,
// so we first READ the door number from the property photo (vision AI) and then
// use Postcoder to resolve the exact full address for that number. If vision
// fails or no number is found, fall back to Postcoder's best street match.
async function enrichMovingLeadsPostcoder(leads) {
  const enriched = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (lead.postcode) {
      // Space lookups so we never burst past Postcoder's 50/5min IP limit.
      if (i > 0) await new Promise(function(r) { setTimeout(r, 250); });
      // Try to get the exact door number. Prefer the hint stored at collection
      // time (read from the photo once); only re-read the photo if no hint exists.
      let doorNumber = lead.doorNumberHint || '';
      if (!doorNumber && lead.photo) {
        doorNumber = await readDoorNumberFromPhoto(lead.photo);
      }
      if (doorNumber) console.log('[POSTCODER] Door number hint for ' + (lead.address||'').substring(0,40) + ': ' + doorNumber);
      const streetHint = lead.fullAddress || lead.address || '';
      let fullAddr = await lookupPostcoderAddress(lead.postcode, streetHint, doorNumber);
      if (fullAddr && fullAddr.rateLimited) {
        await new Promise(function(r) { setTimeout(r, 30000); });
        fullAddr = await lookupPostcoderAddress(lead.postcode, streetHint, doorNumber);
      }
      if (fullAddr && !fullAddr.rateLimited) {
        lead.address = fullAddr.fullAddress || fullAddr.address1 || lead.address;
        lead.fullAddress = fullAddr.fullAddress || lead.address;
        lead.street = fullAddr.street || lead.street || '';
        lead.buildingNumber = fullAddr.buildingNumber || (doorNumber || '');
        lead.postcode = fullAddr.postcode || lead.postcode;
        lead.udprn = fullAddr.udprn || '';
        // If the photo/PAF route could not determine a house number (vision
        // failed or the number wasn't found in PAF), fall back to the Apify
        // Land Registry actor as an authoritative source, then to Zoopla's
        // published detail-page address.
        if (!lead.buildingNumber) {
          const lr = await lookupLandRegistryAddress(lead.postcode, streetHint, lead.price, lead.soldYear);
          if (lr && lr.buildingNumber) {
            console.log('[LAND-REGISTRY] Fallback match for ' + (lead.address||'').substring(0,40) + ': ' + lr.buildingNumber + ' ' + lr.street);
            lead.address = lr.fullAddress || lr.address1 || lead.address;
            lead.fullAddress = lr.fullAddress || lead.address;
            lead.street = lr.street || lead.street || '';
            lead.buildingNumber = lr.buildingNumber;
            lead.postcode = lr.postcode || lead.postcode;
            lead.udprn = lr.udprn || lead.udprn || '';
          }
          if (!lead.buildingNumber) {
            const zl = await lookupZooplaAddress(lead.postcode, streetHint, lead.price);
            if (zl && zl.buildingNumber) {
              console.log('[ZOOPLA] Fallback match for ' + (lead.address||'').substring(0,40) + ': ' + zl.fullAddress);
              lead.address = zl.fullAddress || zl.address1 || lead.address;
              lead.fullAddress = zl.fullAddress || lead.address;
              lead.street = zl.street || lead.street || '';
              lead.buildingNumber = zl.buildingNumber;
              lead.postcode = zl.postcode || lead.postcode;
              lead.udprn = zl.udprn || lead.udprn || '';
            }
          }
        }
      }
    }
    enriched.push(lead);
  }
  return enriched;
}

async function collectMovingLeads(config) {
  config = config || {};
  // If the caller passes postcode AREA codes (e.g. ["B","HA","NW"]), add the
  // matching Rightmove regions to the default list so we actually get leads in
  // every area the customer chose (the old region IDs pointed at the wrong places).
  let locations = config.locations || LOCATIONS.slice();
  if (config.areas && Array.isArray(config.areas) && config.areas.length > 0) {
    const added = {};
    const extraLocs = [];
    config.areas.forEach(function(area) {
      const key = String(area).toUpperCase().trim();
      (AREA_TO_REGIONS[key] || []).forEach(function(rid) {
        const locKey = 'REGION%5E' + rid;
        if (!added[locKey]) {
          added[locKey] = true;
          extraLocs.push({ id: locKey, name: key + ' area', pages: 5 });
        }
      });
    });
    if (extraLocs.length) {
      locations = extraLocs.concat(locations);
      console.log('[RIGHTMOVE] Added ' + extraLocs.length + ' area-targeted regions for ' + config.areas.join(','));
    }
  }
  const allProperties = [];

  for (const loc of locations) {
    try {
      _usageInc('searches', 1);
      var isAreaTargeted = !!(config.areas && Array.isArray(config.areas) && config.areas.length > 0 && / area$/.test(loc.name || ''));
      var maxPages = loc.pages || 2;
      for (var pi = 0; pi < maxPages; pi++) {
        var pg = await fetchRightmovePage(loc.id, loc.name, pi * 24);
        _usageInc('rightmove_pages', 1);
        if (pg.length === 0) { _usageInc('failed_searches', 1); break; }
        if (isAreaTargeted) {
          var areaTag = String(loc.name).replace(' area', '').toUpperCase();
          pg.forEach(function(p) { p.areaTargeted = areaTag; });
        }
        console.log('[RIGHTMOVE] ' + loc.name + ' page ' + (pi + 1) + ': ' + pg.length);
        allProperties.push.apply(allProperties, pg);
        if (pg.length < 24) break;
      }

      if (loc !== locations[locations.length - 1]) {
        await new Promise(function(r) { setTimeout(r, 300); });
      }
    } catch (e) {
      console.log('[RIGHTMOVE] Error scraping ' + loc.name + ':', e.message);
    }
  }

  var seenIds = {};
  var deduped = allProperties.filter(function(p) {
    if (seenIds[p.id]) return false;
    seenIds[p.id] = true;
    // Count new vs already-known properties for cost/dedup visibility.
    var known = false;
    try { known = !!(require('./property_store').lookup(p.id)); } catch(e) {}
    _usageInc(known ? 'known_props' : 'new_props', 1);
    return true;
  });

  console.log('[RIGHTMOVE] Total: ' + deduped.length + ' unique properties from ' + locations.length + ' areas');

  // COMMERCIAL MIX: if the caller wants commercial leads included (config.commercial
  // true, or areas configured for both), pull commercial properties for the same
  // locations and append them (tagged commercial:true). The distributor filters by
  // each customer's moving_type (residential/commercial/both).
  if (config.commercial) {
    try {
      var comm = await collectCommercialLeads({ areas: config.areas, locations: config.commercialLocations || config.locations, include_let: config.commercial_let !== false, pages: config.commercial_pages || 2, force_apify: config.commercial_force_apify });
      if (comm && comm.length) {
        comm.forEach(function(c) { if (!seenIds[c.id]) { seenIds[c.id] = true; deduped.push(c); } });
        console.log('[RIGHTMOVE] Added ' + comm.length + ' commercial leads (total now ' + deduped.length + ')');
      }
    } catch (commErr) { console.log('[RIGHTMOVE] Commercial scrape error:', commErr.message); }
  }
  return deduped;
}

// ===== RIGHTMOVE COMMERCIAL VIA APIFY =====
// Direct Rightmove commercial scraping is frequently blocked from datacenter IPs
// (the Render server). Apify's Rightmove actor with RESIDENTIAL proxy bypasses
// this, so commercial leads actually reach the pool. Falls back silently.
function fetchRightmoveApifyCommercial(areas, maxProperties) {
  return new Promise((resolve) => {
    try {
      const key = process.env.APIFY_API_KEY || '';
      if (!key) { resolve([]); return; }
      const areasList = (Array.isArray(areas) ? areas : [areas]).map(function(a) { return String(a).toUpperCase(); }).filter(Boolean);

      // Build commercial search URLs. The ACTOR's documented format uses a REGION
      // identifier with useLocationIdentifier=true&displayPropertyType=commercial.
      // Commercial volume is London-heavy, so always include Greater London (REGION^87490).
      function buildSaleUrls(includeAreas) {
        var urls = [];
        if (includeAreas) {
          (areasList.length ? areasList : ['GL']).forEach(function(a) {
            const areaUp = String(a).toUpperCase();
            const outcodeMap = {
              B: 94028, M: 94019, L: 94022, S: 94124, NE: 94100, BS: 93920, E: 93917,
              N: 93917, SW: 93917, SE: 93917, W: 93917, EC: 93917, WC: 93917, LE: 93905,
              LS: 93905, EX: 94118, TQ: 94118, PL: 94118, BA: 93920, CM: 93911, CO: 93911,
              SS: 93911, KT: 93917, TW: 93917, UB: 93917, HA: 93956, EN: 93950, NW: 93961,
              GL: 87490
            };
            var id = outcodeMap[areaUp] || outcodeMap[areaUp.substring(0, 2)] || outcodeMap[areaUp.substring(0, 1)];
            if (!id) id = 87490;
            urls.push('https://www.rightmove.co.uk/commercial-property-for-sale/find.html?useLocationIdentifier=true&locationIdentifier=REGION%5E' + id + '&radius=0.0&displayPropertyType=commercial&rent.x=Sale&search=For+Sale');
          });
        }
        urls.push('https://www.rightmove.co.uk/commercial-property-for-sale/find.html?useLocationIdentifier=true&locationIdentifier=REGION%5E87490&radius=0.0&displayPropertyType=commercial&rent.x=Sale&search=For+Sale');
        return urls;
      }

      function runActor(urls) {
        return new Promise(function(resolveRun) {
          const input = {
            listUrls: urls.map(function(u) { return { url: u }; }),
            propertyUrls: [],
            monitoringMode: false,
            fullPropertyDetails: false,
            includePriceHistory: false,
            includeNearestSchools: false,
            enableDelistingTracker: false,
            addEmptyTrackerRecord: false,
            maxProperties: maxProperties || 100,
            proxy: { useApifyProxy: true, apifyProxyGroups: ['SHARED_DATACENTER_PROXIES'], apifyProxyCountry: 'GB' }
          };
          const body = JSON.stringify(input);
          const req = https.request({
            hostname: 'api.apify.com',
            path: '/v2/acts/dhrumil~rightmove-scraper/run-sync-get-dataset-items?token=' + key + '&memory=256&timeout=120',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'application/json' },
            timeout: 150000
          }, function(res) {
            let b = '';
            res.on('data', function(c) { b += c; });
            res.on('end', function() {
              try {
                const items = JSON.parse(b);
                if (!Array.isArray(items)) { console.log('[RIGHTMOVE-COMMERCIAL-APIFY] non-array: ' + b.substring(0, 100)); resolveRun([]); return; }
                const leads = items.map(function(p) {
                  var addr = p.displayAddress || p.address || '';
                  var pcMatch = addr.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i);
                  return {
                    id: 'RMCAP_' + (p.id || Date.now()),
                    title: addr,
                    address: addr,
                    price: p.price ? (p.price.amount || 0) : 0,
                    bedrooms: 0,
                    commercial: true,
                    sqft: (p.features && p.features.SIZE) || '',
                    propertyType: p.propertySubType || p.propertyType || 'Commercial',
                    listingStatus: p.displayStatus || 'Available',
                    firstVisibleDate: p.firstVisibleDate || p.addedOn || new Date().toISOString(),
                    updateDate: p.updateDate || '',
                    url: p.url || ('https://www.rightmove.co.uk' + (p.propertyUrl || '')),
                    agent: p.customer ? (p.customer.branchDisplayName || p.customer.branchName || '') : '',
                    source: 'Rightmove Commercial (Apify)',
                    scrapedAt: new Date().toISOString(),
                    postcode: pcMatch ? pcMatch[0].trim() : ''
                  };
                });
                console.log('[RIGHTMOVE-COMMERCIAL-APIFY] ' + leads.length + ' commercial properties');
                resolveRun(leads);
              } catch(e) { console.log('[RIGHTMOVE-COMMERCIAL-APIFY] parse error: ' + e.message); resolveRun([]); }
            });
          });
          req.on('error', function(e) { console.log('[RIGHTMOVE-COMMERCIAL-APIFY] request error: ' + e.message); resolveRun([]); });
          req.setTimeout(150000, function() { req.destroy(); resolveRun([]); });
          req.write(body);
          req.end();
        });
      }

      (async function() {
        // Try with area-targeted URLs first, then fall back to Greater London only
        // (the actor is occasionally flaky with many commercial URLs).
        var leads1 = await runActor(buildSaleUrls(true));
        if (leads1.length === 0) {
          console.log('[RIGHTMOVE-COMMERCIAL-APIFY] area run empty — retrying with Greater London only');
          leads1 = await runActor(buildSaleUrls(false));
        }
        resolve(leads1);
      })();
    } catch(e) { resolve([]); }
  });
}

// ===== ZOOPLA VIA APIFY (house numbers + extra supply) =====
// Zoopla exposes full addresses WITH house numbers natively, unlike Rightmove.
// Runs through the rented dhrumil~zoopla-scraper actor. Flat $30/mo rental makes
// this far cheaper than Postcoder's per-lead cost at scale. Falls back silently
// if the actor isn't rented (403) or returns nothing.
function fetchZooplaApify(areas, maxProperties) {
  return new Promise(async (resolve) => {
    try {
      const key = process.env.APIFY_API_KEY || '';
      if (!key) { resolve([]); return; }
      const areasList = (Array.isArray(areas) ? areas : [areas]).map(function(a) { return String(a).toUpperCase(); }).filter(Boolean);
      if (areasList.length === 0) { resolve([]); return; }
      const listUrls = areasList.map(function(a) {
        const outcode = String(a).replace(/[^A-Z0-9]/gi, '').toLowerCase();
        return { url: 'https://www.zoopla.co.uk/for-sale/property/' + outcode + '/?results_sort=newest_listings&search_source=for-sale' };
      });
      // COST CONTROL: this actor crawls EVERY page of each list URL (~1000 props per
      // area) and there is no maxItems input, so cost scales with the NUMBER OF AREAS
      // per run - not with maxProperties (which the actor ignores). Keep the area list
      // small (ZOOPLA_MAX_AREAS in the caller) and run once per day. Proxy group is
      // env-tunable (APIFY_PROXY_GROUP); BUYPROXIES94952 is the one available on this
      // Apify account. Memory 1024 (256 OOMs Playwright) + generous wait time.
      const input = {
        listUrls: listUrls,
        fullPropertyDetails: false, // list view already has house numbers; keeps cost minimal
        monitoringMode: false,
        enableDelistingTracker: false,
        email: '',
        proxy: { useApifyProxy: true, apifyProxyGroups: [process.env.APIFY_PROXY_GROUP || 'BUYPROXIES94952'], apifyProxyCountry: process.env.APIFY_PROXY_COUNTRY || 'US' }
      };
      const body = JSON.stringify(input);
      // 1) Start the run (async, no sync timeout cap).
      const startPath = '/v2/acts/dhrumil~zoopla-scraper/runs?token=' + key + '&memory=1024';
      const runId = await new Promise(function(runResolve) {
        const req = https.request({
          hostname: 'api.apify.com', path: startPath, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Accept': 'application/json' },
          timeout: 60000
        }, function(res) {
          let b = ''; res.on('data', function(c) { b += c; });
          res.on('end', function() {
            try {
              const j = JSON.parse(b);
              if (j.data && j.data.id) runResolve(j.data.id);
              else { console.log('[ZOOPLA] start run failed: ' + b.substring(0, 160)); runResolve(''); }
            } catch(e) { console.log('[ZOOPLA] start parse error: ' + b.substring(0, 160)); runResolve(''); }
          });
        });
        req.on('error', function(e) { console.log('[ZOOPLA] start request error: ' + e.message); runResolve(''); });
        req.setTimeout(60000, function() { req.destroy(); runResolve(''); });
        req.write(body); req.end();
      });
      if (!runId) { resolve([]); return; }
      // 2) Wait for the run to finish (poll up to ~15 min).
      let status = '';
      let datasetId = '';
      const startedAt = Date.now();
      while (Date.now() - startedAt < 900000) {
        await new Promise(function(r) { setTimeout(r, 20000); });
        const st = await new Promise(function(stResolve) {
          const req = https.get('https://api.apify.com/v2/actor-runs/' + runId + '?token=' + key, function(res) {
            let b = ''; res.on('data', function(c) { b += c; });
            res.on('end', function() {
              try {
                const j = JSON.parse(b);
                if (j.data) { stResolve({ status: j.data.status, datasetId: j.data.defaultDatasetId || '' }); }
                else stResolve({ status: 'ERROR', datasetId: '' });
              } catch(e) { stResolve({ status: 'ERROR', datasetId: '' }); }
            });
          });
          req.on('error', function() { stResolve({ status: 'ERROR', datasetId: '' }); });
        });
        status = st.status;
        datasetId = st.datasetId;
        if (status === 'SUCCEEDED' || status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') break;
      }
      console.log('[ZOOPLA] run ' + runId + ' status=' + status);
      if (status !== 'SUCCEEDED' || !datasetId) { resolve([]); return; }
      // 3) Fetch the dataset items (limit = maxProperties if set, else all).
      const items = await new Promise(function(itemsResolve) {
        const limitQ = maxProperties ? '&limit=' + maxProperties : '';
        const req = https.get('https://api.apify.com/v2/datasets/' + datasetId + '/items?format=json' + limitQ + '&token=' + key, function(res) {
          let b = ''; res.on('data', function(c) { b += c; });
          res.on('end', function() {
            try { itemsResolve(JSON.parse(b)); } catch(e) { console.log('[ZOOPLA] dataset parse error'); itemsResolve([]); }
          });
        });
        req.on('error', function() { itemsResolve([]); });
      });
      const leads = (Array.isArray(items) ? items : []).map(function(p, i) {
        const addr = (p.address || '').trim();
        const num = (p.nameOrNumber || '').trim();
        const fullAddr = [num, addr].filter(Boolean).join(', ').trim();
        const priceMatch = String(p.price || '').match(/[0-9,]+/);
        return {
          id: 'ZOOPLA_' + (p.id || p.url || Date.now() + '_' + i),
          address: fullAddr || addr,
          fullAddress: fullAddr || addr,
          street: addr,
          buildingNumber: num,
          postcode: p.postalCode || (p.outcode ? p.outcode + ' ' + (p.incode || '') : ''),
          bedrooms: parseInt(p.bedrooms) || 0,
          propertyType: p.propertyType || 'Unknown',
          price: priceMatch ? parseInt(priceMatch[0].replace(/,/g, '')) : 0,
          priceLabel: p.price || '',
          status: 'available',
          agent: p.agent || '',
          url: p.url || '',
          firstVisibleDate: p.listingUpdateDate || p.lastUpdatedDate || new Date().toISOString(),
          updateDate: p.listingUpdateDate || p.lastUpdatedDate || '',
          source: 'Zoopla (Apify)',
          scrapedAt: new Date().toISOString()
        };
      });
      console.log('[ZOOPLA] ' + leads.length + ' leads (areas: ' + areasList.join(',') + ')');
      resolve(leads);
    } catch(e) { console.log('[ZOOPLA] error: ' + e.message); resolve([]); }
  });
}

module.exports = { collectMovingLeads, collectCommercialLeads, fetchRightmoveApifyCommercial, enrichMovingLeads, enrichMovingLeadsPostcoder, fetchPropertyDetail, lookupPostcoderAddress, lookupLandRegistryAddress, lookupZooplaAddress, parseZooplaAddress, readDoorNumberFromPhoto, fetchZooplaApify, matchPafAddress };

if (require.main === module) {
  collectMovingLeads().then(function(l) {
    console.log('Done: ' + l.length + ' leads');
  }).catch(function(e) {
    console.error(e);
  });
}
