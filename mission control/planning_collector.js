// Local Authority Planning Data Collector
// Collects planning applications from official council sources.
// Supports: Planning Data API, Planning London Datahub, council APIs, manual CSV/PDF feeds.
//
// Usage:
//   const planner = require('./planning_collector');
//   const apps = await planner.collectFreshPlanning(freshnessHours);
//   // Returns array of planning application lead objects.

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const COUNCIL_REGISTRY_FILE = path.join(DATA_DIR, 'council-registry.json');
const SEEN_APPS_FILE = path.join(DATA_DIR, 'seen-planning-apps.json');

// Build-in council registry with supported data sources
const DEFAULT_COUNCILS = [
  // Birmingham
  { name: 'Birmingham City Council', region: 'West Midlands', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:BIR', postcodes: ['B'] },
  { name: 'Bromsgrove District Council', region: 'West Midlands', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:BRM', postcodes: ['B'] },
  // London
  { name: 'Camden London Borough Council', region: 'London', country: 'England', source: 'london-datahub', planningDataOrg: 'local-authority-eng:CMD', postcodes: ['N','NW','WC'] },
  { name: 'Islington London Borough Council', region: 'London', country: 'England', source: 'london-datahub', planningDataOrg: 'local-authority-eng:ISL', postcodes: ['N'] },
  { name: 'Hackney London Borough Council', region: 'London', country: 'England', source: 'london-datahub', planningDataOrg: 'local-authority-eng:HCK', postcodes: ['N','E'] },
  { name: 'Haringey London Borough Council', region: 'London', country: 'England', source: 'london-datahub', planningDataOrg: 'local-authority-eng:HRY', postcodes: ['N'] },
  { name: 'Westminster City Council', region: 'London', country: 'England', source: 'london-datahub', planningDataOrg: 'local-authority-eng:WSM', postcodes: ['W','SW','WC'] },
  // Harrow
  { name: 'Harrow London Borough Council', region: 'London', country: 'England', source: 'london-datahub', planningDataOrg: 'local-authority-eng:HRW', postcodes: ['HA'] },
  // Enfield
  { name: 'Enfield London Borough Council', region: 'London', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:ENF', postcodes: ['EN'] },
  // Major cities
  { name: 'Manchester City Council', region: 'North West', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:MAN', postcodes: ['M'] },
  { name: 'Leeds City Council', region: 'Yorkshire', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:LDS', postcodes: ['LS'] },
  { name: 'Bristol City Council', region: 'South West', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:BST', postcodes: ['BS'] },
  { name: 'Liverpool City Council', region: 'North West', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:LIV', postcodes: ['L'] },
  { name: 'Sheffield City Council', region: 'Yorkshire', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:SHF', postcodes: ['S'] },
  { name: 'Nottingham City Council', region: 'East Midlands', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:NGM', postcodes: ['NG'] },
  { name: 'Leicester City Council', region: 'East Midlands', country: 'England', source: 'planning-data', planningDataOrg: 'local-authority-eng:LCE', postcodes: ['LE'] },
  { name: 'Glasgow City Council', region: 'Scotland', country: 'Scotland', source: 'planning-data', planningDataOrg: 'local-authority-eng:GLG', postcodes: ['G'] },
  { name: 'Cardiff Council', region: 'Wales', country: 'Wales', source: 'planning-data', planningDataOrg: 'local-authority-eng:CRF', postcodes: ['CF'] },
  { name: 'Belfast City Council', region: 'Northern Ireland', country: 'Northern Ireland', source: 'planning-data', postcodes: ['BT'] },
];

// Trade categorisation from proposal descriptions
const TRADE_KEYWORDS = {
  builders: ['new dwelling','extension','loft conversion','garage conversion','new build','house','flat','apartment','dormer'],
  roofers: ['roof','roofing','roof light','skylight','dormer'],
  electricians: ['electrical','lighting','wiring','electrics','consumer unit','smart home'],
  plumbers: ['plumbing','heating','boiler','radiator','underfloor heating','bathroom','wet room','shower'],
  landscapers: ['landscaping','garden','patio','decking','fencing','driveway','paving','turf','planting','shed','greenhouse','pergola'],
  architects: ['architect','design','planning application','listed building','conservation area','heritage statement','design and access'],
  surveyors: ['survey','structural','damp','timber','party wall','boundary','measured survey'],
  'window companies': ['window','double glazing','glazing','bi-fold','sliding door','patio door','conservatory'],
  'solar installers': ['solar','photovoltaic','pv','renewable','energy','battery storage','heat pump','ev charger'],
  'commercial fit-out': ['shop front','retail','office fit','commercial','warehouse','industrial unit','change of use','a3','a1','a2','d1','d2'],
};

// Load / save council registry
function loadCouncilRegistry() {
  try { return JSON.parse(fs.readFileSync(COUNCIL_REGISTRY_FILE, 'utf-8')); } catch(e) { return DEFAULT_COUNCILS; }
}

// Load / save dedup set
function loadSeenApps() {
  try { return new Set(JSON.parse(fs.readFileSync(SEEN_APPS_FILE, 'utf-8'))); } catch(e) { return new Set(); }
}
function saveSeenApps(set) {
  fs.writeFileSync(SEEN_APPS_FILE, JSON.stringify([...set]));
}

// Extract postcode area
function extractPostcodeArea(pc) {
  if (!pc) return '';
  return pc.toUpperCase().replace(/[^A-Z].*$/, '');
}

// Categorise a planning application by trade based on proposal description
function categoriseTrade(proposal, description) {
  var text = ((proposal || '') + ' ' + (description || '')).toLowerCase();
  var categories = [];
  for (var trade in TRADE_KEYWORDS) {
    var keywords = TRADE_KEYWORDS[trade];
    for (var ki = 0; ki < keywords.length; ki++) {
      if (text.includes(keywords[ki])) { categories.push(trade); break; }
    }
  }
  return categories.length > 0 ? categories : ['other'];
}

// Fetch from Planning Data API (digital-land)
function fetchPlanningData(org, pageSize, page) {
  return new Promise((resolve) => {
    var url = '/v1/planning-application?organisation=' + encodeURIComponent(org) + '&limit=' + pageSize + '&offset=' + ((page || 0) * pageSize) + '&sort=received_date.desc';
    https.get({ hostname: 'www.planning.data.gov.uk', path: url, timeout: 30000 }, (res) => {
      var body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// Fetch from London Datahub
function fetchLondonDatahub(council) {
  return new Promise((resolve) => {
    var url = '/api/v1/planning_applications?organisation=' + encodeURIComponent(council) + '&limit=50&sort=-received_date';
    https.get({ hostname: 'planning.data.london.gov.uk', path: url, timeout: 30000 }, (res) => {
      var body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch(e) { resolve(null); } });
    }).on('error', () => resolve(null));
  });
}

// Main: collect fresh planning applications from all supported councils
async function collectFreshPlanning(freshnessHours = 48, councilFilter) {
  var councils = loadCouncilRegistry();
  if (councilFilter) { councils = councils.filter(function(c) { return councilFilter.includes(c.name); }); }
  var seen = loadSeenApps();
  var freshCutoff = new Date(Date.now() - freshnessHours * 3600000).toISOString().split('T')[0];
  var allApps = [];

  console.log('[PLANNING] Collecting from ' + councils.length + ' councils (freshness: ' + freshnessHours + 'h)');

  for (var ci = 0; ci < councils.length; ci++) {
    var council = councils[ci];
    try {
      var apps = [];
      if (council.source === 'planning-data') {
        var data = await fetchPlanningData(council.planningDataOrg, 50, 0);
        if (data && data.planning_applications) { apps = data.planning_applications; }
      } else if (council.source === 'london-datahub') {
        var data2 = await fetchLondonDatahub(council.name);
        if (data2 && data2.results) { apps = data2.results; }
      }

      for (var ai = 0; ai < apps.length; ai++) {
        var a = apps[ai];
        var ref = a.reference || a.planning_application_id || '';
        var dedupKey = council.name + ':' + ref;
        if (!ref || seen.has(dedupKey)) continue;
        seen.add(dedupKey);

        var receivedDate = a.received_date || a.receivedDate || a.date_received || '';
        var validatedDate = a.validated_date || a.validatedDate || '';
        var publishedDate = a.published_date || a.publishedDate || receivedDate;

        // Freshness check
        var checkDate = publishedDate || validatedDate || receivedDate;
        if (checkDate && checkDate < freshCutoff) continue;

        var address = a.address || a.site_address || '';
        var postcode = a.postcode || a.post_code || (address.match(/[A-Z]{1,2}\d{1,2}\s*\d[A-Z]{2}/i) || [''])[0] || '';
        var proposal = a.description || a.proposal || a.proposal_description || '';
        var appType = a.application_type || a.applicationType || a.type || '';
        var applicant = a.applicant_name || a.applicant || '';
        var agent = a.agent_name || a.agent || '';
        var url = a.url || a.source_url || a.planning_portal_url || '';

        // Categorise
        var trades = categoriseTrade(proposal, '');

        // Assign freshness badge
        var freshnessBadge = 'published within 48h';
        var today = new Date().toISOString().split('T')[0];
        var yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
        if (publishedDate === today) freshnessBadge = 'added today';
        else if (validatedDate === today || validatedDate === yesterday) freshnessBadge = 'validated ' + (validatedDate === today ? 'today' : 'yesterday');
        else if (receivedDate === today || receivedDate === yesterday) freshnessBadge = 'received ' + (receivedDate === today ? 'today' : 'yesterday');

        allApps.push({
          id: 'PLAN_' + council.planningDataOrg + '_' + ref.replace(/[^A-Za-z0-9]/g, '_'),
          council: council.name,
          reference: ref,
          address: address,
          postcode: postcode,
          proposal: proposal,
          applicationType: appType,
          receivedDate: receivedDate,
          validatedDate: validatedDate,
          publishedDate: publishedDate,
          applicant: applicant,
          agent: agent,
          sourceUrl: url,
          source: council.source === 'planning-data' ? 'Planning Data API' : 'London Datahub',
          trades: trades,
          freshnessBadge: freshnessBadge,
          scrapedAt: new Date().toISOString()
        });
      }
    } catch(e) {
      console.log('[PLANNING] Error collecting ' + council.name + ': ' + e.message);
    }
  }

  saveSeenApps(seen);
  console.log('[PLANNING] Collected ' + allApps.length + ' fresh applications');
  return allApps;
}

module.exports = { collectFreshPlanning, loadCouncilRegistry, categoriseTrade };
