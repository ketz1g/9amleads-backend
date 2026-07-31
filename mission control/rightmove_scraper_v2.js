// Rightmove Direct Scraper v2
// Extracts property data from __NEXT_DATA__ embedded in search HTML
// No Apify required - completely free

const https = require('https');

const LOCATIONS = [
  { id: 'REGION%5E87490', name: 'London', pages: 50 },
  { id: 'REGION%5E87464', name: 'Manchester & North West', pages: 15 },
  { id: 'REGION%5E87463', name: 'Birmingham & Midlands', pages: 15 },
  { id: 'REGION%5E87474', name: 'Yorkshire & Humber', pages: 15 },
  { id: 'REGION%5E87479', name: 'Essex', pages: 12 },
  { id: 'REGION%5E87475', name: 'Hertfordshire', pages: 12 },
  { id: 'REGION%5E87477', name: 'Kent', pages: 12 },
  { id: 'REGION%5E87465', name: 'Surrey', pages: 12 },
  { id: 'REGION%5E87473', name: 'Sussex', pages: 12 },
  { id: 'REGION%5E87480', name: 'Hampshire', pages: 12 },
  { id: 'REGION%5E87466', name: 'Thames Valley', pages: 12 },
  { id: 'REGION%5E87482', name: 'East Midlands', pages: 10 },
  { id: 'REGION%5E87481', name: 'South West', pages: 10 },
  { id: 'REGION%5E87476', name: 'East of England', pages: 10 },
  { id: 'REGION%5E87483', name: 'North East', pages: 8 },
  { id: 'REGION%5E87493', name: 'Scotland', pages: 8 },
  { id: 'REGION%5E87494', name: 'Wales', pages: 8 },
];

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
// by fetching their detail pages. Runs with a small delay between requests.
async function enrichMovingLeads(leads, concurrency) {
  concurrency = concurrency || 3;
  const enriched = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const detail = await fetchPropertyDetail(lead.url);
    if (detail) {
      lead.address = detail.fullAddress || lead.address;
      lead.postcode = detail.postcode || lead.postcode || '';
      lead.fullAddress = detail.fullAddress || lead.address;
    }
    enriched.push(lead);
    if (i % concurrency === 0 && i > 0) {
      await new Promise(function(r) { setTimeout(r, 400); });
    }
  }
  return enriched;
}

async function collectMovingLeads(config) {
  config = config || {};
  const locations = config.locations || LOCATIONS;
  const allProperties = [];

  for (const loc of locations) {
    try {
      var maxPages = loc.pages || 2;
      for (var pi = 0; pi < maxPages; pi++) {
        var pg = await fetchRightmovePage(loc.id, loc.name, pi * 24);
        if (pg.length === 0) break;
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

module.exports = { collectMovingLeads, enrichMovingLeads, fetchPropertyDetail };

if (require.main === module) {
  collectMovingLeads().then(function(l) {
    console.log('Done: ' + l.length + ' leads');
  }).catch(function(e) {
    console.error(e);
  });
}
