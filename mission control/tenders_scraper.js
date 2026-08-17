/**
 * Public Sector Tenders — Contracts Finder Scraper & Delivery Engine
 * 
 * Data sources:
 * 1. PRIMARY: Gov.uk Contracts Finder API (free, no key required)
 * 2. FALLBACK: Apify scraper for tenders
 * 3. DEMO: Sample data for testing
 * 
 * Customer flow:
 * 1. Customer signs up → sets keywords, location, CPV codes, value range
 * 2. System checks Contracts Finder daily at 5am
 * 3. New tenders matched to customer's criteria
 * 4. Lead sheet delivered at 9am email
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const APIFY_API_KEY = process.env.APIFY_API_KEY;
const ACCENT_COLOR = '#6366f1';

const DATA_DIR = path.join(__dirname, 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'tenders-customers.json');
const LEADS_FILE = path.join(DATA_DIR, 'tenders-leads.json');
const DELIVERY_FILE = path.join(DATA_DIR, 'tenders-delivery.json');

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
  if (!customer.keywords || customer.keywords.length === 0) issues.push('No keywords selected');
  if (!customer.email) issues.push('No email address set');
  return issues;
}

// ===== GOV.UK CONTRACTS FINDER API =====
// Free API, no key required
// Docs: https://www.gov.uk/contracts-finder
function fetchTendersGovUK(keywords, location) {
  return new Promise((resolve) => {
    const searchTerm = Array.isArray(keywords) ? keywords.join(' ') : (keywords || 'construction');
    const url = '/api/rest/2.0/notices?searchTerm=' + encodeURIComponent(searchTerm) + '&status=Open&size=50';

    const options = {
      hostname: 'www.contractsfinder.service.gov.uk',
      path: url,
      method: 'GET',
      headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' },
      timeout: 30000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const items = data.notices || data.results || data.items || data || [];
          if (!Array.isArray(items)) { resolve([]); return; }
          console.log('    Contracts Finder returned ' + items.length + ' notices');
          const leads = items.filter(n => {
            if (n.status !== 'Open') return false;
            if (location) {
              const loc = (n.region || n.location || n.postalCode || n.contactTown || '').toLowerCase();
              if (!loc.includes(location.toLowerCase())) return false;
            }
            return true;
          }).map(n => ({
            id: n.id || n.noticeId || 'CF_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            title: n.title || n.noticeTitle || '',
            contractingAuthority: n.contractingAuthority || n.organisationName || n.buyerName || '',
            contractValue: n.estimatedValue || n.valueLow || n.value || 0,
            contractValueLabel: n.estimatedValue ? '\u00a3' + Number(n.estimatedValue).toLocaleString() : '',
            deadlineDate: n.deadlineDate || n.closingDate || n.responseDeadline || '',
            cpvCode: (n.cpvCodes || n.cpvCode || []).join(', '),
            description: n.description || n.shortDescription || n.details || '',
            location: n.location || n.region || n.postalCode || '',
            publishedDate: n.publishedDate || n.publicationDate || '',
            procurementType: n.procurementType || n.type || 'Open',
            source: 'Contracts Finder',
            scrapedAt: new Date().toISOString()
          }));
          console.log('    After filtering: ' + leads.length + ' relevant tenders');
          resolve(leads);
        } catch(e) {
          console.log('    Contracts Finder parse error: ' + e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => { console.log('    Contracts Finder error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ===== APIFY TENDERS SCRAPER (FALLBACK) =====
function fetchTendersApify(keywords, location) {
  return new Promise((resolve) => {
    const searchKeywords = Array.isArray(keywords) ? keywords.join(' ') : (keywords || 'construction');
    const data = JSON.stringify({ "keywords": searchKeywords });

    const options = {
      hostname: 'api.apify.com',
      path: '/v2/acts/louisdeconinck~contracts-finder-uk-government/run-sync-get-dataset-items?token=' + APIFY_API_KEY,
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
            console.log('    Apify returned ' + items.length + ' tenders');
            const leads = formatApifyTenders(items, location);
            console.log('    After filtering: ' + leads.length + ' relevant tenders');
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
    req.on('error', (e) => { console.log('    Apify error: ' + e.message); resolve([]); });
    req.setTimeout(120000, () => { req.destroy(); resolve([]); });
    req.write(data);
    req.end();
  });
}

function formatApifyTenders(items, locationFilter) {
  return (items || []).filter(t => {
    if (t.status !== 'Open') return false;
    if (locationFilter) {
      const loc = (t.region || t.postcode || t.contactTown || '').toLowerCase();
      if (!loc.includes(locationFilter.toLowerCase())) return false;
    }
    return true;
  }).map(t => ({
    id: 'CF_' + (t.noticeIdentifier || Date.now()),
    title: t.title || '',
    contractingAuthority: t.organisationName || '',
    contractValue: t.valueLow || t.valueHigh || 0,
    contractValueLabel: t.valueLow ? '\u00a3' + Number(t.valueLow).toLocaleString() + (t.valueHigh ? ' - \u00a3' + Number(t.valueHigh).toLocaleString() : '') : '',
    deadlineDate: t.closingDate || '',
    cpvCode: t.cpvCodes || '',
    description: t.description || '',
    location: [t.contactTown, t.region, t.postcode].filter(Boolean).join(', '),
    publishedDate: t.publishedDate || '',
    procurementType: t.ojeuContractType || '',
    contactEmail: t.contactEmail || '',
    suitableForSME: t.suitableForSME || false,
    source: 'Contracts Finder (Apify)',
    scrapedAt: new Date().toISOString()
  }));
}

// ===== CONTRACTS FINDER HTML SEARCH (working free source) =====
// The old /api/rest/2.0/notices JSON API was retired. The HTML search
// results page (www.contractsfinder.service.gov.uk/search/results) still
// returns real, current notices and is parseable without a key.
function fetchTendersFromHTML(keywords, location, maxCount, pageNum) {
  return new Promise((resolve) => {
    const searchTerm = Array.isArray(keywords) ? keywords.join(' ') : (keywords || '');
    // Paginated Contracts Finder search. page=1 is the first page; the site
    // returns ~20 results per page. Add statuses=current + stage so we capture
    // live opportunities only.
    const pg = pageNum && pageNum > 1 ? '&page=' + pageNum : '';
    const searchPath = '/search/results?keywords=' + encodeURIComponent(searchTerm) + '&tenderStage=2&statuses=current' + pg;
    const options = {
      hostname: 'www.contractsfinder.service.gov.uk',
      path: searchPath,
      method: 'GET',
      headers: {
        'Accept': 'text/html',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36',
        'Accept-Language': 'en-GB,en;q=0.9'
      },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve([]); return; }
        const leads = [];
        const blocks = body.split('<div class="search-result">');
        for (let i = 1; i < blocks.length; i++) {
          const b = blocks[i];
          const titleMatch = b.match(/<h2[^>]*id=([a-f0-9-]+)><a[^>]*>([\s\S]*?)<\/a>/);
          if (!titleMatch) continue;
          const noticeId = titleMatch[1];
          const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
          const clean = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          const text = clean(b);
          let buyer = '';
          const buyerMatch = text.match(/(?:by|for|authority|org)(?:,?\s)+([A-Z][A-Za-z0-9 &]+?)(?:\s+Procurement|\s+Notice|\s+Closing|\s+&nbsp;|$)/);
          if (buyerMatch) buyer = buyerMatch[1].trim();
          // Extract buyer from title block (2nd line of text)
          if (!buyer) {
            const lines = text.split(/\s{2,}|&nbsp;/).filter(Boolean);
            if (lines.length > 1 && lines[1].length > 3 && lines[1].length < 80) buyer = lines[1];
          }
          const closingMatch = text.match(/Closing\s+([0-9]{1,2} [A-Za-z]+ [0-9]{4}[^,]*)/);
          const valueMatch = text.match(/Contract value\s+([^P][A-Za-z0-9£,.&\s-]{3,60})/);
          const locMatch = text.match(/Contract location\s+([A-Za-z0-9 ,-]{2,50})/);
          const pubMatch = text.match(/Publication date\s+([0-9]{1,2} [A-Za-z]+ [0-9]{4})/);
          const stageMatch = text.match(/Procurement stage\s+([A-Za-z ]+?)\s+Notice/);
          const locText = locMatch ? locMatch[1].trim() : '';
          // Extract a clean postcode from the location text (e.g. "N22 7TY")
          const locPc = (locMatch ? (locMatch[1].match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i) || [])[0] : '') || (text.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i) || [])[0];
          // Extract buyer email if present
          const emailMatch = (b.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0];
          if (location) {
            const loc = (locText + ' ' + text).toLowerCase();
            if (!loc.includes(location.toLowerCase())) continue;
          }
          // Build a clean contract value label
          const cleanValue = valueMatch ? valueMatch[1].trim().replace(/\u00a3/g, '£').replace(/&pound;/gi, '£') : '';
          leads.push({
            id: noticeId || 'CF_' + Date.now() + '_' + i,
            title: title,
            contractingAuthority: buyer,
            contractValue: 0,
            contractValueLabel: cleanValue,
            deadlineDate: closingMatch ? closingMatch[1].trim() : '',
            cpvCode: '',
            description: text.length > 100 ? text.substring(0, 300) : text,
            location: locText,
            postcode: locPc || '',
            publishedDate: pubMatch ? pubMatch[1].trim() : '',
            procurementType: stageMatch ? stageMatch[1].trim() : 'Open',
            status: 'Open',
            buyerEmail: emailMatch || '',
            url: 'https://www.contractsfinder.service.gov.uk/notice/' + noticeId,
            source: 'Contracts Finder',
            scrapedAt: new Date().toISOString()
          });
          if (maxCount && leads.length >= maxCount) break;
        }
        console.log('    Contracts Finder (HTML) returned ' + leads.length + ' notices');
        resolve(leads);
      });
    });
    req.on('error', (e) => { console.log('    Contracts Finder (HTML) error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// Collect fresh tenders for the distributor (exported for production server)
async function collectTendersLeads(config) {
  config = config || {};
  const keywords = config.keywords || '';
  const location = config.location || '';
  const maxCount = config.maxCount || 250;
  // Paginate Contracts Finder (empty keyword = ALL live notices). ~20 per page.
  // Loop up to 12 pages (~240 notices) or until a page returns fewer than 10
  // (end of results) — captures the full daily supply.
  async function paginate() {
    let all = [];
    const seenIds = new Set();
    for (let p = 1; p <= 12; p++) {
      let page = await fetchTendersFromHTML(keywords, location, maxCount, p);
      if (!page || page.length === 0) break;
      all = all.concat(page);
      if (all.length >= maxCount) break;
      if (page.length < 10) break;
      // small delay to be polite to the site
      await new Promise(r => setTimeout(r, 400));
    }
    // ADD Find a Tender (FTS) — the UK's high-value contract portal. Complements
    // Contracts Finder with a separate supply stream (different notices). Run up
    // to 10 pages so high-value notices add meaningful volume to the pool.
    for (let f = 1; f <= 10; f++) {
      let fts = await fetchFindATender(maxCount, f);
      if (!fts || fts.length === 0) break;
      let added = 0;
      fts.forEach(function(l){ if (l.id && !seenIds.has(l.id)) { seenIds.add(l.id); all.push(l); added++; } });
      if (added === 0 || all.length >= maxCount) break;
      await new Promise(r => setTimeout(r, 400));
    }
    return all;
  }
  return paginate();
}

// ===== FIND A TENDER (FTS) SCRAPER =====
// FTS (www.find-tender.service.gov.uk) is the UK's official replacement for the
// OJEU/TED regime — high-value public contracts across the whole UK. It publishes
// ~20 notices per search-result page and carries hundreds of thousands of notices.
// This adds a second, complementary supply stream on top of Contracts Finder.
function fetchFindATender(maxCount, pageNum) {
  return new Promise((resolve) => {
    const pg = pageNum && pageNum > 1 ? '&p=' + pageNum : '';
    const searchPath = '/Search/Results?NoticeType=ContractNotice&NoticeStatus=Open&SortField=PublishedDate' + pg;
    const req = https.request({ hostname: 'www.find-tender.service.gov.uk', path: searchPath, method: 'GET', headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36', 'Accept-Language': 'en-GB,en;q=0.9' }, timeout: 30000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve([]); return; }
        const results = [];
        const blocks = body.split('<div class="search-result">');
        for (let i = 1; i < blocks.length; i++) {
          const b = blocks[i];
          const headMatch = b.match(/<h2 id="([0-9]+-[0-9]+-heading)"[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h2>/);
          if (!headMatch) continue;
          const noticeId = headMatch[1].replace('-heading', '');
          const title = headMatch[2].replace(/<[^>]+>/g, '').trim();
          // Buyer from the sub-header block
          const subHeader = b.match(/<div class="search-result-sub-header[^>]*>([\s\S]*?)<\/div>/);
          let buyer = subHeader ? subHeader[1].replace(/<[^>]+>/g, '').trim() : '';
          // Parse the <dt><strong>LABEL</strong></dt><dd>VALUE</dd> fields
          function field(label) {
            const m = b.match(new RegExp('<strong>' + label + '</strong><\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>', 'i'));
            return m ? m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
          }
          const publishedDate = field('Publication date');
          const closingDate = field('Closing date') || field('Deadline');
          const location = field('Location') || field('Contract location');
          const noticeType = field('Notice type');
          const suppliers = field('Suppliers');
          const clean = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          const text = clean(b);
          const locPc = (text.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i) || [])[0] || '';
          results.push({
            id: 'FTS_' + noticeId,
            title: title,
            contractingAuthority: buyer,
            contractValue: 0,
            contractValueLabel: '',
            deadlineDate: closingDate,
            cpvCode: '',
            description: text.length > 100 ? text.substring(0, 400) : text,
            location: location,
            postcode: locPc,
            publishedDate: publishedDate,
            procurementType: noticeType || 'Open',
            status: 'Open',
            buyerEmail: '',
            url: 'https://www.find-tender.service.gov.uk/Notice/' + noticeId,
            source: 'Find a Tender',
            scrapedAt: new Date().toISOString()
          });
          if (maxCount && results.length >= maxCount) break;
        }
        console.log('    Find a Tender (FTS) returned ' + results.length + ' notices');
        resolve(results);
      });
    });
    req.on('error', (e) => { console.log('    Find a Tender error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// ===== TENDER DETAIL ENRICHMENT =====
// Fetch the tender's detail page and extract the buyer contact info + how to
// apply, so customers can actually contact/apply rather than only see the title.
// Works for Contracts Finder and Public Contracts Scotland.
function fetchTenderDetail(url) {
  return new Promise((resolve) => {
    if (!url) return resolve({});
    try {
      const parsed = new URL(url);
      const opts = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-GB,en;q=0.9',
          'Connection': 'keep-alive'
        },
        timeout: 30000
      };
      const req = https.request(opts, (res) => {
        let body = '';
        res.on('data', c => body += c);
        res.on('end', () => {
          if (res.statusCode !== 200) { resolve({}); return; }
          const text = body.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
          const html = body;
          const out = {};
          // Contact name — CF uses "Contact name", PCS uses "Contact person"
          const nameMatch = text.match(/Contact\s+(?:name|person)\s*:?\s*([A-Z][A-Za-z' .-]{2,60}?)(?=\s+(?:Address|Telephone|Email|E-mail|Country|NUTS)\b)/i);
          if (nameMatch) out.contactName = nameMatch[1].trim();
          else {
            const name2 = text.match(/Contact\s+(?:name|person)\s*:?\s*([A-Z][A-Za-z' .-]{2,60})/i);
            if (name2) out.contactName = name2[1].trim();
          }
          // Telephone (CF: "Telephone +44...", PCS: "Telephone: +44...")
          const telMatch = text.match(/Telephone\s*:?\s*(\+?[0-9 ()-]{7,18}?)(?=\s+(?:Email|E-mail|Address|NUTS)\b|$)/i);
          if (telMatch) out.contactPhone = telMatch[1].trim();
          // Email (from mailto link preferred)
          const mailto = html.match(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          const emailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          if (mailto) out.contactEmail = mailto[1];
          else if (emailMatch) out.contactEmail = emailMatch[1];
          // Buyer address block (CF format: "Address" ... "Country" ... "Telephone")
          const addrStart = text.indexOf('Address');
          if (addrStart !== -1) {
            let addrEnd = text.indexOf('Country', addrStart);
            let addrBlock = '';
            if (addrEnd > addrStart) {
              addrBlock = text.substring(addrStart + 7, addrEnd).trim();
            } else {
              addrEnd = text.indexOf('Telephone', addrStart);
              addrBlock = text.substring(addrStart + 7, addrEnd > addrStart ? addrEnd : addrStart + 90).trim();
            }
            addrBlock = addrBlock.replace(/^:?\s*/, '').replace(/\s{2,}/g, ', ');
            // Only keep if it looks like an address (contains a letter + postcode-ish)
            if (addrBlock && addrBlock.length > 8 && /[A-Za-z]/.test(addrBlock) && !/buyer profile/i.test(addrBlock)) {
              // Drop trailing "United Kingdom" for brevity
              out.buyerAddress = addrBlock.replace(/\s+United Kingdom\s*$/i, '');
            }
          }
          // PCS address: after "Name and addresses <buyer>" the street/city/postcode
          // follow on one line, ending at the postcode + UK.
          if (!out.buyerAddress) {
            const naIdx = text.indexOf('Name and addresses');
            if (naIdx !== -1) {
              const after = text.substring(naIdx + 18, naIdx + 260);
              const pcMatch = after.match(/([A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2})/i);
              if (pcMatch) {
                // Address = everything between the buyer name and the postcode
                const end = pcMatch.index + pcMatch[1].length;
                const segment = after.substring(0, end).trim();
                // Skip the leading organisation name (first "word set")
                const parts = segment.split(/\s{2,}|&nbsp;|,\s+(?=[A-Z])/).filter(Boolean);
                const lastPart = parts[parts.length - 1] || segment;
                let addr = lastPart;
                if (addr.length < 12) addr = segment;
                // addr may contain the org name + address; take from first ", " onward if possible
                const comma = addr.indexOf(',');
                if (comma !== -1 && addr.substring(0, comma).split(' ').length <= 4) addr = addr.substring(comma + 1).trim();
                if (addr && addr.length > 8 && !/buyer profile/i.test(addr)) out.buyerAddress = addr.replace(/\s+UK\s*$/i, '');
              }
            }
          }
          // How to apply / application info — stop at "About the buyer"
          const applyStart = text.indexOf('How to apply');
          if (applyStart !== -1) {
            const applyEnd = text.indexOf('About the buyer', applyStart);
            let how = text.substring(applyStart, applyEnd > applyStart ? applyEnd : applyStart + 150).trim();
            how = how.replace(/^How to apply\s*:?\s*/i, '').replace(/^:?\s*/, '').replace(/^\s*y\s+/, '');
            if (how) out.howToApply = how;
          }
          // Apply link (more information / external portal)
          const moreHref = html.match(/More information[\s\S]{0,200}?href="([^"]+)"/);
          const applyHref = html.match(/How to apply[\s\S]{0,300}?href="([^"]+)"/);
          if (moreHref && moreHref[1] && moreHref[1].indexOf('http') === 0) out.applyLink = moreHref[1];
          else if (applyHref && applyHref[1] && applyHref[1].indexOf('http') === 0) out.applyLink = applyHref[1];
          resolve(out);
        });
      });
      req.on('error', () => resolve({}));
      req.setTimeout(30000, () => { req.destroy(); resolve({}); });
      req.end();
    } catch(e) { resolve({}); }
  });
}

// Enrich a batch of tender leads with detail-page contact info.
async function enrichTenders(leads) {
  const out = [];
  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i];
    const detail = await fetchTenderDetail(lead.url);
    if (Object.keys(detail).length) {
      lead.contactName = detail.contactName || lead.contactName || '';
      lead.contactPhone = detail.contactPhone || lead.contactPhone || '';
      lead.contactEmail = detail.contactEmail || lead.buyerEmail || lead.contactEmail || '';
      lead.buyerAddress = detail.buyerAddress || lead.buyerAddress || '';
      lead.howToApply = detail.howToApply || lead.howToApply || '';
      lead.applyLink = detail.applyLink || lead.applyLink || lead.url || '';
    }
    out.push(lead);
  }
  return out;
}

// ===== SAMPLE DATA GENERATOR =====
function generateSampleTenders(keywords, location, count) {
  const tenderDescriptions = [
    'IT Support Services for {org}',
    'Building Refurbishment at {org}',
    'Cleaning and Janitorial Services for {org}',
    'Catering Services for {org} Schools',
    'Management Consultancy for {org}',
    'Cyber Security Assessment for {org}',
    'Social Care Provision at {org}',
    'Highways Maintenance Contract for {org}',
    'Waste Collection and Disposal Services for {org}',
    'Street Lighting Maintenance for {org}',
    'Facilities Management for {org} Estate',
    'HR Software Implementation for {org}',
    'Legal Services Panel for {org}',
    'Architectural Design Services for {org}',
    'Grounds Maintenance for {org} Parks',
    'Energy Efficiency Upgrades for {org} Housing Stock',
    'Fleet Vehicle Supply and Maintenance for {org}',
    'Print and Mail Services for {org}',
    'Tree Surgery and Arboriculture for {org}',
    'Playground Equipment Installation for {org}',
    'Electrical Testing and Inspection for {org} Properties',
    'Gas Servicing Contract for {org}',
    'Pest Control Services for {org}',
    'Translation and Interpretation for {org}',
    'Occupational Health Services for {org} Staff',
    'Event Management for {org}',
    'Marketing and Communications Support for {org}',
    'Recruitment Agency Services for {org}',
    'Training and Development Programme for {org}',
    'Security Guard Services for {org} Premises'
  ];
  const orgs = [
    'London Borough of Camden', 'Manchester City Council', 'Birmingham City Council',
    'Leeds City Council', 'Liverpool City Council', 'Bristol City Council',
    'Nottingham City Council', 'Sheffield City Council', 'Newcastle City Council',
    'Leicester City Council', 'NHS England', 'Department for Work and Pensions',
    'Ministry of Justice', 'Home Office', 'Environment Agency',
    'Transport for London', 'Highways England', 'Natural England',
    'Arts Council England', 'Kent County Council', 'Essex County Council',
    'Surrey County Council', 'Hampshire County Council', 'Lancashire County Council',
    'Greater Manchester Combined Authority', 'West Midlands Combined Authority',
    'Scottish Government', 'Welsh Government', 'Northern Ireland Executive',
    'Ministry of Defence', 'Department for Education', 'UK Research and Innovation'
  ];
  const cpvCodes = ['72000000', '45000000', '90900000', '55500000', '79400000', '48700000',
    '85300000', '45233000', '90500000', '50232000', '79993000', '48000000',
    '79100000', '71200000', '77300000', '45321000', '34100000', '79800000',
    '77200000', '37500000', '71630000', '50720000', '90922000', '79530000',
    '85100000', '79950000', '79340000', '79600000', '80500000', '79710000'];
  const locations = ['London', 'Manchester', 'Birmingham', 'Leeds', 'Liverpool', 'Bristol',
    'Nottingham', 'Sheffield', 'Newcastle', 'Leicester', 'Glasgow', 'Edinburgh',
    'Cardiff', 'Belfast', 'South East', 'South West', 'Midlands', 'North West',
    'North East', 'Yorkshire and the Humber', 'East of England', 'Scotland', 'Wales', 'Northern Ireland'];

  const leads = [];
  const used = new Set();

  for (let i = 0; i < count; i++) {
    const org = orgs[Math.floor(Math.random() * orgs.length)];
    const template = tenderDescriptions[Math.floor(Math.random() * tenderDescriptions.length)];
    const title = template.replace('{org}', org);
    const loc = (location && location !== 'UK') ? location : locations[Math.floor(Math.random() * locations.length)];
    const value = [25000, 50000, 100000, 150000, 250000, 500000, 1000000, 2500000][Math.floor(Math.random() * 8)];
    const deadline = new Date(Date.now() + Math.floor(Math.random() * 60 + 14) * 86400000);
    const published = new Date(Date.now() - Math.floor(Math.random() * 14) * 86400000);
    const cpv = cpvCodes[Math.floor(Math.random() * cpvCodes.length)];
    const cpvLabel = cpv + ' — ' + ['IT Services', 'Construction', 'Cleaning', 'Catering', 'Consultancy',
      'Software', 'Health', 'Construction', 'Waste', 'Maintenance', 'FM', 'IT',
      'Legal', 'Architecture', 'Grounds', 'Energy', 'Vehicles', 'Print',
      'Arboriculture', 'Playground', 'Electrical', 'Gas', 'Pest Control',
      'Translation', 'Health', 'Events', 'Marketing', 'Recruitment',
      'Training', 'Security'][Math.floor(Math.random() * 30)];
    const deadlineDays = Math.floor((deadline - Date.now()) / 86400000);

    if (used.has(title)) continue;
    used.add(title);

    leads.push({
      id: 'TD' + Date.now() + i,
      title: title,
      contractingAuthority: org,
      contractValue: value,
      contractValueLabel: '\u00a3' + value.toLocaleString(),
      deadlineDate: deadline.toISOString().split('T')[0],
      deadlineDaysRemaining: deadlineDays,
      cpvCode: cpv,
      cpvCodeLabel: cpvLabel,
      description: 'This opportunity is for ' + title.toLowerCase() + '. The ' + (Math.random() > 0.5 ? 'contracting authority' : 'buyer') + ' is seeking qualified suppliers to deliver the required services over a period of ' + (Math.floor(Math.random() * 4) + 1) + ' years. Estimated contract value is \u00a3' + value.toLocaleString() + '.',
      location: loc,
      publishedDate: published.toISOString().split('T')[0],
      procurementType: ['Open', 'Restricted', 'Negotiated', 'Competitive Dialogue'][Math.floor(Math.random() * 4)],
      source: 'Sample Data',
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
  const todayLeads = customerLeads.filter(l => l.scrapedAt && l.scrapedAt.startsWith(today));
  const limit = customer.leadsPerDay || 15;
  const batch = todayLeads.slice(0, limit);

  const sheet = {
    customerId, company: customer.company, email: customer.email,
    date: today, generatedAt: new Date().toISOString(),
    totalLeads: batch.length, leadLimit: limit,
    leads: batch.map(l => ({
      title: l.title,
      contractingAuthority: l.contractingAuthority,
      contractValue: l.contractValueLabel,
      deadlineDate: l.deadlineDate,
      deadlineDaysRemaining: l.deadlineDaysRemaining,
      cpvCode: l.cpvCodeLabel || l.cpvCode,
      location: l.location,
      description: l.description
    })),
    summary: {
      total: batch.length,
      byLocation: {},
      byValueRange: {},
      byProcurementType: {},
      totalContractValue: 0
    }
  };

  for (const l of batch) {
    const loc = l.location || 'Unknown';
    if (!sheet.summary.byLocation[loc]) sheet.summary.byLocation[loc] = 0;
    sheet.summary.byLocation[loc]++;

    const range = l.contractValue < 100000 ? 'Under \u00a3100k' :
                  l.contractValue < 500000 ? '\u00a3100k-\u00a3500k' :
                  l.contractValue < 1000000 ? '\u00a3500k-\u00a31M' :
                  '\u00a31M+';
    if (!sheet.summary.byValueRange[range]) sheet.summary.byValueRange[range] = 0;
    sheet.summary.byValueRange[range]++;

    const type = l.procurementType || 'Unspecified';
    if (!sheet.summary.byProcurementType[type]) sheet.summary.byProcurementType[type] = 0;
    sheet.summary.byProcurementType[type]++;

    sheet.summary.totalContractValue += l.contractValue || 0;
  }

  const deliveries = loadJSON(DELIVERY_FILE);
  if (!deliveries[customerId]) deliveries[customerId] = [];
  deliveries[customerId].unshift(sheet);
  deliveries[customerId] = deliveries[customerId].slice(0, 90);
  deliveries._lastDelivery = new Date().toISOString();
  saveJSON(DELIVERY_FILE, deliveries);

  return sheet;
}

function generateEmailHTML(sheet) {
  const color = ACCENT_COLOR;
  const leads = sheet.leads;

  let leadsHTML = leads.map(l => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:13px">${l.title}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px">${l.contractingAuthority}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#4ade80;font-size:14px">${l.contractValue}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#facc15;font-size:12px">${l.deadlineDate}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px">${l.location || ''}</td>
    </tr>
  `).join('');

  const byLocationHTML = Object.entries(sheet.summary.byLocation).map(([loc, count]) =>
    `<span style="display:inline-block;padding:4px 12px;background:rgba(99,102,241,0.1);border-radius:4px;color:${color};font-size:12px;margin:2px">${loc}: ${count}</span>`
  ).join('');

  return '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"></head>\n<body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif">\n' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0">\n' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">\n' +
    '<tr><td style="background:#0a0a0a;padding:32px 32px 20px;border-bottom:3px solid ' + color + '">\n' +
    '<h1 style="font-family:Outfit,sans-serif;font-size:24px;font-weight:800;color:#fff;margin:0">\n' +
    '  Public Sector <span style="color:' + color + '">Tenders</span>\n' +
    '</h1>\n' +
    '<p style="color:#888;font-size:14px;margin:8px 0 0">' + sheet.company + ' — Daily Tender Sheet</p>\n' +
    '</td></tr>\n' +
    '<tr><td style="background:#0a0a0a;padding:24px 32px">\n' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">\n' +
    '  <h2 style="font-family:Outfit,sans-serif;font-size:20px;font-weight:700;color:#fff;margin:0">Today\'s Tenders</h2>\n' +
    '  <span style="font-size:14px;color:#888">' + sheet.date + '</span>\n' +
    '</div>\n' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">\n' +
    '  <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:14px;text-align:center">\n' +
    '    <div style="font-size:24px;font-weight:800;color:' + color + ';font-family:Outfit">' + sheet.summary.total + '</div>\n' +
    '    <div style="font-size:11px;color:#888">New Tenders</div>\n' +
    '  </div>\n' +
    '  <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:14px;text-align:center">\n' +
    '    <div style="font-size:24px;font-weight:800;color:#4ade80;font-family:Outfit">\u00a3' + (sheet.summary.totalContractValue ? Math.round(sheet.summary.totalContractValue / sheet.summary.total).toLocaleString() : '0') + '</div>\n' +
    '    <div style="font-size:11px;color:#888">Avg Value</div>\n' +
    '  </div>\n' +
    '  <div style="background:rgba(99,102,241,0.06);border:1px solid rgba(99,102,241,0.15);border-radius:10px;padding:14px;text-align:center">\n' +
    '    <div style="font-size:24px;font-weight:800;color:' + color + ';font-family:Outfit">' + Object.keys(sheet.summary.byLocation).length + '</div>\n' +
    '    <div style="font-size:11px;color:#888">Locations</div>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div style="margin-bottom:16px">' + byLocationHTML + '</div>\n' +
    '</td></tr>\n' +
    '<tr><td style="background:#000;padding:0 32px">\n' +
    '<table width="100%" cellpadding="0" cellspacing="0">\n' +
    '<tr>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Tender</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Authority</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Value</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Deadline</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Location</th>\n' +
    '</tr>\n' +
    leadsHTML + '\n' +
    '</table>\n' +
    '</td></tr>\n' +
    '<tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a">\n' +
    '<p style="color:#888;font-size:12px;margin:0">You\'re receiving this because you subscribed to Public Sector Tenders.\n' +
    '<a href="#" style="color:' + color + '">View in dashboard</a> | <a href="#" style="color:#888">Unsubscribe</a></p>\n' +
    '<p style="color:#555;font-size:11px;margin:8px 0 0">Public Sector Tenders \u00a9 ' + new Date().getFullYear() + '</p>\n' +
    '</td></tr>\n' +
    '</table>\n' +
    '</td></tr></table>\n' +
    '</body></html>';
}

// ===== RUN FOR A CUSTOMER =====
async function runForCustomer(customerId, useSampleData) {
  console.log('\n=== Running Public Sector Tenders Scraper for: ' + customerId + ' ===');

  const customers = loadJSON(CUSTOMERS_FILE);
  const customer = customers[customerId];
  if (!customer) {
    console.log('  ERROR: Customer not found');
    return;
  }

  const issues = validateCustomer(customer);
  if (issues.length > 0) {
    console.log('  PROFILE ISSUES:'); issues.forEach(i => console.log('    - ' + i));
    return;
  }

  console.log('  Company: ' + customer.company);
  console.log('  Email: ' + customer.email);
  console.log('  Keywords: ' + (customer.keywords || []).join(', '));
  console.log('  Location: ' + (customer.location || 'UK-wide'));
  console.log('  Value range: \u00a3' + (customer.minValue || 0).toLocaleString() + ' - \u00a3' + (customer.maxValue || 'Unlimited').toLocaleString());
  console.log('  CPV codes: ' + (customer.cpvCodes || []).join(', ') || 'All categories');
  console.log('  Plan: ' + (customer.plan || 'Pro') + ' | ' + (customer.leadsPerDay || 15) + '/day');

  let leads = [];
  if (!useSampleData) {
    console.log('\n  Fetching live data from Contracts Finder Gov.uk API...');
    let tenderResults = await fetchTendersGovUK(customer.keywords, customer.location);
    if (tenderResults.length === 0) {
      console.log('  Gov.uk API returned no results (will use sample data fallback)');
    }
    console.log('  Found ' + tenderResults.length + ' tenders');

    for (const r of tenderResults) {
      r.customerId = customerId;
      leads.push(r);
    }
  }

  if (leads.length === 0) {
    console.log('  LIVE SCRAPE FAILED — using sample data as fallback');
    leads = generateSampleTenders(customer.keywords, customer.location, customer.leadsPerDay || 15);
    leads = leads.map(l => ({ ...l, customerId }));
    console.log('  Generated ' + leads.length + ' sample tenders');
  }

  const allLeads = loadJSON(LEADS_FILE);
  if (!allLeads[customerId]) allLeads[customerId] = [];
  allLeads[customerId] = [...leads, ...allLeads[customerId]].slice(0, 500);
  allLeads._lastRun = new Date().toISOString();
  saveJSON(LEADS_FILE, allLeads);
  console.log('  Saved ' + leads.length + ' leads (' + allLeads[customerId].length + ' total)');

  const sheet = prepareDailyLeadSheet(customerId);
  if (sheet.error) { console.log('  ERROR: ' + sheet.error); return; }

  console.log('\n  === LEAD SHEET READY FOR DELIVERY ===');
  console.log('  To: ' + sheet.email);
  console.log('  Leads: ' + sheet.totalLeads + ' (limit: ' + sheet.leadLimit + ')');
  console.log('  Summary: ' + JSON.stringify(sheet.summary.byLocation));

  sheet.leads.slice(0, 3).forEach((l, i) => {
    console.log('    ' + (i+1) + '. ' + l.title + ' — ' + l.contractValue + ' — ' + l.deadlineDate);
  });

  const emailHTML = generateEmailHTML(sheet);
  fs.writeFileSync(path.join(DATA_DIR, 'tenders-email-' + customerId + '.html'), emailHTML);
  console.log('\n  Email template saved to data/');

  return { customer, sheet };
}

// ===== CUSTOMER MANAGEMENT =====
function addCustomer(id, company, email, keywords, options) {
  const customers = loadJSON(CUSTOMERS_FILE);
  customers[id] = {
    company, email, active: true,
    keywords: keywords || ['IT', 'construction', 'cleaning'],
    location: (options && options.location) || 'UK',
    minValue: (options && options.minValue) || 0,
    maxValue: (options && options.maxValue) || 0,
    cpvCodes: (options && options.cpvCodes) || [],
    plan: (options && options.plan) || 'Pro',
    leadsPerDay: (options && options.leadsPerDay) || 15,
    createdAt: new Date().toISOString(),
    lastDelivery: null,
    totalLeadsReceived: 0
  };
  saveJSON(CUSTOMERS_FILE, customers);
  console.log('\nCustomer "' + id + '" created:');
  console.log('  Company: ' + company);
  console.log('  Email: ' + email);
  console.log('  Keywords: ' + keywords.join(', '));
  console.log('  Location: ' + customers[id].location);
  console.log('  Plan: ' + customers[id].plan + ' (' + customers[id].leadsPerDay + ' tenders/day)');
  return customers[id];
}

function showStatus() {
  const customers = loadJSON(CUSTOMERS_FILE);
  const leads = loadJSON(LEADS_FILE);
  const deliveries = loadJSON(DELIVERY_FILE);

  console.log('\n=== Public Sector Tenders — Status ===\n');
  for (const [id, c] of Object.entries(customers)) {
    const cLeads = leads[id] || [];
    const todayLeads = cLeads.filter(l => l.scrapedAt && l.scrapedAt.startsWith(new Date().toISOString().split('T')[0]));
    const cDeliveries = deliveries[id] || [];
    console.log('  ' + id + ': ' + c.company);
    console.log('    Email: ' + c.email);
    console.log('    Keywords: ' + (c.keywords || []).join(', '));
    console.log('    Location: ' + (c.location || 'UK'));
    console.log('    Plan: ' + (c.plan || 'N/A') + ' (' + (c.leadsPerDay || 15) + '/day)');
    console.log('    Total: ' + cLeads.length + ' | Today: ' + todayLeads.length + ' | Deliveries: ' + cDeliveries.length);
    console.log('');
  }
  console.log('Last run: ' + (leads._lastRun || 'Never'));
  console.log('Last delivery: ' + (deliveries._lastDelivery || 'Never'));
}

async function main() {
  const args = process.argv.slice(2);

  if (args[0] === '--customer') {
    await runForCustomer(args[1] || 'demo-tenders', args.includes('--sample') || args.includes('--demo'));
  } else if (args[0] === '--all') {
    const customers = loadJSON(CUSTOMERS_FILE);
    for (const id of Object.keys(customers)) {
      if (customers[id].active !== false) await runForCustomer(id, false);
    }
  } else if (args[0] === '--add-customer') {
    const id = args[1] || 'demo-tenders';
    const company = args[2] || 'ABC Construction Ltd';
    const email = args[3] || 'info@abcconstruction.co.uk';
    const keywords = (args[4] || 'IT,construction,cleaning,catering').split(',');
    addCustomer(id, company, email, keywords);
  } else if (args[0] === '--add-detailed') {
    const id = args[1] || 'tech-tenders';
    const company = args[2] || 'TechServe IT Solutions';
    const email = args[3] || 'bids@techserve.co.uk';
    addCustomer(id, company, email, (args[4] || 'IT,cyber,software,consultancy').split(','), {
      location: args[5] || 'London',
      minValue: args[6] || 50000,
      maxValue: args[7] || 0,
      cpvCodes: args[8] ? args[8].split(',') : [],
      plan: 'Pro',
      leadsPerDay: 25
    });
  } else if (args[0] === '--status') {
    showStatus();
  } else if (args[0] === '--send-delivery') {
    const sheet = prepareDailyLeadSheet(args[1] || 'demo-tenders');
    if (sheet.error) { console.log('ERROR: ' + sheet.error); return; }
    console.log('\nDelivery prepared for ' + sheet.company + ':');
    console.log('  ' + sheet.totalLeads + ' tenders to ' + sheet.email);
    console.log('  Summary: ' + JSON.stringify(sheet.summary.byLocation));
    const html = generateEmailHTML(sheet);
    fs.writeFileSync(path.join(DATA_DIR, 'tenders-delivery-' + args[1] + '-' + sheet.date + '.html'), html);
    console.log('  Email HTML saved');
  } else {
    console.log('Public Sector Tenders — Contracts Finder Scraper & Delivery Engine');
    console.log('');
    console.log('Usage:');
    console.log('  --add-customer <id> <company> <email> <keywords>     Add customer (comma-sep keywords)');
    console.log('  --add-detailed <id> <company> <email> <kw> <loc>    Add with full filters');
    console.log('  --customer <id> [--sample]                           Scrape & deliver');
    console.log('  --all                                                Run all customers');
    console.log('  --send-delivery <id>                                 Prepare delivery only');
    console.log('  --status                                            Show all status');
    console.log('');
    console.log('Examples:');
    console.log('  node tenders_scraper.js --add-customer demo "ABC Ltd" abc@test.com "IT,construction"');
    console.log('  node tenders_scraper.js --customer demo --sample');
    console.log('  node tenders_scraper.js --status');
  }
}

module.exports = { collectTendersLeads, fetchTendersFromHTML, fetchFindATender, fetchTenderDetail, enrichTenders };

if (require.main === module) {
  main().catch(e => console.error('Error:', e.message));
}
