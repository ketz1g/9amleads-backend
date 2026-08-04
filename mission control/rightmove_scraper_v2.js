// Rightmove Direct Scraper v2
// Extracts property data from __NEXT_DATA__ embedded in search HTML
// No Apify required - completely free

const https = require('https');

const LOCATIONS = [
  { id: 'REGION%5E93917', name: 'Greater London', pages: 50 },
  { id: 'REGION%5E94019', name: 'Manchester City Centre', pages: 8 },
  { id: 'REGION%5E94028', name: 'Birmingham City Centre', pages: 8 },
  { id: 'REGION%5E93905', name: 'Yorkshire and the Humber', pages: 8 },
  { id: 'REGION%5E94124', name: 'Sheffield City Centre', pages: 6 },
  { id: 'REGION%5E94022', name: 'Liverpool City Centre', pages: 6 },
  { id: 'REGION%5E94100', name: 'Newcastle City Centre', pages: 6 },
  { id: 'REGION%5E93914', name: 'North East, England', pages: 6 },
  { id: 'REGION%5E93911', name: 'East of England', pages: 6 },
  { id: 'REGION%5E93920', name: 'Bristol (County)', pages: 6 },
  { id: 'REGION%5E94118', name: 'South Devon', pages: 6 },
  { id: 'REGION%5E93961', name: 'NW (Postcode Area)', pages: 15 },
];

// Maps a UK postcode AREA code (e.g. "B", "HA", "NW") to working Rightmove region
// identifiers so we can scrape exactly where each customer asked for leads.
// Only regions verified to resolve to the correct place are listed.
const AREA_TO_REGIONS = {
  'NW': [93961],
  'HA': [93956],          // Harrow (London Borough)
  'EN': [93950],          // Enfield (London Borough)
  'B': [94028, 94127],    // Birmingham City Centre + Jewellery Quarter
  'M': [94019],           // Manchester City Centre
  'L': [94022],           // Liverpool City Centre
  'S': [94124],           // Sheffield City Centre
  'NE': [94100],          // Newcastle City Centre
  'BS': [93920],          // Bristol (County)
  'E': [93917, 93926],    // Greater London + North East London
  'N': [93917, 93926],
  'NW1': [93961],
  'SW': [93917],
  'SE': [93917],
  'W': [93917],
  'WC': [93917],
  'EC': [93917],
  'LE': [93905],
  'LS': [93905],
  'HD': [93905],
  'HG': [93905],
  'HU': [93905],
  'YO': [93905],
  'DN': [93905],
  'DN17': [93905],
  'EX': [94118],
  'TQ': [94118],
  'PL': [94118],
  'BA': [93920],
  'TA': [94118],
  'DT': [94118],
};

function fetchRightmovePage(locationId, locationName, pageIndex) {
  return new Promise((resolve) => {
    var path = '/property-for-sale/find.html?locationIdentifier=' + locationId + '&index=' + pageIndex + '&includeSSTC=true&sortType=6&propertyTypes=&mustHave=&dontShow=&furnishTypes=&keywords=';
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
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) {
          console.log('[RIGHTMOVE] HTTP ' + res.statusCode + ' for ' + locationId + ' index=' + pageIndex);
          resolve([]);
          return;
        }
        // Extract __NEXT_DATA__
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
            // Determine status from listingUpdate
            var status = 'Available';
            var statusReason = (p.listingUpdate && p.listingUpdate.listingUpdateReason || '').toLowerCase();
            if (statusReason.includes('sold') || statusReason.includes('sstc') || statusReason.includes('under offer')) {
              status = 'SSTC';
            } else if (statusReason.includes('reduced')) {
              status = 'Reduced';
            } else if (statusReason === 'new') {
              status = 'New';
            }
            // Check displayStatus for additional status info
            if (p.displayStatus) status = p.displayStatus;
            if (p.auction) status = 'Auction';
            return {
              id: 'RM_' + p.id,
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
              city: typeof searchResults.location === 'object' ? (searchResults.location.name || locationName) : (searchResults.location || locationName),
              postcode: (p.displayAddress || '').match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i) ? (p.displayAddress.match(/[A-Z]{1,2}\d{1,2}[A-Z]?\s*\d?[A-Z]?\s*\d?[A-Z]{0,2}/i)[0].trim()) : ''
            };
          });
          resolve(properties);
        } catch (e) {
          console.log('[RIGHTMOVE] Parse error:', e.message);
          resolve([]);
        }
      });
    });
    req.on('error', function(e) { resolve([]); });
    req.setTimeout(30000, function() { req.destroy(); resolve([]); });
    req.end();
  });
}

// Look up the full address (house number + street + postcode) via Postcoder
// (licensed Royal Mail PAF data). Given the street name and full postcode from
// the Rightmove detail page, Postcoder returns the numbered addresses so we can
// append the correct house number.
function lookupPostcoderAddress(postcode, streetHint) {
  return new Promise((resolve) => {
    const key = process.env.POSTCODER_API_KEY;
    if (!key) return resolve(null);
    const cleanPc = (postcode || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (!cleanPc) return resolve(null);
    const opts = {
      hostname: 'ws.postcoder.com',
      path: '/pcw/' + key + '/address/uk/' + cleanPc + '?format=json&lines=3&page=0',
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
          const addresses = JSON.parse(body);
          if (!Array.isArray(addresses) || addresses.length === 0) { resolve(null); return; }
          // Normalise the Rightmove street hint for matching
          const hint = (streetHint || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          if (hint) {
            // Prefer the address whose street matches the hint
            const match = addresses.find(function(a) {
              const st = (a.street || a.addressline1 || '').toLowerCase().replace(/[^a-z0-9]/g, '');
              return hint && st && st.indexOf(hint) !== -1;
            });
            if (match) return resolve({
              fullAddress: match.summaryline || match.addressline1 || '',
              address1: match.addressline1 || '',
              street: match.street || '',
              buildingNumber: match.number || match.premise || '',
              town: match.posttown || match.county || '',
              postcode: match.postcode || cleanPc,
              udprn: match.udprn || ''
            });
          }
          // Fallback: first address in the list
          const a = addresses[0];
          resolve({
            fullAddress: a.summaryline || a.addressline1 || '',
            address1: a.addressline1 || '',
            street: a.street || '',
            buildingNumber: a.number || a.premise || '',
            town: a.posttown || a.county || '',
            postcode: a.postcode || cleanPc,
            udprn: a.udprn || ''
          });
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
    req.end();
  });
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
      res.on('data', (c) => body += c);
      res.on('end', () => {
        if (res.statusCode !== 200) return resolve(null);
        const result = {};
        // Full street address from the h1 (includes building name/number + street)
        const street = body.match(/itemProp="streetAddress">([^<]+)<\/h1>/);
        if (street) result.fullAddress = street[1].trim();
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
      }
      enriched[i] = lead;
    }
  }
  const workers = [];
  for (let w = 0; w < concurrency; w++) workers.push(worker());
  await Promise.all(workers);
  return enriched.filter(Boolean);
}

// Enrich a SMALL batch (the final selected leads) with exact house numbers via
// Postcoder (licensed Royal Mail PAF). Rightmove never publishes house numbers,
// so this is the accurate source — but it is rate-limited, so use sparingly.
async function enrichMovingLeadsPostcoder(leads) {
  const enriched = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    if (lead.postcode) {
      const streetHint = lead.fullAddress || lead.address || '';
      let fullAddr = await lookupPostcoderAddress(lead.postcode, streetHint);
      if (fullAddr && fullAddr.rateLimited) {
        await new Promise(function(r) { setTimeout(r, 30000); });
        fullAddr = await lookupPostcoderAddress(lead.postcode, streetHint);
      }
      if (fullAddr && !fullAddr.rateLimited) {
        lead.address = fullAddr.fullAddress || fullAddr.address1 || lead.address;
        lead.fullAddress = fullAddr.fullAddress || lead.address;
        lead.street = fullAddr.street || lead.street || '';
        lead.buildingNumber = fullAddr.buildingNumber || '';
        lead.postcode = fullAddr.postcode || lead.postcode;
        lead.udprn = fullAddr.udprn || '';
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
          extraLocs.push({ id: locKey, name: key + ' area', pages: 12 });
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
      var isAreaTargeted = !!(config.areas && Array.isArray(config.areas) && config.areas.length > 0 && / area$/.test(loc.name || ''));
      var maxPages = loc.pages || 2;
      for (var pi = 0; pi < maxPages; pi++) {
        var pg = await fetchRightmovePage(loc.id, loc.name, pi * 24);
        if (pg.length === 0) break;
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
    return true;
  });

  console.log('[RIGHTMOVE] Total: ' + deduped.length + ' unique properties from ' + locations.length + ' areas');
  return deduped;
}

module.exports = { collectMovingLeads, enrichMovingLeads, enrichMovingLeadsPostcoder, fetchPropertyDetail, lookupPostcoderAddress };

if (require.main === module) {
  collectMovingLeads().then(function(l) {
    console.log('Done: ' + l.length + ' leads');
  }).catch(function(e) {
    console.error(e);
  });
}
