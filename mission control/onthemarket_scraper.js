// OnTheMarket scraper for 9amLeads Moving pipeline.
// Direct scrape (no Apify/paid credits) - HTTP 200 from datacenter IPs.
//
// OTM hides house numbers like Rightmove, BUT:
//   - list view gives street + beds + price + agent + URL + freshness (days-since-added)
//   - the detail page exposes the FULL postcode in its data layer (free)
// The delivery pipeline's Postcoder PAF then adds the door number for the exact
// sent leads. This source DOUBLES the pool's candidate supply per area.
const https = require('https');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Customer postcode AREA (outcode) -> OnTheMarket location slug.
const OTM_SLUGS = {
  'SW': 'south-west-london', 'SE': 'south-east-london', 'E': 'east-london', 'N': 'north-london',
  'NW': 'north-west-london', 'W': 'west-london', 'EC': 'central-london', 'WC': 'central-london',
  'CR': 'croydon', 'EN': 'enfield', 'IG': 'ilford', 'RM': 'romford', 'DA': 'dartford',
  'KT': 'kingston-upon-thames', 'TW': 'twickenham', 'HA': 'harrow', 'CM': 'chelmsford'
};

function httpGet(host, path, timeoutMs) {
  return new Promise((resolve) => {
    const req = https.request({ hostname: host, port: 443, method: 'GET', path, headers: { 'User-Agent': UA, 'Accept': 'text/html' } }, (res) => {
      let b = '';
      res.on('data', c => { if (b.length < 1200000) b += c; });
      res.on('end', () => resolve({ status: res.statusCode, body: b }));
    });
    req.on('error', (e) => resolve({ status: 0, body: 'ERR ' + e.message }));
    req.setTimeout(timeoutMs || 25000, () => { req.destroy(); resolve({ status: 0, body: 'TIMEOUT' }); });
    req.end();
  });
}

function parseListPage(body) {
  const i = body.indexOf('__NEXT_DATA__');
  if (i < 0) return [];
  const js = body.indexOf('>', i) + 1;
  const ct = body.indexOf('</script>', js);
  if (ct < 0) return [];
  let j;
  try { j = JSON.parse(body.substring(js, ct).trim()); } catch (e) { return []; }
  const irst = j.props && j.props.initialReduxState;
  const list = (irst && irst.results && irst.results.list) || [];
  return list.map(function(l) {
    return {
      id: String(l.id || ''),
      address: (l.address || '').trim(),
      propertyType: l['humanised-property-type'] || '',
      bedrooms: parseInt(l.bedrooms) || 0,
      price: l['short-price'] || l.price || '',
      priceNum: parseInt(String(l.price || '').replace(/[^0-9]/g, '')) || 0,
      daysSinceAdded: l['days-since-added-reduced'] || '',
      url: l['details-url'] || '',
      agent: (l.agent && l.agent.name) || '',
      mainLabel: l['main-label'] || ''
    };
  }).filter(function(l) { return l.id && l.url; });
}

function parseDetailPostcode(body) {
  const m = body.match(/"postcode":"([A-Z0-9 ]{5,8})"/);
  return m ? m[1].trim() : '';
}

// Freshness: keep listings added within maxDays (default 7). Parses the
// "days-since-added-reduced" label (e.g. "Added today", "Added 3 days ago",
// "Added > 14 days"). Anything ambiguous (e.g. just "Reduced") is skipped.
function isFreshEnough(daysLabel, maxDays) {
  const s = String(daysLabel || '').toLowerCase();
  if (s.indexOf('added today') !== -1) return true;
  if (s.indexOf('added yesterday') !== -1) return true;
  const m = s.match(/added\s+(\d+)\s+days?\s+ago/);
  if (m) return parseInt(m[1], 10) <= maxDays;
  return false;
}

function extractPostcodeArea(pc) {
  if (!pc) return '';
  const m = String(pc).match(/^\s*([A-Z]{1,2})[0-9]/i);
  return m ? m[1].toUpperCase() : '';
}

async function collectOnTheMarketLeads(params) {
  const out = [];
  const areas = (params && params.areas) || [];
  const maxPerArea = parseInt((params && params.maxPerArea) || 30, 10);
  const maxDays = parseInt((params && params.maxDays) || 7, 10);
  const detailCap = parseInt((params && params.detailCap) || 80, 10);
  const concurrency = 4;
  let detailFetches = 0;

  for (let ai = 0; ai < areas.length; ai++) {
    const area = String(areas[ai] || '').toUpperCase().replace(/[^A-Z]/g, '');
    const slug = OTM_SLUGS[area];
    if (!slug) { console.log('[OTM] no slug for area ' + area); continue; }
    const listRes = await httpGet('www.onthemarket.com', '/for-sale/property/' + slug + '/?view_type=list');
    if (listRes.status !== 200) { console.log('[OTM] list ' + area + ' HTTP ' + listRes.status); continue; }
    let listings = parseListPage(listRes.body);
    // Optional second page for more volume.
    if (maxPerArea > 30 && listings.length >= 30) {
      const p2 = await httpGet('www.onthemarket.com', '/for-sale/property/' + slug + '/?view_type=list&page=2');
      if (p2.status === 200) listings = listings.concat(parseListPage(p2.body));
    }
    listings = listings.slice(0, maxPerArea);
    const fresh = listings.filter(function(l) { return isFreshEnough(l.daysSinceAdded, maxDays); });
    if (fresh.length === 0) { console.log('[OTM] ' + area + ': ' + listings.length + ' listings, 0 fresh'); continue; }
    // Fetch detail pages for the full postcode (free) - bounded.
    const freshToResolve = fresh.slice(0, Math.max(0, detailCap - detailFetches));
    const resolved = new Array(freshToResolve.length);
    let idx = 0;
    while (idx < freshToResolve.length) {
      const batch = freshToResolve.slice(idx, idx + concurrency);
      const results = await Promise.all(batch.map(function(l) { return httpGet('www.onthemarket.com', l.url); }));
      results.forEach(function(r, bi) {
        resolved[idx + bi] = parseDetailPostcode(r.body);
      });
      idx += concurrency;
    }
    detailFetches += freshToResolve.length;
    freshToResolve.forEach(function(l, li) {
      const pc = resolved[li];
      if (!pc) return;
      const lead = {
        id: 'OTM_' + l.id,
        listingId: l.id,
        address: l.address,
        fullAddress: l.address,
        street: l.address,
        postcode: pc,
        bedrooms: l.bedrooms,
        price: l.priceNum || l.price,
        priceLabel: l.price,
        propertyType: l.propertyType || 'House',
        url: 'https://www.onthemarket.com' + l.url,
        agent: l.agent,
        status: 'available',
        firstVisibleDate: new Date().toISOString(),
        updateDate: new Date().toISOString(),
        daysSinceAdded: l.daysSinceAdded,
        source: 'OnTheMarket',
        scrapedAt: new Date().toISOString()
      };
      out.push(lead);
    });
    console.log('[OTM] ' + area + ': ' + listings.length + ' listings, ' + fresh.length + ' fresh, ' + freshToResolve.length + ' postcode-resolved');
  }
  return out;
}

module.exports = { collectOnTheMarketLeads, OTM_SLUGS, extractPostcodeArea };
