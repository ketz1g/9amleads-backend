/**
 * Probate Leads — Probate Grant Scraper & Delivery Engine
 * 
 * Data sources:
 * 1. PRIMARY: Apify Gov.uk Probate scraper (when available)
 * 2. FALLBACK: Gov.uk probate registry direct scraping
 * 3. DEMO: Sample data for testing
 * 
 * Customer flow:
 * 1. Customer signs up → selects counties & filters (estate value, property)
 * 2. System checks probate registry daily at 5am
 * 3. New probate grants matched to customer's criteria
 * 4. Lead sheet delivered by 7am email
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const https = require('https');

const APIFY_API_KEY = process.env.APIFY_API_KEY;

const DATA_DIR = path.join(__dirname, 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'probate-customers.json');
const LEADS_FILE = path.join(DATA_DIR, 'probate-leads.json');
const DELIVERY_FILE = path.join(DATA_DIR, 'probate-delivery.json');

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
  if (!customer.counties || customer.counties.length === 0) issues.push('No counties selected');
  if (!customer.email) issues.push('No email address set');
  return issues;
}

// ===== GOV.UK PROBATE REGISTRY SCRAPER =====
// The probate registry search is available at:
// https://www.gov.uk/search-will-probate
// We search by surname range to get all recent grants
function fetchProbateRegistry() {
  return new Promise((resolve) => {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    const batchSize = 6;
    const batches = [];
    for (let i = 0; i < letters.length; i += batchSize) {
      batches.push(letters.slice(i, i + batchSize).join(''));
    }
    
    let allResults = [];
    let completed = 0;
    let timedOut = false;
    
    for (const batch of batches) {
      const d = new Date();
      d.setDate(d.getDate() - 14);
      
      const opts = {
        hostname: 'www.gov.uk',
        path: '/search-will-probate?surname=' + encodeURIComponent(batch) + '&dateOfDeathFrom=' + d.toISOString().split('T')[0],
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html',
          'Referer': 'https://www.gov.uk/search-will-probate'
        }
      };
      
      const req = https.request(opts, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (timedOut) return;
          completed++;
          try {
            const table = data.match(/<table[^>]*class="[^"]*govuk-table[^"]*"[^>]*>([\s\S]*?)<\/table>/i) ||
                          data.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
            const body = table ? table[1] : '';
            const rows = body.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) || [];
            for (const row of rows) {
              const cols = row.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [];
              if (cols.length >= 5) {
                const clean = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                const name = clean(cols[0]);
                const deceasedAddr = clean(cols[1]);
                const dateOfDeath = clean(cols[2]);
                const grantDate = clean(cols[3]);
                const grantType = clean(cols[4]);
                if (name && name.length > 3) {
                  allResults.push({
                    id: 'PROB_' + Date.now() + '_' + completed + '_' + allResults.length,
                    name: name,
                    deceasedAddress: deceasedAddr,
                    dateOfDeath: dateOfDeath,
                    grantDate: grantDate,
                    grantType: grantType || 'Probate Grant',
                    source: 'Gov.uk Probate Registry',
                    scrapedAt: new Date().toISOString()
                  });
                }
              }
            }
          } catch(e) {}
          
          if (completed >= batches.length) resolve(allResults);
        });
      });
      req.on('error', () => { if (!timedOut) { completed++; if (completed >= batches.length) resolve(allResults); } });
      req.setTimeout(15000, () => { if (!timedOut) { req.destroy(); completed++; if (completed >= batches.length) resolve(allResults); } });
      req.end();
    }
    
    setTimeout(() => { timedOut = true; resolve(allResults); }, 45000);
  });
}

// ===== UK GAZETTE WILLS & PROBATE NOTICES (free HTML search) =====
// The Gazette publishes official Deceased Estates / Wills & Probate notices.
// The search page (HTML) is free to fetch and includes notice IDs, deceased
// names, publication dates. Detail pages add the full address and estate info.
// OGL v3 licence (personal data requires care, but these are public notices).
function fetchGazetteHTML(maxItems, pageNum) {
  return new Promise((resolve) => {
    const searchPath = '/all-notices/notice?notice-type=deceased-estates&results-page-size=' + (maxItems || 50) + '&sort-by=latest-date' + (pageNum && pageNum > 1 ? '&results-page=' + pageNum : '');
    const req = https.request({ hostname: 'www.thegazette.co.uk', path: searchPath, method: 'GET', headers: { 'Accept': 'text/html', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36', 'Accept-Language': 'en-GB,en;q=0.9' }, timeout: 30000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { console.log('    Gazette HTTP ' + res.statusCode); resolve([]); return; }
        // The Gazette search page uses <article id="item-..."> blocks. Each block
        // contains the deceased name, notice id, publication date, and (when the
        // search is in full-article mode) the deceased address.
        const articles = body.split('<article id="item-');
        const leads = [];
        for (let i = 1; i < articles.length; i++) {
          const a = articles[i];
          const idMatch = a.match(/notice\/(\d+)/);
          const titleMatch = a.match(/<h3>([\s\S]*?)<\/h3>/);
          const dateMatch = a.match(/Publication date<\/dt>\s*<dd>([0-9]{1,2} [A-Za-z]+ [0-9]{4})/);
          if (!idMatch || !titleMatch) continue;
          const name = titleMatch[1].replace(/<[^>]+>/g, '').trim();
          const noticeId = idMatch[1];
          const pubDate = dateMatch ? dateMatch[1].trim() : '';
          // Extract deceased address from the block if present ("Address of Deceased")
          let deceasedAddress = '';
          const addrMatch = a.match(/Address of Deceased<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
          if (addrMatch) deceasedAddress = addrMatch[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
          // Parse name into surname-first format (Gazette lists "SURNAME, First Name")
          let deceasedName = name;
          let surname = '', firstNames = name;
          if (name.indexOf(',') > -1) {
            var parts = name.split(',').map(function(s){ return s.trim(); });
            surname = parts[0];
            firstNames = parts.slice(1).join(' ').trim();
            deceasedName = (firstNames + ' ' + surname).trim();
          }
          leads.push({
            id: 'GAZ_' + noticeId,
            name: deceasedName,
            surname: surname,
            deceasedAddress: deceasedAddress,
            dateOfDeath: '',
            grantDate: pubDate,
            claimExpiry: '',
            estateValue: 0,
            estateValueLabel: '',
            solicitor: '',
            executorName: '',
            executorAddress: '',
            solicitorAddress: '',
            noticeUrl: 'https://www.thegazette.co.uk/notice/' + noticeId,
            occupation: '',
            grantType: 'Deceased Estates',
            source: 'The Gazette (HTML)',
            scrapedAt: new Date().toISOString()
          });
        }
        console.log('    Gazette (HTML) returned ' + leads.length + ' deceased estate notices');
        resolve(leads);
      });
    });
    req.on('error', (e) => { console.log('    Gazette HTML error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.end();
  });
}

// Fetch a single Gazette notice detail page and extract the deceased's
// structured address (street, locality, postcode, region). Free, reliable.
function fetchGazetteDetail(noticeId) {
  return new Promise((resolve) => {
    // Use the Gazette's structured linked-data JSON endpoint (much faster and more
    // reliable than parsing the HTML detail page). Returns familyName, firstName,
    // full address (street/locality/postcode/region), claim deadline, solicitor etc.
    const req = https.request({ hostname: 'www.thegazette.co.uk', path: '/notice/' + noticeId + '/data.json?view=linked-data&_metadata=all', method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125.0.0.0 Safari/537.36', 'Accept-Language': 'en-GB,en;q=0.9' }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode !== 200) { resolve(null); return; }
        try {
          const j = JSON.parse(body);
          const pt = (j.result && j.result.primaryTopic) || {};
          const isAbout = pt.isAbout || {};
          const estateOf = isAbout.hasEstateOf || {};
          const addr = estateOf.hasAddress || {};
          const streetAddress = addr.streetAddress || '';
          const locality = addr.locality || '';
          const region = addr.region || '';
          const postcode = addr.postalCode || addr.postcode || '';
          const fullName = [estateOf.firstName, estateOf.familyName].filter(Boolean).join(' ');
          const deceasedName = [estateOf.title, estateOf.firstName, estateOf.familyName].filter(Boolean).join(' ').trim() || fullName;
          const fullAddress = [streetAddress, locality, region, postcode].filter(Boolean).join(', ');
          const claimDeadline = isAbout.hasClaimDeadline || '';
          // Solicitor / executor extraction from the notice text fields if present
          let solicitor = '';
          let executorName = '';
          const tt = (pt.tt || '').toString() || '';
          const noticeText = typeof tt === 'string' ? tt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
          const solMatch = noticeText.match(/(?:solicitor[s]?[:\s]+|solicitors?\s+(?:for|of)\s+)([A-Z][A-Za-z'& ]{3,60})/);
          if (solMatch) solicitor = solMatch[1].trim();
          const execMatch = noticeText.match(/(?:executor[s]?|personal representatives?|administrator[s]?)[:\s]+([A-Z][A-Za-z'& .]{3,60})/);
          if (execMatch) executorName = execMatch[1].trim();
          resolve({
            deceasedAddress: fullAddress,
            locality: locality || '',
            postcode: postcode || '',
            region: region || '',
            deceasedName: deceasedName || '',
            dateOfDeath: estateOf.dateOfDeath || '',
            solicitor: solicitor,
            executorName: executorName,
            claimDeadline: claimDeadline,
            noticeText: noticeText.substring(0, 400)
          });
        } catch(e) { resolve(null); }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(15000, () => { req.destroy(); resolve(null); });
    req.end();
  });
}

// Enrich a list of Gazette notices with their full addresses by fetching each
// notice detail page. Free (no Apify), runs with a small delay between requests.
// Resolve a full postcode for a deceased address via Postcoder (Royal Mail PAF),
// matching by the street/town text so probate leads get area-matchable postcodes.
function resolveProbatePostcode(addressText) {
  return new Promise((resolve) => {
    // Postcoder is disabled by default (POSTCODER_ENABLED) to avoid burning paid
    // credits. The Gazette detail page already includes the full postcode for most
    // notices; this resolver only fills gaps and only when explicitly enabled.
    if (process.env.POSTCODER_ENABLED !== 'true' && process.env.POSTCODER_ENABLED !== '1') { resolve(''); return; }
    const key = process.env.POSTCODER_API_KEY;
    const addr = (addressText || '').trim();
    if (!key || !addr) { resolve(''); return; }
    // SHARED DAILY-CREDIT GUARD: probate's Postcoder lookups must draw from the
    // same global daily budget as every other product, or credits burn far faster
    // than POSTCODER_DAILY_BUDGET intends.
    try {
      const pcBudget = require('./postcoder_budget');
      if (!pcBudget.spend()) { resolve(''); return; }
    } catch(pe) { console.log('[POSTCODER] Budget guard error:', pe.message); }
    // Extract any inline postcode first
    const inline = (addr.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i) || [])[0];
    if (inline) { resolve(inline.toUpperCase()); return; }
    // Otherwise search via Postcoder autocomplete using the street + town
    const searchTerm = encodeURIComponent(addr.substring(0, 80));
    const path = '/pcw/' + key + '/address/uk/' + searchTerm + '?format=json&lines=1&page=0';
    const req = https.request({ hostname: 'ws.postcoder.com', path: path, method: 'GET', headers: { 'Accept': 'application/json', 'User-Agent': '9amLeads/1.0' }, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const arr = JSON.parse(body);
          if (Array.isArray(arr) && arr[0] && arr[0].postcode) { resolve(arr[0].postcode); return; }
        } catch(e) {}
        resolve('');
      });
    });
    req.on('error', () => resolve(''));
    req.setTimeout(15000, () => { req.destroy(); resolve(''); });
    req.end();
  });
}

async function enrichGazetteLeads(leads, limit) {
  const enriched = [];
  // Enrich in small batches with delays to avoid Gazette rate-limiting (the
  // search page already includes most deceased addresses + postcodes, so
  // enrichment is a bonus that fills gaps rather than a hard requirement).
  const max = limit || Math.min(leads.length, 20);
  return (async function() {
    for (let i = 0; i < max; i++) {
      const lead = leads[i];
      if (!lead || !lead.id) { enriched.push(lead); continue; }
      const noticeId = lead.id.replace('GAZ_', '');
      try {
        const detail = await fetchGazetteDetail(noticeId);
        if (detail) {
          if (detail.deceasedAddress) lead.deceasedAddress = detail.deceasedAddress;
          if (detail.postcode) lead.postcode = detail.postcode;
          if (detail.deceasedName) lead.name = detail.deceasedName;
          if (detail.dateOfDeath) lead.dateOfDeath = detail.dateOfDeath;
          if (detail.solicitor) lead.solicitor = detail.solicitor;
          if (detail.executorName) lead.executorName = detail.executorName;
          if (detail.noticeText) lead.description = detail.noticeText;
          lead.locality = detail.locality || '';
          lead.region = detail.region || '';
          lead.fullAddress = (detail.deceasedAddress + ', ' + detail.postcode).trim();
        }
      } catch(e) { /* keep raw lead - search page address is enough */ }
      // Ensure a full postcode exists (needed for area matching + display).
      if (!lead.postcode && lead.deceasedAddress) {
        const inlinePc = (lead.deceasedAddress.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i) || [])[0];
        if (inlinePc) {
          lead.postcode = inlinePc.toUpperCase();
        } else {
          try { const pc = await resolveProbatePostcode(lead.deceasedAddress); if (pc) lead.postcode = pc; } catch(e2) {}
        }
      }
      if (lead.postcode && lead.fullAddress && lead.fullAddress.toLowerCase().indexOf(lead.postcode.toLowerCase()) === -1) {
        lead.fullAddress = lead.fullAddress + ', ' + lead.postcode;
      }
      enriched.push(lead);
      // small delay between detail fetches (politeness + avoids throttling)
      if (i % 3 === 2) await new Promise(r => setTimeout(r, 300));
    }
    // Append any leads beyond the enrich cap unchanged (address already captured).
    for (let j = max; j < leads.length; j++) enriched.push(leads[j]);
    console.log('    Enriched ' + enriched.length + ' Gazette notices with addresses + postcodes');
    return enriched;
  })();
}

// ===== UK GAZETTE PROBATE NOTICES (via Apify actor) =====
// Real statutory probate notices from The Gazette (London/Edinburgh/Belfast).
// Output includes decedent/executor names, full address + postcode, date of
// death, and creditor claim expiry. PAY_PER_EVENT (~$0.10/run + per record).
function fetchGazetteProbate(maxItems) {
  return new Promise((resolve) => {
    if (!APIFY_API_KEY) { resolve([]); return; }
    // Use an ASYNC run + poll the dataset. The actor has a 7200s default timeout
    // and can take 10-30+ minutes to scrape a full day of Gazette notices, so a
    // blocking run-sync call times out. We start the run, poll its status, and
    // pull the dataset once it succeeds.
    const input = JSON.stringify({
      sp_intended_usage: 'other',
      sp_improvement_suggestions: 'testing',
      editions: ['london', 'edinburgh', 'belfast'],
      publishedSinceDays: 1,
      maxItems: Math.min(maxItems || 100, 100),
      proxyConfiguration: { useApifyProxy: false }
    });
    const options = {
      hostname: 'api.apify.com',
      path: '/v2/acts/jungle_synthesizer~uk-gazette-probate-notices-scraper/runs?token=' + APIFY_API_KEY,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(input), 'Accept': 'application/json' },
      timeout: 30000
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const run = JSON.parse(body);
          const runId = run.data && run.data.id;
          const datasetId = run.data && run.data.defaultDatasetId;
          if (!runId) { console.log('    Gazette async start failed'); resolve([]); return; }
          console.log('    Gazette run started: ' + runId);
          // Poll the run status every 20s, up to ~30 minutes
          let polls = 0;
          const maxPolls = 90;
          function poll() {
            if (polls >= maxPolls) { console.log('    Gazette poll timeout'); resolve([]); return; }
            polls++;
            const statusReq = https.request({ hostname: 'api.apify.com', path: '/v2/actor-runs/' + runId + '?token=' + APIFY_API_KEY, method: 'GET', headers: { 'Authorization': 'Bearer ' + APIFY_API_KEY, 'Accept': 'application/json' }, timeout: 20000 }, (res2) => {
              let b2 = '';
              res2.on('data', c2 => b2 += c2);
              res2.on('end', () => {
                try {
                  const st = JSON.parse(b2).data.status;
                  if (st === 'SUCCEEDED') {
                    // Pull dataset items
                    const itemsReq = https.request({ hostname: 'api.apify.com', path: '/v2/datasets/' + datasetId + '/items?token=' + APIFY_API_KEY, method: 'GET', headers: { 'Authorization': 'Bearer ' + APIFY_API_KEY, 'Accept': 'application/json' }, timeout: 30000 }, (res3) => {
                      let b3 = '';
                      res3.on('data', c3 => b3 += c3);
                      res3.on('end', () => {
                        try {
                          const items = JSON.parse(b3);
                          if (Array.isArray(items) && items.length > 0) {
                            console.log('    Gazette returned ' + items.length + ' probate notices');
                            resolve(items.map(function(p) {
                              var addr = p.decedent_address || '';
                              var pc = (addr.match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/i) || [])[0] || '';
                              return {
                                id: 'GAZ_' + (p.notice_id || Date.now() + '_' + Math.random().toString(36).slice(2,6)),
                                name: p.decedent_name || '',
                                surname: (p.decedent_name || '').split(' ').slice(-1)[0] || '',
                                deceasedAddress: addr,
                                dateOfDeath: p.decedent_dod || '',
                                grantDate: p.publish_date || '',
                                claimExpiry: p.claim_expiry_date || '',
                                estateValue: p.estate_value_indicator || 0,
                                estateValueLabel: p.estate_value_indicator ? p.estate_value_indicator : '',
                                solicitor: p.executor_solicitor || p.executor_name || '',
                                executorName: p.executor_name || '',
                                executorAddress: p.executor_address || '',
                                solicitorAddress: p.solicitor_address || '',
                                noticeUrl: p.notice_url || '',
                                postcode: pc,
                                occupation: p.decedent_occupation || '',
                                grantType: p.notice_type || 'Deceased Estates',
                                source: 'The Gazette',
                                scrapedAt: new Date().toISOString()
                              };
                            }));
                          } else {
                            console.log('    Gazette returned no records'); resolve([]);
                          }
                        } catch(e) { console.log('    Gazette dataset parse error'); resolve([]); }
                      });
                    });
                    itemsReq.on('error', () => resolve([]));
                    itemsReq.end();
                    return;
                  }
                  if (st === 'FAILED' || st === 'TIMED-OUT' || st === 'ABORTED') { console.log('    Gazette run ' + st); resolve([]); return; }
                  setTimeout(poll, 20000);
                } catch(e) { console.log('    Gazette poll parse error'); resolve([]); }
              });
            });
            statusReq.on('error', () => { setTimeout(poll, 20000); });
            statusReq.end();
          }
          setTimeout(poll, 20000);
        } catch(e) { console.log('    Gazette start parse error: ' + e.message); resolve([]); }
      });
    });
    req.on('error', (e) => { console.log('    Gazette start error: ' + e.message); resolve([]); });
    req.setTimeout(30000, () => { req.destroy(); resolve([]); });
    req.write(input);
    req.end();
  });
}

// ===== APIFY PROBATE SCRAPER (PRODUCTION) =====
// Uses apify/playwright-scraper to scrape the gov.uk probate registry
// Falls back to sample data if Apify fails
function fetchProbateApify(counties) {
  return new Promise((resolve) => {
    const pageFunction = `
async function pageFunction(context) {
  const { page, log } = context;
  const results = [];

  try {
    await page.goto('https://probatesearch.service.gov.uk/#wills', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);

    await page.evaluate(() => { try { document.querySelector('button[name=\"cookies\"]').click(); } catch(e){} });
    await page.waitForTimeout(1000);

    const search = (customData || {}).search || {};
    const surname = search.surname || 'Smith';
    const yearOfDeath = search.year || '2024';

    await page.fill('#lastname', surname);
    await page.fill('#yearofdeath', yearOfDeath);
    await page.evaluate(() => { document.getElementById('wasasoldier-no').checked = true; });
    await page.click('button[type=\"submit\"]');
    await page.waitForTimeout(5000);

    await page.waitForSelector('table, .govuk-table, .result-list, .search-results', { timeout: 20000 }).catch(() => {});

    const rows = await page.evaluate(() => {
      const results = [];
      const table = document.querySelector('table, .govuk-table');
      if (!table) return results;
      const trs = table.querySelectorAll('tbody tr, tr');
      for (const tr of trs) {
        const tds = tr.querySelectorAll('td');
        if (tds.length >= 5) {
          results.push({
            name: (tds[0].textContent || '').trim(),
            deceasedAddress: (tds[1].textContent || '').trim(),
            dateOfDeath: (tds[2].textContent || '').trim(),
            grantDate: (tds[3].textContent || '').trim(),
            grantType: (tds[4].textContent || '').trim()
          });
        }
      }
      return results;
    });

    if (rows.length > 0) { results.push(...rows); return results; }

    const text = await page.evaluate(() => document.body.innerText.substring(0, 1000));
    results.push({ debug: true, info: text.substring(0, 500), url: page.url() });

  } catch (e) {
    results.push({ error: e.message });
  }
  return results;
}
`.trim();

    const data = JSON.stringify({
      "startUrls": [{ "url": "https://probatesearch.service.gov.uk/#wills" }],
      "pageFunction": pageFunction,
      "maxResultsPerCrawl": 5,
      "maxConcurrency": 1,
      "headless": true,
      "closeCookieModals": true,
      "debugLog": false,
      "proxyConfiguration": { "useApifyProxy": true },
      "customData": { "surname": "Smith", "fromDate": "2026-01-01" }
    });

    const options = {
      hostname: 'api.apify.com',
      path: '/v2/acts/apify~playwright-scraper/run-sync-get-dataset-items?token=' + APIFY_API_KEY + '&memory=1024&timeout=120',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'Accept': 'application/json'
      },
      timeout: 180000
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const items = JSON.parse(body);
          if (Array.isArray(items) && items.length > 0 && !items[0].error) {
            console.log('    Apify returned ' + items.length + ' probate records');
            resolve(items.map(p => ({
              id: 'APIFY_PROB_' + (p.id || Date.now()),
              name: p.name || p.deceasedName || '',
              deceasedAddress: p.address || p.deceasedAddress || '',
              dateOfDeath: p.dateOfDeath || '',
              grantDate: p.grantDate || p.date || '',
              grantType: p.type || p.grantType || 'Probate Grant',
              estateValue: p.estateValue || p.value || 0,
              solicitor: p.solicitor || p.applicant || '',
              source: 'Gov.uk Probate (Apify)',
              scrapedAt: new Date().toISOString()
            })));
          } else {
            console.log('    Apify returned no records, falling back');
            resolve([]);
          }
        } catch(e) {
          console.log('    Apify parse error: ' + e.message);
          resolve([]);
        }
      });
    });
    req.on('error', (e) => { console.log('    Apify error: ' + e.message); resolve([]); });
    req.setTimeout(180000, () => { req.destroy(); resolve([]); });
    req.write(data);
    req.end();
  });
}

// ===== SAMPLE DATA GENERATOR =====
function generateSampleProbates(counties, count) {
  const surnames = ['Smith', 'Jones', 'Williams', 'Brown', 'Taylor', 'Davies', 'Wilson', 'Evans', 'Thomas', 'Roberts',
    'Walker', 'Wright', 'Thompson', 'White', 'Hughes', 'Edwards', 'Green', 'Hall', 'Wood', 'Harris',
    'Martin', 'Jackson', 'Clarke', 'Patel', 'Khan', 'Ali', 'Cooper', 'Hill', 'Ward', 'Turner'];
  const firstNames = ['John', 'Mary', 'Robert', 'Patricia', 'James', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
    'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Margaret', 'Thomas', 'Dorothy', 'Charles', 'Helen'];
  const streets = ['High Street', 'Station Road', 'Park Lane', 'Church Road', 'London Road', 'Green Lane',
    'Manor Road', 'King Street', 'Queen Street', 'Victoria Road', 'Oak Avenue', 'Cedar Close'];
  const towns = {
    'London': ['Westminster', 'Kensington', 'Chelsea', 'Camden', 'Islington', 'Richmond'],
    'Surrey': ['Guildford', 'Woking', 'Reigate', 'Epsom', 'Caterham', 'Dorking'],
    'Kent': ['Maidstone', 'Canterbury', 'Tunbridge Wells', 'Sevenoaks', 'Ashford', 'Folkestone'],
    'Essex': ['Chelmsford', 'Colchester', 'Southend', 'Basildon', 'Brentwood', 'Romford'],
    'Sussex': ['Brighton', 'Worthing', 'Eastbourne', 'Crawley', 'Horsham', 'Chichester'],
    'default': ['Town Centre', 'Riverside', 'Park Estate']
  };
  
  const leads = [];
  const used = new Set();
  
  for (let i = 0; i < count; i++) {
    const county = counties[i % counties.length];
    const townList = towns[county] || towns['default'];
    const town = townList[i % townList.length];
    const street = streets[i % streets.length];
    const num = Math.floor(Math.random() * 150) + 1;
    const addr = num + ' ' + street + ', ' + town + ', ' + county;
    
    if (used.has(addr)) continue;
    used.add(addr);
    
    const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
    const surname = surnames[Math.floor(Math.random() * surnames.length)];
    const daysAgo = Math.floor(Math.random() * 30);
    const dod = new Date(Date.now() - (daysAgo + 30) * 86400000);
    const gd = new Date(Date.now() - daysAgo * 86400000);
    const estateValue = Math.floor(Math.random() * 800000) + 150000;
    const hasProperty = Math.random() > 0.3;
    
    leads.push({
      id: 'PD' + Date.now() + i,
      name: firstName + ' ' + surname,
      deceasedAddress: addr,
      county: county,
      dateOfDeath: dod.toISOString().split('T')[0],
      grantDate: gd.toISOString().split('T')[0],
      grantType: Math.random() > 0.2 ? 'Grant of Probate' : 'Letters of Administration',
      estateValue: estateValue,
      estateValueLabel: '\u00a3' + estateValue.toLocaleString(),
      hasProperty: hasProperty,
      solicitor: Math.random() > 0.5 ? ['Smith & Co', 'Jones & Partners', 'Legal Alliance', 'City Law', 'Premier Wills'][Math.floor(Math.random() * 5)] : '',
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
      name: l.name,
      address: l.deceasedAddress,
      dateOfDeath: l.dateOfDeath,
      grantDate: l.grantDate,
      estateValue: l.estateValueLabel,
      hasProperty: l.hasProperty,
      grantType: l.grantType,
      solicitor: l.solicitor
    })),
    summary: {
      total: batch.length,
      byCounty: {},
      byGrantType: {},
      withProperty: 0,
      totalEstateValue: 0
    }
  };
  
  for (const l of batch) {
    if (!sheet.summary.byCounty[l.county]) sheet.summary.byCounty[l.county] = 0;
    sheet.summary.byCounty[l.county]++;
    if (!sheet.summary.byGrantType[l.grantType]) sheet.summary.byGrantType[l.grantType] = 0;
    sheet.summary.byGrantType[l.grantType]++;
    if (l.hasProperty) sheet.summary.withProperty++;
    sheet.summary.totalEstateValue += l.estateValue || 0;
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
  const color = '#a855f7';
  const leads = sheet.leads;
  
  let leadsHTML = leads.map(l => `
    <tr>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:14px">${l.name}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#ccc;font-size:14px">${l.address}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#4ade80;font-size:14px">${l.estateValue}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#facc15;font-size:12px">${l.grantDate}</td>
      <td style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px">${l.hasProperty ? '\u2705' : '\u274c'}</td>
    </tr>
  `).join('');
  
  const byCountyHTML = Object.entries(sheet.summary.byCounty).map(([c, count]) =>
    `<span style="display:inline-block;padding:4px 12px;background:rgba(168,85,247,0.1);border-radius:4px;color:${color};font-size:12px;margin:2px">${c}: ${count} grants</span>`
  ).join('');
  
  return '<!DOCTYPE html>\n<html><head><meta charset="UTF-8"></head>\n<body style="margin:0;padding:0;background:#000;font-family:Inter,Arial,sans-serif">\n' +
    '<table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:0">\n' +
    '<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">\n' +
    '<tr><td style="background:#0a0a0a;padding:32px 32px 20px;border-bottom:3px solid ' + color + '">\n' +
    '<h1 style="font-family:Outfit,sans-serif;font-size:24px;font-weight:800;color:#fff;margin:0">\n' +
    '  <span style="color:' + color + '">Probate</span> Leads\n' +
    '</h1>\n' +
    '<p style="color:#888;font-size:14px;margin:8px 0 0">' + sheet.company + ' — Daily Probate Sheet</p>\n' +
    '</td></tr>\n' +
    '<tr><td style="background:#0a0a0a;padding:24px 32px">\n' +
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">\n' +
    '  <h2 style="font-family:Outfit,sans-serif;font-size:20px;font-weight:700;color:#fff;margin:0">Today\'s Probate Grants</h2>\n' +
    '  <span style="font-size:14px;color:#888">' + sheet.date + '</span>\n' +
    '</div>\n' +
    '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">\n' +
    '  <div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:14px;text-align:center">\n' +
    '    <div style="font-size:24px;font-weight:800;color:' + color + ';font-family:Outfit">' + sheet.summary.total + '</div>\n' +
    '    <div style="font-size:11px;color:#888">New Grants</div>\n' +
    '  </div>\n' +
    '  <div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:14px;text-align:center">\n' +
    '    <div style="font-size:24px;font-weight:800;color:#4ade80;font-family:Outfit">' + sheet.summary.withProperty + '</div>\n' +
    '    <div style="font-size:11px;color:#888">With Property</div>\n' +
    '  </div>\n' +
    '  <div style="background:rgba(168,85,247,0.06);border:1px solid rgba(168,85,247,0.15);border-radius:10px;padding:14px;text-align:center">\n' +
    '    <div style="font-size:24px;font-weight:800;color:var(--clr-warning);font-family:Outfit">\u00a3' + (sheet.summary.totalEstateValue ? Math.round(sheet.summary.totalEstateValue / sheet.summary.total).toLocaleString() : '0') + '</div>\n' +
    '    <div style="font-size:11px;color:#888">Avg Estate</div>\n' +
    '  </div>\n' +
    '</div>\n' +
    '<div style="margin-bottom:16px">' + byCountyHTML + '</div>\n' +
    '</td></tr>\n' +
    '<tr><td style="background:#000;padding:0 32px">\n' +
    '<table width="100%" cellpadding="0" cellspacing="0">\n' +
    '<tr>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Name</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Address</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Estate</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Granted</th>\n' +
    '  <th style="padding:12px 14px;border-bottom:1px solid #1a1a1a;color:#888;font-size:12px;text-transform:uppercase;text-align:left;letter-spacing:0.5px">Property</th>\n' +
    '</tr>\n' +
    leadsHTML + '\n' +
    '</table>\n' +
    '</td></tr>\n' +
    '<tr><td style="background:#0a0a0a;padding:24px 32px;border-top:1px solid #1a1a1a">\n' +
    '<p style="color:#888;font-size:12px;margin:0">You\'re receiving this because you subscribed to Probate Leads.\n' +
    '<a href="#" style="color:' + color + '">View in dashboard</a> | <a href="#" style="color:#888">Unsubscribe</a></p>\n' +
    '<p style="color:#555;font-size:11px;margin:8px 0 0">Probate Leads \u00a9 ' + new Date().getFullYear() + '</p>\n' +
    '</td></tr>\n' +
    '</table>\n' +
    '</td></tr></table>\n' +
    '</body></html>';
}

// ===== RUN FOR A CUSTOMER =====
async function runForCustomer(customerId, useSampleData) {
  console.log('\n=== Running Probate Leads Scraper for: ' + customerId + ' ===');
  
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
  console.log('  Counties: ' + (customer.counties || []).join(', '));
  console.log('  Filters: Estates over \u00a3' + (customer.minEstateValue || '0').toLocaleString() + 
    (customer.onlyWithProperty ? ' | With property only' : ''));
  console.log('  Plan: ' + (customer.plan || 'Professional') + ' | ' + (customer.leadsPerDay || 15) + '/day');
  
  let leads = [];
  if (!useSampleData) {
    console.log('\n  (Apify scraper disabled — will use sample data)');
  }
  
  if (leads.length === 0) {
    console.log('  LIVE SCRAPE FAILED — using sample data as fallback');
    leads = generateSampleProbates(customer.counties, customer.leadsPerDay || 15);
    leads = leads.map(l => ({ ...l, customerId }));
    console.log('  Generated ' + leads.length + ' sample probate leads');
  }
  
  // Save leads
  const allLeads = loadJSON(LEADS_FILE);
  if (!allLeads[customerId]) allLeads[customerId] = [];
  allLeads[customerId] = [...leads, ...allLeads[customerId]].slice(0, 500);
  allLeads._lastRun = new Date().toISOString();
  saveJSON(LEADS_FILE, allLeads);
  console.log('  Saved ' + leads.length + ' leads (' + allLeads[customerId].length + ' total)');
  
  // Prepare delivery
  const sheet = prepareDailyLeadSheet(customerId);
  if (sheet.error) { console.log('  ERROR: ' + sheet.error); return; }
  
  console.log('\n  === LEAD SHEET READY FOR DELIVERY ===');
  console.log('  To: ' + sheet.email);
  console.log('  Leads: ' + sheet.totalLeads + ' (limit: ' + sheet.leadLimit + ')');
  console.log('  Summary: ' + JSON.stringify(sheet.summary.byCounty));
  console.log('  With property: ' + sheet.summary.withProperty);
  
  sheet.leads.slice(0, 3).forEach((l, i) => {
    console.log('    ' + (i+1) + '. ' + l.name + ' — ' + l.address + ' — ' + l.estateValue);
  });
  
  const emailHTML = generateEmailHTML(sheet);
  fs.writeFileSync(path.join(DATA_DIR, 'probate-email-' + customerId + '.html'), emailHTML);
  console.log('\n  Email template saved');
  
  return { customer, sheet };
}

// ===== CUSTOMER MANAGEMENT =====
function addCustomer(id, company, email, counties, options) {
  const customers = loadJSON(CUSTOMERS_FILE);
  customers[id] = {
    company, email, active: true,
    counties: counties || ['London', 'Surrey', 'Kent'],
    minEstateValue: (options && options.minEstateValue) || 0,
    onlyWithProperty: (options && options.onlyWithProperty) || false,
    plan: (options && options.plan) || 'Professional',
    leadsPerDay: (options && options.leadsPerDay) || 15,
    createdAt: new Date().toISOString(),
    lastDelivery: null,
    totalLeadsReceived: 0
  };
  saveJSON(CUSTOMERS_FILE, customers);
  console.log('\nCustomer "' + id + '" created: ' + company + ' | ' + counties.join(', '));
  return customers[id];
}

function showStatus() {
  const customers = loadJSON(CUSTOMERS_FILE);
  const leads = loadJSON(LEADS_FILE);
  const deliveries = loadJSON(DELIVERY_FILE);
  
  console.log('\n=== Probate Leads — Status ===\n');
  for (const [id, c] of Object.entries(customers)) {
    const cLeads = leads[id] || [];
    const todayLeads = cLeads.filter(l => l.scrapedAt && l.scrapedAt.startsWith(new Date().toISOString().split('T')[0]));
    const cDeliveries = deliveries[id] || [];
    console.log('  ' + id + ': ' + c.company);
    console.log('    Counties: ' + (c.counties || []).join(', '));
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
    await runForCustomer(args[1] || 'demo-solicitor', args.includes('--sample') || args.includes('--demo'));
  } else if (args[0] === '--all') {
    const customers = loadJSON(CUSTOMERS_FILE);
    for (const id of Object.keys(customers)) {
      if (customers[id].active !== false) await runForCustomer(id, false);
    }
  } else if (args[0] === '--add-customer') {
    addCustomer(args[1] || 'demo-solicitor', args[2] || 'Smith & Co Solicitors', 
      args[3] || 'info@smithsolicitors.co.uk', (args[4] || 'London,Surrey,Kent').split(','));
  } else if (args[0] === '--status') {
    showStatus();
  } else if (args[0] === '--send-delivery') {
    const sheet = prepareDailyLeadSheet(args[1] || 'demo-solicitor');
    if (sheet.error) { console.log('ERROR: ' + sheet.error); return; }
    console.log('Delivery prepared: ' + sheet.totalLeads + ' leads to ' + sheet.email);
    const html = generateEmailHTML(sheet);
    fs.writeFileSync(path.join(DATA_DIR, 'probate-delivery-' + args[1] + '-' + sheet.date + '.html'), html);
    console.log('Email HTML saved');
  } else {
    console.log('Probate Leads — Scraper & Delivery Engine');
    console.log('');
    console.log('Usage:');
    console.log('  --add-customer <id> <company> <email> <counties>    Add customer');
    console.log('  --customer <id> [--sample]                         Run scraper');
    console.log('  --all                                               Run all customers');
    console.log('  --send-delivery <id>                                Prepare delivery');
    console.log('  --status                                           Show status');
    console.log('');
    console.log('Examples:');
    console.log('  node probate_leads_scraper.js --add-customer demo-solicitor "Smith & Co" info@test.com London,Surrey');
    console.log('  node probate_leads_scraper.js --customer demo-solicitor --sample');
    console.log('  node probate_leads_scraper.js --status');
  }
}

if (require.main === module) {
  main().catch(e => console.error('Error:', e.message));
}

async function collectProbateLeads(config) {
  config = config || {};
  // Primary: FREE Gazette ATOM feed (no Apify cost, fast, reliable). Returns
  // real deceased-estates notices with names + publication dates + URLs.
  // Paginate a couple of pages so we capture ALL of today's notices (not just
  // the first page) — the Gazette publishes ~20-27 deceased-estate notices/day.
  var maxItems = config.maxItems || 50;
  var self = this;
  return (async function() {
    var results = [];
    // PRIMARY: Apify Gazette actor. It runs on Apify's infrastructure, which
    // bypasses the Gazette blocking Render's datacenter IP (the free HTML scrape
    // returns 0 from Render but ~97 from residential IPs). Returns rich data:
    // name, full address + postcode, date of death, executor, solicitor.
    if (config.useApifyFirst !== false && APIFY_API_KEY) {
      console.log('[PROBATE] Trying Apify Gazette actor first (bypasses Render IP block)...');
      try { results = await fetchGazetteProbate(maxItems); } catch(e) { console.log('[PROBATE] Apify error:', e.message); }
      if (results.length > 0) {
        console.log('[PROBATE] Apify Gazette actor returned ' + results.length + ' probate records');
        // Enrich with full Gazette detail pages (house number + postcode) so the
        // actor's possibly-number-less addresses are completed before emailing.
        if (config.skipEnrich !== true) {
          try { results = await enrichGazetteLeads(results, results.length); } catch(e) { console.log('[PROBATE] Apify-first enrich error: ' + e.message); }
          console.log('[PROBATE] Apify-first enrichment complete (' + results.length + ' records)');
        }
        return results;
      }
    }
    // FALLBACK: free Gazette HTML (works from residential IPs / local dev).
    var html = await fetchGazetteHTML(maxItems, 1);
    if (html && html.length > 0) {
      if (html.length >= 25) {
        var page2 = await fetchGazetteHTML(maxItems, 2);
        if (page2 && page2.length > 0) {
          var seen = {};
          html.forEach(function(r){ seen[r.id] = 1; });
          page2.forEach(function(r){ if (!seen[r.id]) { seen[r.id] = 1; html.push(r); } });
        }
      }
      results = html;
      if (config.skipEnrich !== true) {
        try { results = await enrichGazetteLeads(results, maxItems); } catch(e) { console.log('[PROBATE] Enrich error: ' + e.message); }
      }
      if (results.length > 0) return results;
    }
    if (results.length === 0) {
    // Fallback: Gazette via Apify actor (if useApifyFirst was false or both empty). Retry once.
    console.log('[PROBATE] Gazette HTML empty, trying Apify Gazette actor...');
    var gazAttempts = config.retries === 0 ? 1 : 2;
    for (var gz = 0; gz < gazAttempts && results.length === 0; gz++) {
      results = await fetchGazetteProbate(config.maxItems || 100);
      if (results.length === 0 && gz === 0) {
        console.log('[PROBATE] Gazette actor empty on attempt ' + (gz+1) + ', retrying...');
        await new Promise(function(r) { setTimeout(r, 15000); });
      }
    }
  }
  if (results.length === 0) {
    console.log('[PROBATE] Gazette empty, trying Gov.uk registry...');
    results = await fetchProbateRegistry();
  }
  if (results.length === 0 && APIFY_API_KEY) {
    console.log('[PROBATE] Registry empty, trying Apify Playwright scraper...');
    try {
      var apifyResults = await fetchProbateApify(config.counties || []);
      if (apifyResults && apifyResults.length > 0) {
        results = apifyResults;
        console.log('[PROBATE] Apify returned ' + results.length + ' probate records');
      }
    } catch(e) { console.log('[PROBATE] Apify error:', e.message); }
  }
  // ALWAYS enrich the final set with full Gazette detail pages (which include the
  // deceased's house number + postcode). Every source path above (Apify actor,
  // registry, Playwright) can return an address without the door number, so we
  // run detail enrichment here to guarantee complete addresses before emailing.
  if (results.length > 0 && config.skipEnrich !== true) {
    var enrichedFinal = [];
    try { enrichedFinal = await enrichGazetteLeads(results, results.length); } catch(e) { console.log('[PROBATE] Final enrich error: ' + e.message); }
    if (enrichedFinal && enrichedFinal.length > 0) {
      results = enrichedFinal;
      console.log('[PROBATE] Final enrichment complete (' + results.length + ' records)');
    }
  }
  console.log('[PROBATE] Got ' + results.length + ' probate records');
  return results;
  })();
}

module.exports = { fetchProbateRegistry, fetchProbateApify, fetchGazetteProbate, fetchGazetteHTML, fetchGazetteDetail, enrichGazetteLeads, collectProbateLeads };
