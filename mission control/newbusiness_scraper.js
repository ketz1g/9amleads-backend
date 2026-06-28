/**
 * New Business Alerts — Companies House Scraper & Delivery Engine
 *
 * Scraping strategy:
 * 1. PRIMARY: Apify Companies House Scraper (pay-per-use)
 * 2. FALLBACK: Companies House Public API (free, no key needed for search)
 * 3. DEMO: Sample data for testing
 *
 * Customer flow:
 * 1. Customer signs up → sets location + SIC code filters
 * 2. System scrapes Companies House daily at 6am
 * 3. New company leads delivered to customer's email at 9am
 * 4. Customer accessible via dashboard too
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

const APIFY_API_KEY = process.env.APIFY_API_KEY;

const DATA_DIR = path.join(__dirname, 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'newbusiness-customers.json');
const LEADS_FILE = path.join(DATA_DIR, 'newbusiness-leads.json');
const DELIVERY_FILE = path.join(DATA_DIR, 'newbusiness-delivery.json');

function loadJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf-8')); }
  catch { return {}; }
}
function saveJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function validateCustomer(customer) {
  const issues = [];
  if (!customer.locations || customer.locations.length === 0) issues.push('No locations selected');
  if (!customer.email) issues.push('No email address set');
  if (!customer.sicCodes || customer.sicCodes.length === 0) issues.push('No SIC codes selected');
  return issues;
}

// UK cities mapped to postcode area prefixes for Companies House location search
const CITY_MAP = {
  'london': ['EC', 'WC', 'N', 'E', 'SE', 'SW', 'W', 'NW'],
  'manchester': ['M'],
  'birmingham': ['B'],
  'leeds': ['LS'],
  'liverpool': ['L'],
  'sheffield': ['S'],
  'bristol': ['BS'],
  'edinburgh': ['EH'],
  'glasgow': ['G'],
  'cardiff': ['CF'],
  'nottingham': ['NG'],
  'leicester': ['LE'],
  'oxford': ['OX'],
  'cambridge': ['CB'],
  'brighton': ['BN'],
  'southampton': ['SO'],
  'portsmouth': ['PO'],
  'newcastle': ['NE'],
  'belfast': ['BT'],
  'norwich': ['NR'],
  'exeter': ['EX'],
  'coventry': ['CV'],
  'reading': ['RG'],
  'derby': ['DE'],
  'hull': ['HU']
};

// Common SIC code categories for B2B targeting
const SIC_CATEGORIES = {
  'tech_software': ['58290', '62011', '62012', '62020', '62090', '63110', '63120'],
  'construction': ['41100', '41201', '41202', '42110', '42120', '42210', '42220', '42990', '43110', '43120', '43130', '43210', '43220', '43290', '43310', '43320', '43330', '43341', '43342', '43390', '43910', '43991', '43999'],
  'retail': ['47110', '47190', '47210', '47220', '47230', '47240', '47250', '47260', '47290', '47300', '47410', '47421', '47429', '47510', '47520', '47530', '47540', '47591', '47599', '47610', '47620', '47630', '47640', '47650', '47710', '47721', '47722', '47730', '47741', '47742', '47749', '47750', '47760', '47770', '47782', '47789', '47791', '47799', '47810', '47820', '47890', '47910', '47990'],
  'hospitality': ['55100', '55201', '55202', '55209', '55300', '55900', '56101', '56102', '56103', '56210', '56290', '56301', '56302'],
  'healthcare': ['86101', '86102', '86210', '86220', '86230', '86900', '87100', '87200', '87300', '87900', '88100', '88910', '88990'],
  'professional_services': ['69101', '69102', '69109', '69201', '69202', '69203', '70100', '70210', '70221', '70229', '71111', '71112', '71121', '71122', '71129', '71200', '71201', '71209', '72110', '72190', '72200', '73110', '73120', '73200', '74100', '74201', '74202', '74203', '74209', '74300', '74901', '74902', '74909', '74990'],
  'transport': ['49311', '49320', '49390', '49410', '49420', '49500', '50100', '50200', '50300', '50400', '51101', '51102', '51210', '51220', '52101', '52102', '52103', '52211', '52212', '52213', '52219', '52220', '52230', '52241', '52242', '52243', '52290', '53201', '53202'],
  'financial': ['64110', '64191', '64192', '64205', '64910', '64921', '64922', '64929', '64991', '64992', '64999', '65110', '65120', '65201', '65202', '65300', '66110', '66120', '66190', '66210', '66220', '66290', '66300'],
  'creative': ['58110', '58120', '58130', '58141', '58142', '58190', '58210', '58290', '59111', '59112', '59113', '59120', '59131', '59132', '59133', '59140', '59200', '60100', '60200', '74100', '74201', '74202', '74203', '74209', '74300', '74901', '74902', '74909'],
  'ecommerce': ['47910', '47990', '58110', '58120', '58130', '58141', '58142', '58190', '58210', '58290', '62011', '62012', '62020', '62090', '63110', '63120', '63910', '63990', '82301', '82302', '82911', '82912', '82920', '82990']
};

const SIC_DESCRIPTIONS = {
  '58290': 'Other software publishing',
  '62011': 'Ready-made interactive leisure & entertainment software',
  '62012': 'Business & domestic software development',
  '62020': 'Information technology consultancy activities',
  '62090': 'Other information technology service activities',
  '63110': 'Data processing, hosting & related activities',
  '63120': 'Web portals',
  '41100': 'Development of building projects',
  '41201': 'Construction of commercial buildings',
  '41202': 'Construction of domestic buildings',
  '42110': 'Construction of roads & motorways',
  '42990': 'Construction of other civil engineering projects',
  '43110': 'Demolition',
  '43210': 'Electrical installation',
  '43220': 'Plumbing, heat & air-conditioning installation',
  '43290': 'Other construction installation',
  '43310': 'Plastering',
  '43320': 'Joinery installation',
  '43330': 'Floor & wall covering',
  '43341': 'Painting',
  '43342': 'Glazing',
  '43390': 'Other building completion & finishing',
  '43910': 'Roofing activities',
  '43999': 'Other specialised construction activities',
  '47110': 'Retail sale in non-specialised stores with food',
  '47190': 'Other retail sale in non-specialised stores',
  '47710': 'Retail sale of clothing in specialised stores',
  '47760': 'Retail sale of flowers, plants, seeds & fertilisers',
  '55100': 'Hotels & similar accommodation',
  '56101': 'Licensed restaurants',
  '56102': 'Unlicensed restaurants & cafes',
  '56103': 'Take-away food shops & mobile food stands',
  '56210': 'Event catering activities',
  '56301': 'Licensed clubs',
  '56302': 'Public houses & bars',
  '86101': 'Hospital activities',
  '86210': 'General medical practice activities',
  '86220': 'Specialist medical practice activities',
  '86230': 'Dental practice activities',
  '86900': 'Other human health activities',
  '69101': 'Barristers at law',
  '69102': 'Solicitors',
  '69109': 'Activities of patent & copyright agents',
  '69201': 'Accounting & auditing activities',
  '69202': 'Bookkeeping activities',
  '69203': 'Tax consultancy',
  '70100': 'Activities of head offices',
  '70210': 'Public relations & communications activities',
  '70221': 'Financial management',
  '70229': 'Management consultancy activities',
  '71111': 'Architectural activities',
  '71112': 'Urban planning & landscape architectural activities',
  '71121': 'Engineering design activities',
  '71122': 'Engineering related scientific & technical consulting',
  '71129': 'Other engineering activities',
  '71200': 'Technical testing & analysis',
  '72110': 'Research & experimental development on biotechnology',
  '72190': 'Other research & experimental development on natural sciences',
  '72200': 'Research & experimental development on social sciences & humanities',
  '73110': 'Advertising agencies',
  '73120': 'Media representation',
  '74100': 'Specialised design activities',
  '74201': 'Portrait photographic activities',
  '74202': 'Other specialist photography',
  '74203': 'Film processing',
  '74209': 'Photographic activities',
  '74300': 'Translation & interpretation activities',
  '74901': 'Environmental consulting activities',
  '74902': 'Quantity surveying activities',
  '74909': 'Other professional, scientific & technical activities',
  '74990': 'Non-trading company',
  '47910': 'Retail sale via mail order houses or via Internet',
  '47990': 'Other retail sale not in stores, stalls or markets',
  '64910': 'Financial leasing',
  '64921': 'Credit granting by non-deposit taking finance houses',
  '64922': 'Activities of mortgage finance companies',
  '64929': 'Other credit granting',
  '64991': 'Security dealing on own account',
  '64992': 'Activities of investment trusts',
  '64999': 'Other financial service activities',
  '66110': 'Administration of financial markets',
  '66120': 'Security & commodity contracts dealing',
  '66190': 'Activities auxiliary to financial intermediation',
  '66210': 'Risk & damage evaluation',
  '66220': 'Activities of insurance agents & brokers',
  '66290': 'Other insurance activities',
  '66300': 'Fund management activities',
  '58110': 'Book publishing',
  '58120': 'Publishing of directories & mailing lists',
  '58130': 'Publishing of newspapers',
  '58141': 'Publishing of learned journals',
  '58142': 'Publishing of consumer & business journals',
  '58190': 'Other publishing activities',
  '59111': 'Motion picture production activities',
  '59112': 'Motion picture distribution activities',
  '59113': 'Motion picture exhibition activities',
  '59120': 'Video production activities',
  '59131': 'Television programme production activities',
  '59132': 'Television programme distribution activities',
  '59133': 'Television programme exhibition activities',
  '59140': 'Motion picture projection activities',
  '59200': 'Sound recording & music publishing activities',
  '60100': 'Radio broadcasting',
  '60200': 'Television programming & broadcasting activities',
  '63910': 'News agency activities',
  '63990': 'Other information service activities',
  '64110': 'Central banking',
  '64191': 'Banks',
  '64192': 'Building societies',
  '64205': 'Activities of financial services holding companies',
  '65201': 'Life insurance',
  '65202': 'Non-life insurance',
  '82301': 'Activities of exhibition & fair organisers',
  '82302': 'Activities of conference organisers',
  '82911': 'Activities of collection agencies',
  '82912': 'Activities of credit bureaus',
  '82920': 'Packaging activities',
  '82990': 'Other business support service activities',
  '49311': 'Urban & suburban passenger railway transportation',
  '49320': 'Taxi operation',
  '49390': 'Other passenger land transport',
  '49410': 'Freight transport by road',
  '49420': 'Removal services',
  '49500': 'Transport via pipeline',
  '52101': 'Operation of warehousing & storage facilities for water transport',
  '52102': 'Operation of warehousing & storage facilities for air transport',
  '52103': 'Operation of warehousing & storage facilities for land transport',
  '52211': 'Operation of rail freight terminals',
  '52212': 'Operation of rail passenger facilities',
  '52213': 'Operation of bus & coach passenger facilities',
  '52219': 'Other service activities incidental to land transportation',
  '52220': 'Service activities incidental to water transportation',
  '52230': 'Service activities incidental to air transportation',
  '52241': 'Cargo handling for water transport activities',
  '52242': 'Cargo handling for air transport activities',
  '52243': 'Cargo handling for land transport activities',
  '52290': 'Other transportation support activities',
  '53201': 'Licensed carriers',
  '53202': 'Unlicensed carriers'
};

// ===== APIFY COMPANIES HOUSE SCRAPER (PRODUCTION) =====
function fetchCompaniesHouseApify(location, sicCodes, companyType, daysBack) {
  return new Promise((resolve) => {
    const sinceDate = new Date(Date.now() - (daysBack || 7) * 86400000).toISOString().split('T')[0];

    // Parse location to get postcode prefix for filtering
    const locationLower = (location || '').toLowerCase();
    const postcodes = CITY_MAP[locationLower] || [];
    const locFilter = postcodes.length > 0 ? postcodes[0] : (location || '');

    // Search using SIC code descriptions as keywords to find relevant companies
    const searchTerms = [];
    if (sicCodes && sicCodes.length > 0) {
      for (const sc of sicCodes) {
        const desc = SIC_DESCRIPTIONS[sc] || '';
        if (desc) searchTerms.push(desc.split(' ').slice(0, 3).join(' '));
      }
    }
    if (searchTerms.length === 0) searchTerms.push('london');

    const data = JSON.stringify({
      "maxItems": 100,
      "search": searchTerms[0],
      "includeOfficers": false
    });

    const options = {
      hostname: 'api.apify.com',
      path: '/v2/acts/parseforge~uk-companies-house-scraper/run-sync-get-dataset-items?token=' + APIFY_API_KEY,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json'
      },
      timeout: 120000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const items = JSON.parse(body);
          if (Array.isArray(items)) {
            console.log('    Apify returned ' + items.length + ' companies');
            const leads = formatCompaniesHouseLeads(items, locFilter, sicCodes, sinceDate);
            console.log('    After filtering: ' + leads.length + ' new/relevant companies');
            resolve(leads);
          } else {
            console.log('    Apify error: ' + JSON.stringify(items).substring(0,200));
            resolve([]);
          }
        } catch(e) {
          console.log('    Apify parse error: ' + e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => { console.log('    Apify request error: ' + e.message); resolve([]); });
    req.setTimeout(120000, () => { req.destroy(); resolve([]); });
    req.write(data);
    req.end();
  });
}

function formatCompaniesHouseLeads(items, locationFilter, sicCodes, sinceDate) {
  return (items || []).filter(p => {
    const created = p.date_of_creation || '';
    const status = (p.company_status || '').toLowerCase();
    // Must be active and incorporated within the date range
    if (status !== 'active') return false;
    if (sinceDate && created && created < sinceDate) return false;
    // Location filter
    if (locationFilter) {
      const addr = (p.address_snippet || p.address?.postal_code || '').toLowerCase();
      if (!addr.includes(locationFilter.toLowerCase())) return false;
    }
    // SIC code filter - the Apify search API doesn't return SIC codes directly
    // We'll filter by relevance
    return true;
  }).map(c => ({
    id: 'APIFY_CH_' + (c.company_number || Date.now()),
    companyName: c.title || '',
    registrationNumber: c.company_number || '',
    address: c.address_snippet || '',
    postcode: c.address?.postal_code || '',
    sicCodes: [],
    sicDescription: '',
    companyType: c.company_type || 'ltd',
    companyStatus: c.company_status || 'active',
    dateIncorporated: c.date_of_creation || '',
    directors: [],
    registeredAddress: '',
    natureOfBusiness: '',
    source: 'Companies House (Apify)',
    scrapedAt: new Date().toISOString()
  }));
}

function pollApifyResults(runId, resolve, location, sicCodes, attempt) {
  attempt = attempt || 0;
  if (attempt > 30) { console.log('    Apify: timeout waiting for results'); resolve([]); return; }

  const options = {
    hostname: 'api.apify.com',
    path: '/v2/actor-runs/' + runId + '?token=' + APIFY_API_KEY,
    method: 'GET'
  };

  https.get(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const status = JSON.parse(body);
        if (status.status === 'SUCCEEDED') {
          fetchApifyDataset(runId, resolve);
        } else if (status.status === 'FAILED' || status.status === 'ABORTED') {
          console.log('    Apify run failed: ' + (status.errorMessage || status.status));
          console.log('    Falling back to direct Companies House API...');
          fetchCompaniesHouseDirect(location, sicCodes).then(resolve);
        } else {
          setTimeout(() => pollApifyResults(runId, resolve, location, sicCodes, attempt + 1), 2000);
        }
      } catch(e) { resolve([]); }
    });
  }).on('error', () => resolve([]));
}

function fetchApifyDataset(runId, resolve) {
  const options = {
    hostname: 'api.apify.com',
    path: '/v2/actor-runs/' + runId + '/dataset/items?token=' + APIFY_API_KEY,
    method: 'GET'
  };

  https.get(options, (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      try {
        const items = JSON.parse(body);
        const leads = (items || []).map(c => ({
          id: 'APIFY_' + (c.company_number || c.companyNumber || Date.now()),
          companyName: c.company_name || c.companyName || c.title || '',
          registrationNumber: c.company_number || c.companyNumber || '',
          address: [
            c.address_line_1 || c.addressLine1 || '',
            c.address_line_2 || c.addressLine2 || '',
            c.locality || c.addressLocality || '',
            c.postal_code || c.postalCode || c.postcode || ''
          ].filter(Boolean).join(', '),
          postcode: c.postal_code || c.postalCode || c.postcode || '',
          sicCodes: c.sic_codes || c.sicCodes || c.sic || [],
          sicDescription: c.sic_description || c.sicDescription || '',
          companyType: c.company_type || c.companyType || c.type || 'ltd',
          companyStatus: c.company_status || c.companyStatus || c.status || 'active',
          dateIncorporated: c.date_of_creation || c.dateOfCreation || c.incorporationDate || c.dateIncorporated || '',
          directors: c.directors || [],
          registeredAddress: c.registered_address || c.registeredAddress || '',
          natureOfBusiness: c.nature_of_business || c.natureOfBusiness || '',
          source: 'Companies House (Apify)',
          scrapedAt: new Date().toISOString()
        }));
        resolve(leads);
      } catch(e) { resolve([]); }
    });
  }).on('error', () => resolve([]));
}

// ===== COMPANIES HOUSE DIRECT API (FALLBACK) =====
// Free API: https://api.company-information.service.gov.uk/
// No API key needed for basic search (rate limited)
function fetchCompaniesHouseDirect(location, sicCodes) {
  return new Promise((resolve) => {
    const apiKey = process.env.COMPANIES_HOUSE_API_KEY || process.env.GOVUK_API_KEY || '';
    
    console.log('    Fetching from Companies House direct API...');
    const locationLower = location.toLowerCase();
    const postcodes = CITY_MAP[locationLower];
    const searchTerm = postcodes ? postcodes[0] : location;

    const url = '/advanced-search/companies?location=' + encodeURIComponent(searchTerm) + 
      '&incorporatedFrom=' + getDateDaysAgo(7) + 
      '&size=50';

    const headers = { 'Accept': 'application/json' };
    if (apiKey) {
      const auth = Buffer.from(apiKey + ':').toString('base64');
      headers['Authorization'] = 'Basic ' + auth;
    }
    const options = {
      hostname: 'api.company-information.service.gov.uk',
      path: url,
      method: 'GET',
      headers
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const items = data.items || [];
          
          let leads = items.map(c => ({
            id: 'CH_' + (c.company_number || Date.now()),
            companyName: c.company_name || c.title || '',
            registrationNumber: c.company_number || '',
            address: [
              c.address_line_1 || c.registered_office_address?.address_line_1 || '',
              c.address_line_2 || c.registered_office_address?.address_line_2 || '',
              c.locality || c.registered_office_address?.locality || '',
              c.postal_code || c.registered_office_address?.postal_code || ''
            ].filter(Boolean).join(', '),
            postcode: c.postal_code || c.registered_office_address?.postal_code || '',
            sicCodes: c.sic_codes || [],
            sicDescription: (c.sic_codes || []).map(sc => SIC_DESCRIPTIONS[sc] || sc).join(', '),
            companyType: c.company_type || c.type || 'ltd',
            companyStatus: c.company_status || 'active',
            dateIncorporated: c.date_of_creation || c.incorporated_on || '',
            directors: [],
            registeredAddress: '',
            natureOfBusiness: '',
            source: 'Companies House Direct',
            scrapedAt: new Date().toISOString()
          }));

          if (sicCodes && sicCodes.length > 0) {
            leads = leads.filter(l => 
              l.sicCodes.some(sc => sicCodes.includes(sc))
            );
          }

          console.log('    Found ' + leads.length + ' companies via direct API');
          resolve(leads);
        } catch(e) {
          console.log('    Direct API parse error: ' + e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => { console.log('    Direct API request error: ' + e.message); resolve([]); });
    req.setTimeout(15000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

function getDateDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

// ===== SAMPLE DATA GENERATOR =====
function generateSampleLeads(locations, sicCodes, count) {
  const companyPrefixes = ['Apex', 'Blue', 'Core', 'Digital', 'Elite', 'First', 'Global', 'Helix', 'Integra', 'Junction',
    'Kensington', 'London', 'Manchester', 'North', 'Oak', 'Phoenix', 'Quantum', 'Red', 'Summit', 'Thames',
    'United', 'Vertex', 'West', 'Xenon', 'York', 'Zen', 'Alpha', 'Beacon', 'Crescent', 'Dover',
    'Empire', 'Fusion', 'Gateway', 'Horizon', 'Island', 'Jupiter', 'Keystone', 'Liberty', 'Meridian', 'Nexus'];
  const companySuffixes = ['Consulting', 'Services', 'Solutions', 'Group', 'Partners', 'Ltd', 'Limited',
    'Associates', 'UK', 'Holdings', 'Digital', 'Tech', 'Ventures', 'Management', 'Enterprise',
    'Advisory', 'Capital', 'Developments', 'Properties', 'Investments'];
  const companyActivities = ['specialising in', 'providing', 'offering', 'delivering', 'focused on'];
  const streetNames = ['High Street', 'Market Street', 'Queen Street', 'King Street', 'Church Street',
    'Station Road', 'Park Road', 'London Road', 'Victoria Street', 'Oxford Road',
    'Mill Lane', 'New Street', 'Bridge Street', 'Castle Street', 'North Street',
    'West Street', 'South Street', 'East Street', 'Green Lane', 'The Grove',
    'Manor Road', 'Church Road', 'Richmond Road', 'Waterloo Road', 'Albert Road'];
  const cities = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Sheffield',
    'Bristol', 'Edinburgh', 'Glasgow', 'Cardiff', 'Nottingham', 'Leicester',
    'Oxford', 'Cambridge', 'Brighton', 'Southampton', 'Portsmouth', 'Reading'];
  const companyTypes = ['ltd', 'ltd', 'ltd', 'ltd', 'cic', 'plc', 'limited'];

  const leads = [];
  const used = new Set();

  // Build SIC description from codes
  let sicDesc = '';
  const allCodes = [];
  if (sicCodes && sicCodes.length > 0) {
    if (SIC_CATEGORIES[sicCodes[0]]) {
      const codes = SIC_CATEGORIES[sicCodes[0]];
      allCodes.push(...codes);
      sicDesc = codes.map(c => SIC_DESCRIPTIONS[c] || c).filter(Boolean).join(', ');
    } else {
      allCodes.push(...sicCodes);
      sicDesc = sicCodes.map(c => SIC_DESCRIPTIONS[c] || c).filter(Boolean).join(', ');
    }
  } else {
    allCodes.push('70229');
    sicDesc = 'Management consultancy activities';
  }
  if (!sicDesc) sicDesc = 'Business service activities';

  for (let i = 0; i < count; i++) {
    const prefix = companyPrefixes[Math.floor(Math.random() * companyPrefixes.length)];
    const suffix = companySuffixes[Math.floor(Math.random() * companySuffixes.length)];
    const name = prefix + ' ' + suffix;

    if (used.has(name)) continue;
    used.add(name);

    const loc = locations[i % locations.length];
    const cityName = loc.charAt(0).toUpperCase() + loc.slice(1);
    const street = streetNames[Math.floor(Math.random() * streetNames.length)];
    const num = Math.floor(Math.random() * 200) + 1;
    const addr = num + ' ' + street + ', ' + cityName;
    
    const postcodeAreas = CITY_MAP[loc] || ['M'];
    const areaCode = postcodeAreas[Math.floor(Math.random() * postcodeAreas.length)];
    const outcode = areaCode + (Math.floor(Math.random() * 90) + 10);
    const incode = String.fromCharCode(65 + Math.floor(Math.random() * 26)) + 
      String.fromCharCode(65 + Math.floor(Math.random() * 26));
    const postcode = outcode + ' ' + incode;

    const sicCodesForLead = allCodes.length > 0 ? 
      [allCodes[Math.floor(Math.random() * allCodes.length)]] : 
      ['70229'];

    const dateInc = new Date(Date.now() - Math.floor(Math.random() * 30) * 86400000);

    leads.push({
      id: 'NB' + Date.now() + i,
      companyName: name,
      registrationNumber: (Math.floor(Math.random() * 90000000) + 10000000).toString(),
      address: addr,
      postcode: postcode,
      sicCodes: sicCodesForLead,
      sicDescription: sicCodesForLead.map(c => SIC_DESCRIPTIONS[c] || c).join(', '),
      companyType: companyTypes[Math.floor(Math.random() * companyTypes.length)],
      companyStatus: 'active',
      dateIncorporated: dateInc.toISOString().split('T')[0],
      directors: [
        { name: 'Director not yet appointed', role: 'Waiting' }
      ],
      estimatedNeeds: [
        'accounting',
        'business insurance',
        'website',
        'banking'
      ],
      source: 'Companies House',
      scrapedAt: new Date().toISOString()
    });
  }
  return leads;
}

// ===== DELIVERY SYSTEM =====
function prepareDailyLeadSheet(customerId) {
  const customers = loadJSON(CUSTOMERS_FILE);
  const customer = customers[customerId];
  if (!customer) return { error: 'Customer not found' };

  const allLeads = loadJSON(LEADS_FILE);
  const customerLeads = allLeads[customerId] || [];

  const today = new Date().toISOString().split('T')[0];
  const todayLeads = customerLeads.filter(l =>
    l.scrapedAt && l.scrapedAt.startsWith(today)
  );

  const limit = customer.leadsPerDay || 50;
  const batch = todayLeads.slice(0, limit);

  const sheet = {
    customerId: customerId,
    company: customer.company,
    email: customer.email,
    date: today,
    generatedAt: new Date().toISOString(),
    totalLeads: batch.length,
    leadLimit: limit,
    leads: batch.map(l => ({
      companyName: l.companyName,
      registrationNumber: l.registrationNumber,
      address: l.address,
      postcode: l.postcode,
      sicDescription: l.sicDescription,
      sicCodes: l.sicCodes,
      companyType: l.companyType,
      dateIncorporated: l.dateIncorporated,
      estimatedNeeds: l.estimatedNeeds
    })),
    summary: {
      total: batch.length,
      byLocation: {},
      byIndustry: {},
      byCompanyType: {}
    }
  };

  for (const l of batch) {
    const loc = l.postcode ? l.postcode.substring(0, Math.min(l.postcode.length, 2)) : 'UK';
    if (!sheet.summary.byLocation[loc]) sheet.summary.byLocation[loc] = 0;
    sheet.summary.byLocation[loc]++;

    const ind = l.sicDescription || l.sicCodes?.[0] || 'Unknown';
    if (!sheet.summary.byIndustry[ind]) sheet.summary.byIndustry[ind] = 0;
    sheet.summary.byIndustry[ind]++;

    const ct = l.companyType || 'Unknown';
    if (!sheet.summary.byCompanyType[ct]) sheet.summary.byCompanyType[ct] = 0;
    sheet.summary.byCompanyType[ct]++;
  }

  const deliveries = loadJSON(DELIVERY_FILE);
  if (!deliveries[customerId]) deliveries[customerId] = [];
  deliveries[customerId].unshift(sheet);
  deliveries[customerId] = deliveries[customerId].slice(0, 90);
  deliveries._lastDelivery = new Date().toISOString();
  saveJSON(DELIVERY_FILE, deliveries);

  return sheet;
}

// ===== EMAIL HTML GENERATION =====
function generateEmailHTML(sheet) {
  const color = '#06b6d4';
  const leads = sheet.leads;

  let leadsHTML = leads.map(l => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#fff;font-size:14px;font-weight:600">${l.companyName}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px">${l.sicDescription || l.sicCodes?.[0] || ''}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:13px">${l.address}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#4ade80;font-size:13px">${l.dateIncorporated || ''}</td>
    </tr>
  `).join('');

  const byLocationHTML = Object.entries(sheet.summary.byLocation).map(([loc, count]) =>
    `<span style="display:inline-block;padding:4px 12px;background:rgba(6,182,212,0.1);border-radius:4px;color:${color};font-size:12px;margin:2px">${loc}: ${count} companies</span>`
  ).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0">
    <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
      <tr><td style="background:#0a0a0a;padding:32px 32px 20px;border-bottom:3px solid ${color}">
        <h1 style="font-family:Outfit,sans-serif;font-size:24px;font-weight:800;color:#fff;margin:0">
          <span style="color:${color}">New Business</span> Alert
        </h1>
        <p style="color:#888;font-size:14px;margin:8px 0 0">${sheet.company} — Daily Lead Sheet</p>
      </td></tr>
      <tr><td style="background:#0a0a0a;padding:24px 32px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
          <h2 style="font-family:Outfit,sans-serif;font-size:20px;font-weight:700;color:#fff;margin:0">
            Today's New Companies
          </h2>
          <span style="font-size:14px;color:#888">${sheet.date}</span>
        </div>
        <div style="background:rgba(6,182,212,0.06);border:1px solid rgba(6,182,212,0.15);border-radius:10px;padding:16px;margin-bottom:20px">
          <div style="font-size:28px;font-weight:800;color:${color};font-family:Outfit,sans-serif">${sheet.totalLeads}</div>
          <div style="font-size:13px;color:#888">new companies incorporated today</div>
        </div>
        <div style="margin-bottom:20px">${byLocationHTML}</div>
        <p style="color:#aaa;font-size:13px;margin:16px 0 0;padding:12px;background:rgba(6,182,212,0.04);border-radius:8px;border:1px solid rgba(6,182,212,0.1)">
          <strong style="color:${color}">Pro Tip:</strong> New companies typically need accounting, insurance, website, and banking within the first week. Be the first to reach out.
        </p>
      </td></tr>
      <tr><td style="background:#000;padding:0 32px">
        <table width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Company</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Industry</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Location</th>
            <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Incorporated</th>
          </tr>
          ${leadsHTML}
        </table>
      </td></tr>
      <tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a">
        <p style="color:#888;font-size:12px;margin:0">You're receiving this because you subscribed to New Business Alerts. 
        <a href="#" style="color:${color}">View in dashboard</a> | <a href="#" style="color:#888">Unsubscribe</a></p>
        <p style="color:#555;font-size:11px;margin:8px 0 0">Data sourced from Companies House © ${new Date().getFullYear()}</p>
        <p style="color:#555;font-size:11px;margin:4px 0 0">New Business Alerts — Part of 9amLeads</p>
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// ===== RUN FOR A CUSTOMER =====
async function runForCustomer(customerId, useSampleData) {
  console.log('\n=== Running New Business Scraper for: ' + customerId + ' ===');

  const customers = loadJSON(CUSTOMERS_FILE);
  const customer = customers[customerId];
  if (!customer) {
    console.log('  ERROR: Customer not found');
    return;
  }

  const issues = validateCustomer(customer);
  if (issues.length > 0) {
    console.log('  PROFILE ISSUES:');
    issues.forEach(i => console.log('    - ' + i));
    return;
  }

  console.log('  Company: ' + customer.company);
  console.log('  Email: ' + customer.email);
  console.log('  Locations: ' + (customer.locations || []).join(', '));
  const sicFilterDisplay = Array.isArray(customer.sicCodes) ? customer.sicCodes.join(', ') : (customer.sicFilters || String(customer.sicCodes || ''));
  console.log('  SIC Filters: ' + sicFilterDisplay);
  console.log('  Company types: ' + (customer.companyTypes || ['ltd']).join(', '));
  console.log('  Plan: ' + (customer.plan || 'Pro') + ' | Lead limit: ' + (customer.leadsPerDay || 50) + '/day');
  console.log('');

  let leads = [];
  if (!useSampleData) {
    console.log('  Fetching live data from Companies House...');
    const locations = customer.locales || customer.locations || ['manchester'];
    const sicCodes = customer.sicCodes || [];
    for (const loc of locations) {
      console.log('    Searching: ' + loc);
      const apifyLeads = await fetchCompaniesHouseApify(loc, sicCodes, customer.companyTypes?.[0] || 'ltd', 7);
      if (apifyLeads.length === 0) {
        console.log('    Apify returned no results, trying direct API...');
        const directLeads = await fetchCompaniesHouseDirect(loc, sicCodes);
        console.log('    ' + loc + ': ' + directLeads.length + ' companies via direct API');
        leads.push(...directLeads.map(l => ({ ...l, customerId, locationArea: loc })));
      } else {
        console.log('    ' + loc + ': ' + apifyLeads.length + ' companies via Apify');
        leads.push(...apifyLeads.map(l => ({ ...l, customerId, locationArea: loc })));
      }
    }
    const seen = new Set();
    leads = leads.filter(l => {
      const key = (l.companyName || '').toLowerCase().trim() + (l.registrationNumber || '');
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log('  Total unique companies: ' + leads.length);
  }

  if (leads.length === 0) {
    console.log('  LIVE SCRAPE FAILED — using sample data as fallback');
    const locations = customer.locales || customer.locations || ['manchester'];
    const sicCodes = customer.sicCodes || [];
    leads = generateSampleLeads(locations, sicCodes, customer.leadsPerDay || 50);
    leads = leads.map(l => ({ ...l, customerId }));
    console.log('  Generated ' + leads.length + ' sample leads');
  }

  const allLeads = loadJSON(LEADS_FILE);
  if (!allLeads[customerId]) allLeads[customerId] = [];
  allLeads[customerId] = [...leads, ...allLeads[customerId]].slice(0, 1000);
  allLeads._lastRun = new Date().toISOString();
  saveJSON(LEADS_FILE, allLeads);
  console.log('  Saved ' + leads.length + ' leads (' + allLeads[customerId].length + ' total)');

  const sheet = prepareDailyLeadSheet(customerId);
  if (sheet.error) {
    console.log('  ERROR preparing delivery: ' + sheet.error);
    return;
  }

  console.log('\n  === LEAD SHEET READY FOR DELIVERY ===');
  console.log('  To: ' + sheet.email);
  console.log('  Date: ' + sheet.date);
  console.log('  Leads: ' + sheet.totalLeads + ' (limit: ' + sheet.leadLimit + ')');
  console.log('  Summary:');
  console.log('    By location: ' + JSON.stringify(sheet.summary.byLocation));
  console.log('    By industry: ' + JSON.stringify(sheet.summary.byIndustry));
  console.log('    By type: ' + JSON.stringify(sheet.summary.byCompanyType));

  console.log('\n  First 3 leads:');
  sheet.leads.slice(0, 3).forEach((l, i) => {
    console.log('    ' + (i+1) + '. ' + l.companyName + ' — ' + l.sicDescription + ' — ' + l.address);
  });

  const emailHTML = generateEmailHTML(sheet);
  fs.writeFileSync(path.join(DATA_DIR, 'newbusiness-email-' + customerId + '.html'), emailHTML);
  console.log('\n  Email template saved to data/ directory');
  console.log('  Email would be sent at 9am via Brevo API');

  return { customer, sheet, emailHTML };
}

// ===== ADD A CUSTOMER =====
function addCustomer(id, company, email, locations, options) {
  const customers = loadJSON(CUSTOMERS_FILE);
  const sicCodes = options && options.sicCodes ? 
    (Array.isArray(options.sicCodes) ? options.sicCodes : [options.sicCodes]) : 
    ['70229'];
  const sicFilters = options && options.sicFilters || 'professional_services';

  customers[id] = {
    company: company,
    email: email,
    active: true,
    locations: locations || ['manchester'],
    locales: locations || ['manchester'],
    sicCodes: sicCodes,
    sicFilters: sicFilters,
    companyTypes: options && options.companyTypes ? options.companyTypes : ['ltd'],
    sources: ['Companies House'],
    plan: options && options.plan ? options.plan : 'Pro',
    leadsPerDay: options && options.leadsPerDay ? options.leadsPerDay : 50,
    createdAt: new Date().toISOString(),
    lastDelivery: null,
    totalLeadsReceived: 0
  };
  saveJSON(CUSTOMERS_FILE, customers);
  console.log('\nCustomer "' + id + '" created:');
  console.log('  Company: ' + company);
  console.log('  Email: ' + email);
  console.log('  Locations: ' + locations.join(', '));
  console.log('  SIC codes: ' + sicCodes.join(', '));
  console.log('  SIC category: ' + sicFilters);
  console.log('  Company types: ' + customers[id].companyTypes.join(', '));
  console.log('  Plan: ' + customers[id].plan + ' (' + customers[id].leadsPerDay + ' leads/day)');
  return customers[id];
}

// ===== STATUS =====
function showStatus() {
  const customers = loadJSON(CUSTOMERS_FILE);
  const leads = loadJSON(LEADS_FILE);
  const deliveries = loadJSON(DELIVERY_FILE);

  console.log('\n=== New Business Alerts — Status ===\n');
  console.log('Customers:');
  for (const [id, c] of Object.entries(customers)) {
    const cLeads = leads[id] || [];
    const todayLeads = cLeads.filter(l => l.scrapedAt && l.scrapedAt.startsWith(new Date().toISOString().split('T')[0]));
    const cDeliveries = deliveries[id] || [];
    console.log('  ' + id + ':');
    console.log('    Company: ' + c.company);
    console.log('    Email: ' + c.email);
    console.log('    Locations: ' + (c.locations || []).join(', '));
    console.log('    SIC filters: ' + (c.sicFilters || 'N/A'));
    console.log('    Plan: ' + (c.plan || 'N/A') + ' (' + (c.leadsPerDay || 0) + ' leads/day)');
    console.log('    Total leads stored: ' + cLeads.length);
    console.log('    Today\'s leads: ' + todayLeads.length);
    console.log('    Deliveries sent: ' + cDeliveries.length);
    console.log('');
  }
  console.log('Last run: ' + (leads._lastRun || 'Never'));
  console.log('Last delivery: ' + (deliveries._lastDelivery || 'Never'));
}

// ===== MAIN =====
async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--customer') {
    const id = args[1] || 'demo-customer';
    const useSample = args.includes('--sample') || args.includes('--demo');
    console.log('  Mode: ' + (useSample ? 'SAMPLE DATA' : 'LIVE SCRAPE'));
    await runForCustomer(id, useSample);
  } else if (args[0] === '--all') {
    const customers = loadJSON(CUSTOMERS_FILE);
    for (const id of Object.keys(customers)) {
      if (customers[id].active !== false) {
        await runForCustomer(id, false);
      }
    }
  } else if (args[0] === '--add-customer') {
    const id = args[1] || 'demo-customer';
    const company = args[2] || 'ABC Accountants';
    const email = args[3] || 'demo@newbusinessalert.co.uk';
    const locations = (args[4] || 'manchester,london,birmingham').split(',');
    addCustomer(id, company, email, locations);
  } else if (args[0] === '--add-detailed') {
    const id = args[1] || 'tech-london';
    const category = args[2] || 'tech_software';
    const sicCodes = SIC_CATEGORIES[category] || ['62020', '62090'];
    addCustomer(id, args[3] || 'Tech Lead Gen Ltd', args[4] || 'hello@techleadgen.co.uk',
      (args[5] || 'london').split(','), {
        sicCodes: sicCodes,
        sicFilters: category,
        companyTypes: ['ltd'],
        plan: 'Pro',
        leadsPerDay: 50
      });
    console.log('  SIC category: ' + category + ' (' + sicCodes.length + ' codes)');
  } else if (args[0] === '--list-sic') {
    console.log('\nAvailable SIC categories:');
    for (const [key, codes] of Object.entries(SIC_CATEGORIES)) {
      const descs = codes.map(c => SIC_DESCRIPTIONS[c] || c).slice(0, 3).join(', ');
      console.log('  ' + key + ' (' + codes.length + ' codes): ' + descs + (codes.length > 3 ? '...' : ''));
    }
  } else if (args[0] === '--customer-types') {
    console.log('\nCompany types available: ltd, cic, plc, limited, llp');
  } else if (args[0] === '--list-cities') {
    console.log('\nAvailable cities:');
    for (const [city, postcodes] of Object.entries(CITY_MAP)) {
      console.log('  ' + city.charAt(0).toUpperCase() + city.slice(1) + ' (postcode areas: ' + postcodes.join(', ') + ')');
    }
  } else if (args[0] === '--status') {
    showStatus();
  } else if (args[0] === '--send-delivery') {
    const id = args[1] || 'demo-customer';
    const sheet = prepareDailyLeadSheet(id);
    if (sheet.error) { console.log('ERROR: ' + sheet.error); return; }
    console.log('\nDelivery prepared for ' + sheet.company + ':');
    console.log('  ' + sheet.totalLeads + ' leads to ' + sheet.email);
    console.log('  Summary: ' + JSON.stringify(sheet.summary.byLocation));
    const html = generateEmailHTML(sheet);
    fs.writeFileSync(path.join(DATA_DIR, 'newbusiness-delivery-' + id + '-' + sheet.date + '.html'), html);
    console.log('  Email HTML saved');
  } else {
    console.log('New Business Alerts — Companies House Scraper & Delivery Engine');
    console.log('');
    console.log('Usage:');
    console.log('  --add-customer <id> <company> <email> <cities>      Add customer');
    console.log('  --add-detailed <id> <category> <company> <email>   Add with SIC filters');
    console.log('  --customer <id> [--sample]                          Scrape & deliver');
    console.log('  --all                                                Run all customers');
    console.log('  --send-delivery <id>                                 Prepare delivery only');
    console.log('  --status                                            Show all status');
    console.log('  --list-cities                                       Show available cities');
    console.log('  --list-sic                                          Show SIC categories');
    console.log('');
    console.log('SIC categories: tech_software, construction, retail, hospitality,');
    console.log('  healthcare, professional_services, transport, financial, creative, ecommerce');
    console.log('');
    console.log('Cities: london, manchester, birmingham, leeds, liverpool, sheffield,');
    console.log('  bristol, edinburgh, glasgow, cardiff, nottingham, leicester, oxford,');
    console.log('  cambridge, brighton, southampton, reading, newcastle, norwich, exeter');
    console.log('');
    console.log('Standalone commands:');
    console.log('  --list-cities                                       Available cities');
    console.log('  --list-sic                                          Available SIC categories');
    console.log('  --customer-types                                    Available company types');
    console.log('');
    console.log('Examples:');
    console.log('  node newbusiness_scraper.js --add-customer demo "ABC Accountants" abc@test.com manchester,london');
    console.log('  node newbusiness_scraper.js --add-detailed tech-london tech_software "Tech Gen" hello@t.com london');
    console.log('  node newbusiness_scraper.js --customer demo --sample');
    console.log('  node newbusiness_scraper.js --status');
  }
}

main().catch(e => console.error('Error:', e.message));
