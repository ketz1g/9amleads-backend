// Rightmove Direct Scraper v2
// Extracts property data from __NEXT_DATA__ embedded in search HTML
// No Apify required - completely free

const https = require('https');

const LOCATIONS = [
  { id: 'REGION%5E87490', name: 'London' },
  { id: 'REGION%5E87464', name: 'Manchester' },
  { id: 'REGION%5E87463', name: 'Birmingham' },
  { id: 'REGION%5E87479', name: 'Essex' },
  { id: 'REGION%5E87475', name: 'Hertfordshire' },
  { id: 'REGION%5E87477', name: 'Kent' },
  { id: 'REGION%5E87465', name: 'Surrey' },
  { id: 'REGION%5E87473', name: 'Sussex' },
  { id: 'REGION%5E87480', name: 'Hampshire' },
  { id: 'REGION%5E87466', name: 'Thames Valley' },
  // Postcode-specific searches for wider London coverage
  { id: 'REGION%5E87490', name: 'London', search: 'E1' },
  { id: 'REGION%5E87490', name: 'London', search: 'E2' },
  { id: 'REGION%5E87490', name: 'London', search: 'E3' },
  { id: 'REGION%5E87490', name: 'London', search: 'E4' },
  { id: 'REGION%5E87490', name: 'London', search: 'E5' },
  { id: 'REGION%5E87490', name: 'London', search: 'E6' },
  { id: 'REGION%5E87490', name: 'London', search: 'E7' },
  { id: 'REGION%5E87490', name: 'London', search: 'E8' },
  { id: 'REGION%5E87490', name: 'London', search: 'E9' },
  { id: 'REGION%5E87490', name: 'London', search: 'E10' },
  { id: 'REGION%5E87490', name: 'London', search: 'E11' },
  { id: 'REGION%5E87490', name: 'London', search: 'E12' },
  { id: 'REGION%5E87490', name: 'London', search: 'E14' },
  { id: 'REGION%5E87490', name: 'London', search: 'E15' },
  { id: 'REGION%5E87490', name: 'London', search: 'E16' },
  { id: 'REGION%5E87490', name: 'London', search: 'E17' },
  { id: 'REGION%5E87490', name: 'London', search: 'E18' },
  { id: 'REGION%5E87490', name: 'London', search: 'E20' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW1' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW2' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW3' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW5' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW6' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW7' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW8' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW9' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW10' },
  { id: 'REGION%5E87490', name: 'London', search: 'NW11' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN1' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN2' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN3' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN4' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN5' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN6' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN7' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN8' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN9' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN10' },
  { id: 'REGION%5E87490', name: 'London', search: 'EN11' },
];

function fetchRightmovePage(locationId, locationName, pageIndex, searchKeyword) {
  return new Promise((resolve) => {
    var searchPath = '/property-for-sale/find.html?locationIdentifier=' + locationId + '&index=' + pageIndex + '&includeSSTC=true';
    if (searchKeyword) searchPath += '&keywords=' + encodeURIComponent(searchKeyword);
    const opts = {
      hostname: 'www.rightmove.co.uk',
      path: searchPath,
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

async function collectMovingLeads(config) {
  config = config || {};
  const locations = config.locations || LOCATIONS;
  const allProperties = [];

  for (const loc of locations) {
    try {
      // Get first page (index=0)
      const page1 = await fetchRightmovePage(loc.id, loc.name, 0, loc.search);
      console.log('[RIGHTMOVE] ' + loc.name + (loc.search ? ' (' + loc.search + ')' : '') + ': ' + page1.length + ' properties');
      allProperties.push.apply(allProperties, page1);

      // Get second page if first page had results (index=24)
      if (page1.length >= 24) {
        const page2 = await fetchRightmovePage(loc.id, loc.name, 24, loc.search);
        console.log('[RIGHTMOVE] ' + loc.name + (loc.search ? ' (' + loc.search + ')' : '') + ': ' + page2.length + ' properties from page 2');
        allProperties.push.apply(allProperties, page2);
      }

      // Rate limiting between locations
      if (loc !== locations[locations.length - 1]) {
        await new Promise(function(r) { setTimeout(r, 1500); });
      }
    } catch (e) {
      console.log('[RIGHTMOVE] Error scraping ' + loc.name + ':', e.message);
    }
  }

  // Deduplicate by property ID
  var seenIds = {};
  var deduped = allProperties.filter(function(p) {
    if (seenIds[p.id]) return false;
    seenIds[p.id] = true;
    return true;
  });

  console.log('[RIGHTMOVE] Total: ' + deduped.length + ' unique properties from ' + locations.length + ' areas');
  return deduped;
}

module.exports = { collectMovingLeads };

if (require.main === module) {
  collectMovingLeads().then(function(l) {
    console.log('Done: ' + l.length + ' leads');
  }).catch(function(e) {
    console.error(e);
  });
}
