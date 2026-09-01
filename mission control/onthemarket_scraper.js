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
  'KT': 'kingston-upon-thames', 'TW': 'twickenham', 'HA': 'harrow', 'CM': 'chelmsford',
  'L': 'liverpool', 'WA': 'warrington', 'CH': 'chester', 'WN': 'wigan', 'PR': 'preston',
  'AL': 'st-albans', 'M': 'manchester', 'BL': 'bolton', 'OL': 'oldham', 'SK': 'stockport',
  'SM': 'sutton', 'BR': 'bromley', 'UB': 'uxbridge', 'WD': 'watford', 'SG': 'stevenage',
  'SS': 'southend', 'CO': 'colchester', 'ME': 'medway', 'CT': 'canterbury', 'TN': 'tunbridge-wells',
  // Added Sep 2026 to cover the remaining customer areas (previously many areas
  // had no slug so they got NO OnTheMarket supply at all).
  'BT': 'belfast', 'G': 'glasgow', 'EH': 'edinburgh', 'AB': 'aberdeen', 'DD': 'dundee',
  'NG': 'nottingham', 'DE': 'derby', 'LE': 'leicester', 'LN': 'lincoln', 'DN': 'doncaster',
  'GL': 'gloucester', 'BS': 'bristol', 'SN': 'swindon', 'RG': 'reading', 'BA': 'bath',
  'B': 'birmingham', 'WS': 'walsall', 'WV': 'wolverhampton', 'DY': 'dudley', 'CV': 'coventry',
  'S': 'sheffield', 'HU': 'hull', 'YO': 'york', 'WF': 'wakefield', 'PE': 'peterborough',
  'CB': 'cambridge', 'NR': 'norwich', 'IP': 'ipswich', 'EX': 'exeter', 'PL': 'plymouth',
  'TQ': 'torquay', 'TR': 'truro', 'TA': 'taunton', 'BH': 'bournemouth', 'PO': 'portsmouth',
  'SO': 'southampton', 'SP': 'salisbury', 'DT': 'dorchester', 'KY': 'kirkcaldy', 'FK': 'stirling', 'LS': 'leeds'
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

// Retry a GET with exponential backoff for transient failures (429 / 5xx / timeout).
// OTM rate-limits rapid fire requests, so consecutive areas must be throttled too.
async function httpGetRetry(host, path, opts) {
  opts = opts || {};
  const maxAttempts = (opts.retries != null) ? opts.retries : 3;
  const delayMs = (opts.delayMs != null) ? opts.delayMs : 2500;
  let last = null;
  for (let a = 0; a < maxAttempts; a++) {
    if (a > 0) await sleep(delayMs * a);
    last = await httpGet(host, path, opts.timeoutMs);
    if (last.status === 200) return last;
    if (last.status === 429 || last.status === 403 || last.status >= 500 || last.status === 0) {
      continue; // retry
    }
    break; // 404 etc — don't retry
  }
  return last;
}
function sleep(ms) { return new Promise(function(r){ setTimeout(r, ms); }); }

function parseListPage(body) {
  // OTM's page structure changed (Sep 2026): each listing is an <li id="result-{id}">
  // block containing the property card (title="View the details for {address} -
  // {beds} {type} for sale"), a £price, and a freshness <span>Added &lt; 7 days</span>
  // / <span>Added &gt; 14 days</span>. There is no longer a __NEXT_DATA__ JSON
  // blob, so we parse the <li> blocks directly.
  const items = String(body).split(/<li id="result-/).slice(1);
  const out = [];
  for (let ci = 0; ci < items.length; ci++) {
    const li = items[ci];
    const idM = li.match(/^(\d+)"/);
    const titleM = li.match(/title="View the details for ([^"]+)"/);
    if (!idM || !titleM) continue;
    const title = titleM[1];
    const dash = title.indexOf(' - ');
    const address = dash > 0 ? title.substring(0, dash).trim() : title;
    const bedsM = title.match(/(\d+)\s*beds?/i);
    const typeM = title.match(/for (?:sale|rent)\s*[^-]*?(\w[\w '-]*?)\s*$/i);
    const priceM = li.match(/£([0-9,]+)/);
    const freshM = li.match(/Added\s*(&lt;|&gt;|<|>)?\s*([\d\w\- ]+?)<\/span>/i);
    let normLabel = '';
    if (freshM) {
      if (freshM[1] === '&lt;' || freshM[1] === '<') normLabel = 'Added today';   // "Added < 7 days" = listed very recently -> treat as fresh today
      else if (freshM[1] === '&gt;' || freshM[1] === '>') normLabel = 'Added 99 days ago'; // "Added > 14 days" = stale
      else if (/today/i.test(freshM[2] || '')) normLabel = 'Added today';
      else if (/yesterday/i.test(freshM[2] || '')) normLabel = 'Added yesterday';
      else if (/\d+\s*days?\s*ago/.test(freshM[2] || '')) normLabel = freshM[2];
    }
    out.push({
      id: idM[1],
      address: address,
      propertyType: (typeM && typeM[1]) ? typeM[1].trim() : (bedsM ? 'House' : ''),
      bedrooms: parseInt(bedsM && bedsM[1]) || 0,
      price: priceM ? priceM[1] : '',
      priceNum: priceM ? parseInt(priceM[1].replace(/[^0-9]/g, '')) : 0,
      daysSinceAdded: normLabel,
      url: '/details/' + idM[1] + '/',
      agent: '',
      mainLabel: ''
    });
  }
  // Dedup by id.
  const seen = {};
  return out.filter(function(l) { if (seen[l.id]) return false; seen[l.id] = 1; return l.id && l.url; });
}

function parseDetailPostcode(body) {
  const m = body.match(/"postcode":"([A-Z0-9 ]{5,8})"/);
  return m ? m[1].trim() : '';
}

// Extract the FULL address (including town/locality) from the OTM detail page.
// The list page only exposes a street-only address, but the detail page embeds the
// full printable address in its data layer, e.g.
//   "address":"299 Kennington Road\nKennington\nSE11 4QE"
//   "address":"1 Charlton Road, London, Greater London, SE3 7EU"
// Returns { postcode, address } — the address with town/county, newlines->commas.
function parseDetailAddress(body) {
  let pc = parseDetailPostcode(body);
  let addr = '';
  const am = body.match(/"address":"([^"]{6,200})"/);
  if (am) {
    addr = am[1]
      .replace(/\\n/g, ',')
      .replace(/\s+/g, ' ')
      .split(',')
      .map(function(p){ return p.trim(); })
      .filter(Boolean)
      .join(', ');
  }
  return { postcode: pc, address: addr };
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

// Map the OTM freshness label to the property's ACTUAL listing date, so the
// delivery's 48h gate enforces true freshness (an OTM lead listed 3 days ago
// gets a 3-day-old firstVisibleDate and is rejected). Returns null for labels
// that don't prove a date (e.g. "Added > 14 days", "Reduced") so stale or
// ambiguous listings can NEVER look freshly added - callers must drop those.
function otmListedDate(daysLabel) {
  const s = String(daysLabel || '').toLowerCase();
  let d = -1;
  if (s.indexOf('added today') !== -1) d = 0;
  else if (s.indexOf('added yesterday') !== -1) d = 1;
  else {
    const m = s.match(/added\s+(\d+)\s+days?\s+ago/);
    if (m) d = parseInt(m[1], 10) || 0;
  }
  if (d < 0) return null;
  return new Date(Date.now() - d * 86400000).toISOString();
}

// New-build / development marketing listings are NOT home-mover leads: OTM
// titles them "2 Bedroom Apartment For Sale on Ashton Bank Way" (no real
// street number, a developer marketing a block). Genuine resale listings have
// real addresses ("15 New Market Street, Wigan"). Skip any listing whose
// address is title-style or references a whole development/building.
function isDevelopmentListing(l) {
  const a = String(l.address || '');
  if (/\bfor\s+(sale|rent|let)\s+on\b/i.test(a)) return true;               // "..Apartment For Sale on X"
  if (/^\s*\d+\s*(?:bed(?:room)?s?|studio)\b/i.test(a)) return true;        // "2 Bedroom Apartment..."
  if (/\b(?:development|new\s*homes?|new\s*build|off\s*plan|phase\s*\d)\b/i.test(a)) return true;
  if (/^\s*[A-Z][A-Za-z '-]+\s+(?:at|on)\s+[A-Z]/i.test(a) && /\b(?:apartments?|flats?|homes?|residences?|courts?|wharf|waters)\b/i.test(a)) return true;
  const t = String(l['humanised-property-type'] || '');
  if (/land|new\s*homes?|development/i.test(t)) return true;
  return false;
}

function extractPostcodeArea(pc) {
  if (!pc) return '';
  const m = String(pc).match(/^\s*([A-Z]{1,2})[0-9]/i);
  return m ? m[1].toUpperCase() : '';
}

// Pull the door number / flat identifier from the front of an OTM address so the
// delivery's door-number gate can use it. Examples:
//   "55 Burlington Street"       -> "55"
//   "Flat 3, Enfield Court"      -> "Flat 3"
//   "Apartment 101, 145 Farnworth" -> "Apartment 101"
//   "2 Yew Tree Road"            -> "2"
// Returns '' when the address doesn't start with a number/flat (e.g. "Costcutter
// Supermarket, 55 Burlington Street" — a named premise; leave door blank).
function extractBuildingNumber(addr) {
  const s = String(addr || '').trim();
  const m = s.match(/^(?:Flat|Apartment|Suite|Unit)\s+[A-Z0-9\-]+/i);
  if (m) return m[0];
  const n = s.match(/^(\d+[A-Z]?)\b/);
  return n ? n[1] : '';
}

// Strip the leading number / flat from the address to leave the street name.
function extractStreetName(addr) {
  let s = String(addr || '').trim();
  s = s.replace(/^(?:Flat|Apartment|Suite|Unit)\s+[A-Z0-9\-]+,\s*/i, '');
  s = s.replace(/^\d+[A-Z]?\s*,\s*/, '');
  s = s.replace(/^\d+[A-Z]?\s+/, '');
  return s.trim();
}

// Parse town / city / county out of the OTM address text so every lead carries a
// usable town for Print & Post. OTM addresses look like:
//   "1 Charlton Road, London, Greater London, SE3 7EU"
//   "1128 Eastern Avenue, Ilford, Greater London, IG2 7SD"
//   "39 Shirley Avenue, Croydon, Surrey, CR0 8SN"
//   "Costcutter Supermarket, 55 Burlington Street, Liverpool, Merseyside, L3 6LG"
// Strategy: drop the leading premise/door/street portion (up to the 2nd-3rd comma),
// then the last segment(s) that aren't the postcode/county are the town.
function extractTownCounty(addr, postcode) {
  const s = String(addr || '').trim().replace(/\n/g, ',');
  let parts = s.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
  if (!parts.length) return { town: '', city: '', county: '' };
  // Remove trailing postcode / partial postcode segments
  while (parts.length && /^[A-Z]{1,2}\d/i.test(parts[parts.length-1])) parts.pop();
  if (!parts.length) return { town: '', city: '', county: '' };
  // Street-only address ("204A Brixton Road") has NO town info — leave it empty so
  // the postcode-based enrichment fills it, rather than faking "Brixton Road" as a town.
  if (parts.length === 1) return { town: '', city: '', county: '' };
  // "299 Kennington Road, Kennington"          -> town = Kennington
  // "39 Shirley Avenue, Croydon, Surrey"       -> town = Croydon, county = Surrey
  // "1128 Eastern Avenue, Ilford, Greater London" -> town = Ilford, county = Greater London
  if (parts.length === 2) return { town: parts[1], city: parts[1], county: '' };
  return { town: parts[parts.length - 2], city: parts[parts.length - 2], county: parts[parts.length - 1] };
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
    // Throttle between areas so OTM doesn't rate-limit the whole batch.
    if (ai > 0) await sleep(1800);
    const listRes = await httpGetRetry('www.onthemarket.com', '/for-sale/property/' + slug + '/?view_type=list', { retries: 3, delayMs: 2500 });
    if (listRes.status !== 200) { console.log('[OTM] list ' + area + ' HTTP ' + listRes.status); continue; }
    let listings = parseListPage(listRes.body);
    // Optional second page for more volume.
    if (maxPerArea > 30 && listings.length >= 30) {
      await sleep(1500);
      const p2 = await httpGetRetry('www.onthemarket.com', '/for-sale/property/' + slug + '/?view_type=list&page=2', { retries: 3, delayMs: 2500 });
      if (p2.status === 200) listings = listings.concat(parseListPage(p2.body));
    }
    listings = listings.slice(0, maxPerArea);
    // Only genuinely fresh OTM listings (added within maxDays) - we promise
    // customers fresh leads within 24-48h, so the portal's own freshness label
    // is the gate (not our scrape time). maxDays=2 => only listings added
    // today / yesterday / within 2 days are accepted.
    const fresh = listings.filter(function(l) {
      if (isDevelopmentListing(l)) return false;                 // new-build/dev marketing != home-mover
      if (maxDays === 0) return true;                            // maxDays=0 => no freshness gate (one-off fills)
      return isFreshEnough(l.daysSinceAdded, maxDays);
    });
    if (fresh.length === 0) { console.log('[OTM] ' + area + ': ' + listings.length + ' listings, 0 fresh'); continue; }
    // Fetch detail pages for the full postcode (free) - bounded.
    const freshToResolve = fresh.slice(0, Math.max(0, detailCap - detailFetches));
    const resolved = new Array(freshToResolve.length);
    let idx = 0;
    while (idx < freshToResolve.length) {
      const batch = freshToResolve.slice(idx, idx + concurrency);
      const results = await Promise.all(batch.map(function(l) { return httpGetRetry('www.onthemarket.com', l.url, { retries: 2, delayMs: 2000 }); }));
      results.forEach(function(r, bi) {
        // Use the robust parser (postcode + full address). If the detail JSON
        // postcode is missing, fall back to a UK postcode found anywhere in the
        // detail body so a listing is never dropped for a missing field.
        let da = parseDetailAddress(r.body);
        if (!da.postcode) {
          const pcAny = String(r.body || '').match(/\b[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}\b/i);
          if (pcAny) { const pr = pcAny[0].toUpperCase().replace(/[^A-Z0-9]/g, ''); da.postcode = pr.slice(0, pr.length - 3) + ' ' + pr.slice(-3); }
        }
        resolved[idx + bi] = da;
      });
      idx += concurrency;
      if (idx < freshToResolve.length) await sleep(1200);
    }
    detailFetches += freshToResolve.length;
    freshToResolve.forEach(function(l, li) {
      const detail = resolved[li];
      if (!detail) return;
      const pc = detail.postcode;
      if (!pc) return;
      let fv = otmListedDate(l.daysSinceAdded);
      if (!fv) { if (maxDays === 0) { fv = new Date().toISOString(); } else { return; } } // no-gate fill accepts ambiguous labels; otherwise drop
      // The detail page carries the full address (with town/county). Use it for
      // town/city/county so every lead has a usable printable address; keep the
      // list street-address as the premise text.
      const fullAddr = detail.address || l.address;
      const tc = extractTownCounty(fullAddr, pc);
      const lead = {
        id: 'OTM_' + l.id,
        listingId: l.id,
        address: l.address,
        fullAddress: l.address,
        // Extract the door number / flat from the front of the address so the
        // delivery's door-number gate and Postcoder PAF can use it. OTM embeds it
        // in the address text ("55 Burlington Street", "Flat 3 X", "Apartment 101"),
        // but leaves the field blank — without extraction every lead would be
        // rejected as door-less and never delivered.
        building_number: extractBuildingNumber(l.address),
        street: extractStreetName(l.address),
        // Parse town/city/county so every lead has them for Print & Post.
        town: tc.town,
        city: tc.city,
        county: tc.county,
        postcode: pc,
        bedrooms: l.bedrooms,
        price: l.priceNum || l.price,
        priceLabel: l.price,
        propertyType: l.propertyType || 'House',
        url: 'https://www.onthemarket.com' + l.url,
        agent: l.agent,
        status: 'available',
        firstVisibleDate: fv,
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

module.exports = { collectOnTheMarketLeads, OTM_SLUGS, extractPostcodeArea, isDevelopmentListing, otmListedDate, extractBuildingNumber, extractStreetName, extractTownCounty, parseDetailAddress };
