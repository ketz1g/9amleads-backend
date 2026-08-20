// Plota Planning Applications API Provider
// Implements the Planning Provider Interface using Plota's API.
//
// Requires PLOTA_API_KEY env var.
// Pricing: £49/mo Starter (20k req), £149/mo Pro (100k req)
// Docs: https://www.plota.co.uk/api-docs

const https = require('https');
const planningProvider = require('./planning_provider');

const BASE = 'api.plota.co.uk';
const API_KEY = process.env.PLOTA_API_KEY || '';

// Trade categorisation from proposal descriptions
const TRADE_KEYWORDS = {
  builders: ['new dwelling','extension','loft conversion','garage conversion','new build','house','flat','apartment','dormer','storey','storey rear','two storey','single storey'],
  roofers: ['roof','roofing','roof light','skylight','dormer'],
  electricians: ['electrical','lighting','wiring','electrics','consumer unit','smart home'],
  plumbers: ['plumbing','heating','boiler','radiator','underfloor heating','bathroom','wet room','shower'],
  landscapers: ['landscaping','garden','patio','decking','fencing','driveway','paving','turf','planting','shed','greenhouse','pergola','trees','tree'],
  architects: ['architect','design','planning application','listed building','conservation area','heritage statement','design and access'],
  surveyors: ['survey','structural','damp','timber','party wall','boundary','measured survey'],
  'window companies': ['window','double glazing','glazing','bi-fold','sliding door','patio door','conservatory'],
  'solar installers': ['solar','photovoltaic','pv','renewable','energy','battery storage','heat pump','ev charger'],
  'commercial fit-out': ['shop front','retail','office fit','commercial','warehouse','industrial unit','change of use','a3','a1','a2','d1','d2']
};

// Make an API request to Plota
function apiRequest(path) {
  return new Promise((resolve, reject) => {
    if (!API_KEY) { resolve({ data: [], meta: { count: 0, error: 'No PLOTA_API_KEY set' } }); return; }
    https.get({ hostname: BASE, path: path, headers: { 'Authorization': 'Bearer ' + API_KEY, 'Accept': 'application/json' }, timeout: 30000 }, (res) => {
      var body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch(e) { resolve({ data: [], meta: { count: 0 } }); }
      });
    }).on('error', (e) => { resolve({ data: [], meta: { count: 0 } }); });
  });
}

// Categorise a planning application by trade based on proposal description
function categoriseTrade(description, category) {
  var text = (description || '').toLowerCase();
  var categories = [];
  for (var trade in TRADE_KEYWORDS) {
    var keywords = TRADE_KEYWORDS[trade];
    for (var ki = 0; ki < keywords.length; ki++) {
      if (text.includes(keywords[ki])) { categories.push(trade); break; }
    }
  }
  // If no trade detected, use Plota's category as a fallback
  if (categories.length === 0 && category) {
    var catText = (category || '').toLowerCase();
    if (catText.includes('extensions') || catText.includes('new homes')) categories.push('builders');
    else if (catText.includes('trees')) categories.push('landscapers');
    else if (catText.includes('solar') || catText.includes('renewables')) categories.push('solar installers');
    else if (catText.includes('commercial') || catText.includes('change of use')) categories.push('commercial fit-out');
    else categories.push('other');
  }
  if (categories.length === 0) categories.push('other');
  return categories;
}

// Calculate freshness badge
function freshnessBadge(receivedDate, validatedDate) {
  var today = new Date().toISOString().split('T')[0];
  var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
  if (receivedDate === today) return 'added today';
  if (validatedDate === today) return 'validated today';
  if (receivedDate === yesterday) return 'received yesterday';
  if (validatedDate === yesterday) return 'validated yesterday';
  return 'published within 48h';
}

// Collect fresh planning applications from Plota
async function collectFresh(freshnessHours) {
  if (!API_KEY) {
    console.log('[PLOTA] No API key configured — set PLOTA_API_KEY');
    return { leads: [], status: 'no_key', message: 'PLOTA_API_KEY not set' };
  }

  var now = new Date();
  var cutoff = new Date(now - freshnessHours * 3600000);
  var dateFrom = cutoff.toISOString().split('T')[0];

  // Fetch applications from Plota across multiple categories
  // We search all categories and filter server-side
  var allApps = [];
  // Reduced categories to avoid rate limiting (demo key: 20 req/h)
  // Combined categories for broader results with fewer requests.
  // Fetch up to 5 pages of 100 (500 apps) so a real PLOTA key captures the full
  // daily supply across the councils PLOTA covers.
  var maxPages = 5;
  for (var pg = 0; pg < maxPages; pg++) {
    var dataPage = await apiRequest('/v1/applications?date_from=' + dateFrom + '&limit=100&offset=' + (pg * 100));
    if (dataPage && dataPage.data && dataPage.data.length > 0) {
      allApps = allApps.concat(dataPage.data);
      if (pg < maxPages - 1) await new Promise(function(r) { setTimeout(r, 1000); });
    } else {
      break;
    }
  }

  // Dedup by reference + council
  var seen = new Set();
  var leads = [];

  for (var ai = 0; ai < allApps.length; ai++) {
    var a = allApps[ai];
    var dedupKey = (a.authority ? a.authority.slug : '') + ':' + (a.reference || '');
    if (seen.has(dedupKey)) continue;
    seen.add(dedupKey);

    var receivedDate = a.date_received || '';
    var validatedDate = a.date_validated || '';
    var pubDate = receivedDate || validatedDate;

    // Freshness check (server-side)
    if (pubDate && pubDate < dateFrom) continue;

    // Map category to trade
    var catLabel = a.category ? a.category.label : '';
    var trades = categoriseTrade(a.description, catLabel);

    leads.push({
      id: 'PLOTA_' + a.id,
      reference: a.reference || '',
      council: a.authority ? a.authority.name : '',
      address: a.address || '',
      postcode: a.postcode || '',
      proposal: (a.description || '').substring(0, 500),
      applicationType: a.planning_route || (a.category ? a.category.label : ''),
      category: a.category ? a.category.label : '',
      receivedDate: receivedDate,
      validatedDate: validatedDate,
      status: a.status || '',
      stage: a.stage || '',
      sourceUrl: a.links ? a.links.council || '' : '',
      plotaUrl: '',
      trades: trades,
      freshnessBadge: freshnessBadge(receivedDate, validatedDate),
      source: 'Planning Portal',
      location: a.location || null,
      scrapedAt: new Date().toISOString()
    });
  }

  console.log('[PLOTA] Total collected: ' + leads.length + ' applications');
  return { leads: leads, status: 'ok', message: leads.length + ' applications collected' };
}

// Health check
async function healthCheck() {
  if (!API_KEY) return { connected: false, message: 'No API key' };
  var result = await apiRequest('/v1/councils?limit=1');
  var ok = result && result.data && result.data.length > 0;
  return { connected: ok, message: ok ? 'Connected' : 'API returned unexpected response', councils: ok ? result.data.length : 0 };
}

// Register this provider
planningProvider.register('plota', { collectFresh, healthCheck });

module.exports = { collectFresh, healthCheck };
