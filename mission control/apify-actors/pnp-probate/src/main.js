// PNP Probate & Trustee Notices — Apify Playwright actor
// ========================================================
// Collects "Probate & Trustee" notices from the UK Public Notice Portal
// (https://www.publicnoticeportal.uk/probate-and-trustee) and outputs them as
// structured probate leads. Runs in a headless Chromium browser because the
// notice list is rendered client-side (React Server Components).
//
// Input (JSON):
//   {
//     "searchFromDaysAgo": 2,     // pull notices newer than this (default 2)
//     "maxItems": 500,            // stop after this many notices (default 500)
//     "maxPages": 20              // pagination cap (default 20)
//   }
//
// Output dataset (one record per notice):
//   noticeId, title, publication, region, publishedDate, claimDeadline,
//   deceasedName, deceasedAddress, deceasedPostcode, executorName,
//   solicitorName, solicitorAddress, noticeText, noticeUrl, scrapedAt
//
// Run twice daily (07:30 + 18:00 UK). Output feeds 9amLeads
// POST /api/admin/pnp-scrape (which dedupes against Gazette records).
import { Actor } from 'apify';
import { chromium } from '@crawlee/playwright';

// Small delay to be polite + avoid bot detection
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Normalise a UK postcode ("M11 4WE", "m114we" -> "M11 4WE")
function cleanUkPostcode(raw) {
  const m = String(raw || '').toUpperCase().match(/[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2}/);
  if (!m) return '';
  const c = m[0].replace(/[^A-Z0-9]/g, '');
  return c.slice(0, c.length - 3) + ' ' + c.slice(-3);
}

// The deceased is usually the notice subject. Fall back to the page title.
function extractDeceasedName(title, text) {
  if (!text) return title;
  const re = /(?:Re:\s*)?([A-Z][A-Za-z'.\- ]{2,60})(?:,\s*(?:deceased|deceased|late of|of))/i;
  const m = text.match(re);
  if (m) return m[1].trim().replace(/\s+/g, ' ').replace(/\s+deceased\s*$/i, '');
  // "In the estate of <Name>, deceased"
  const m2 = text.match(/(?:in the estate of|estate of)\s+([A-Z][A-Za-z'.\- ]{2,60}),?\s+deceased/i);
  if (m2) return m2[1].trim();
  return title;
}

// Extract the deceased's address + postcode from the notice text.
function extractDeceasedAddress(text, fallbackPostcode) {
  let postcode = cleanUkPostcode(text) || fallbackPostcode;
  let address = '';
  // "of <Address>, <Postcode>" or "lately of <Address>"
  const addrRe = /(?:of|lately of|residing at|formerly of)\s+([A-Za-z0-9][A-Za-z0-9'.,\- ]{5,90}?)\s*,?\s*(?:,?\s*[A-Z]{1,2}[0-9][A-Z0-9]?\s?[0-9][A-Z]{2})?/i;
  const m = text.match(addrRe);
  if (m) address = m[1].trim().replace(/,\s*,/g, ',');
  return { address, postcode };
}

// Executor / solicitor from the notice text.
function extractExecutorSolicitor(text) {
  let executorName = '', solicitorName = '', solicitorAddress = '';
  const ex = text.match(/(?:executor[s]?|personal representatives?)[^:]{0,4}[:.]?\s*([A-Z][A-Za-z'.\- ]{2,50})/i);
  if (ex) executorName = ex[1].trim();
  const sol = text.match(/(?:solicitor[s]?|solicitors? for the estate)[^:]{0,4}[:.]?\s*([A-Z][A-Za-z'&.\- ]{2,60})/i);
  if (sol) solicitorName = sol[1].trim();
  // "enquiries to <Firm>, <street>, <town>, <postcode>" block
  const enq = text.match(/(?:enquiries|claims?)[^:]{0,4}[:.]?\s*([A-Z][A-Za-z0-9'.,&\- ]{3,90})/i);
  if (enq) solicitorAddress = enq[1].trim();
  return { executorName, solicitorName, solicitorAddress };
}

// Claim deadline: absolute date or "within N months of publication".
function parseClaimDeadline(text, publishedDate) {
  const abs = text.match(/(?:before|by|on)\s+(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})/i);
  if (abs) {
    const d = new Date(abs[1]);
    if (!isNaN(d)) return d.toISOString();
  }
  const rel = text.match(/within\s+(\d+)\s+months?/i);
  if (rel && publishedDate) {
    const d = new Date(publishedDate);
    d.setMonth(d.getMonth() + parseInt(rel[1], 10));
    return d.toISOString();
  }
  return '';
}

// Open a notice detail page and extract everything.
async function extractNotice(page, url) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
  await sleep(1200);
  const data = await page.evaluate(() => {
    const text = (document.body.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
    const title = (document.querySelector('h1, h2, [class*="title"], [class*="heading"]')?.innerText || document.title || '').trim();
    const pub = (document.querySelector('[class*="publication"], [class*="source"], [class*="paper"]')?.innerText || '').trim();
    const region = (document.querySelector('[class*="region"], [class*="location"], [class*="area"]')?.innerText || '').trim();
    const url = location.href;
    return { text, title, pub, region, url };
  });
  const deceasedName = extractDeceasedName(data.title, data.text);
  const { address, postcode } = extractDeceasedAddress(data.text, '');
  const { executorName, solicitorName, solicitorAddress } = extractExecutorSolicitor(data.text);
  const pubDateMatch = data.text.match(/\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i);
  const publishedDate = pubDateMatch ? new Date(pubDateMatch[0]).toISOString() : new Date().toISOString();
  return {
    noticeId: 'pnp-' + (data.url.match(/(\d+)[\/]?$/)?.[1] || data.url.split('/').filter(Boolean).slice(-1)[0] || Date.now()),
    title: data.title || deceasedName || 'Probate notice',
    publication: data.pub,
    region: data.region,
    publishedDate,
    claimDeadline: parseClaimDeadline(data.text, publishedDate),
    deceasedName,
    deceasedAddress: address,
    deceasedPostcode: postcode,
    executorName,
    solicitorName,
    solicitorAddress,
    noticeText: data.text.substring(0, 3000),
    noticeUrl: data.url,
    scrapedAt: new Date().toISOString(),
  };
}

await Actor.init();

const input = await Actor.getInput() || {};
const searchFromDaysAgo = input.searchFromDaysAgo || 2;
const maxItems = input.maxItems || 500;
const maxPages = input.maxPages || 20;

const startUrl = 'https://www.publicnoticeportal.uk/probate-and-trustee';
const cutoff = new Date(Date.now() - searchFromDaysAgo * 86400000);

const browser = await chromium.launch({ headless: true, stealth: true });
const page = await browser.newPage();
await page.setExtraHTTPHeaders({ 'Accept-Language': 'en-GB,en;q=0.9' });

await page.goto(startUrl, { waitUntil: 'networkidle', timeout: 40000 });
await sleep(2500);

const results = [];
const seenUrls = new Set();
let pageNo = 0;

// Collect notice detail links from the rendered list (scroll to load + paginate).
for (let p = 0; p < maxPages && results.length < maxItems; p++) {
  pageNo = p + 1;
  // Scroll to bottom a few times to trigger lazy load
  for (let s = 0; s < 4; s++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(900);
  }
  const hrefs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('a[href*="notice"], a[href*="/p/"]')).map(a => a.href)
  );
  for (const h of hrefs) {
    if (seenUrls.has(h)) continue;
    seenUrls.add(h);
    if (results.length >= maxItems) break;
    try {
      const rec = await extractNotice(page, h);
      if (rec.deceasedName || rec.noticeText) results.push(rec);
      Actor.console.info(`[PNP] ${results.length}: ${rec.deceasedName || rec.title}`);
    } catch (e) {
      Actor.console.warn('[PNP] detail error: ' + e.message);
    }
  }
  // Try the "next page" control
  const next = await page.$('a[rel="next"], [aria-label="Next"], [class*="next"][href]');
  if (!next) break;
  await page.click('a[rel="next"], [aria-label="Next"], [class*="next"][href]');
  await sleep(1800);
}

// Filter to notices published within the requested window (best-effort; if no date
// is parseable we keep the record — the backend freshness gate handles it).
const fresh = results.filter((r) => {
  if (!r.publishedDate) return true;
  return new Date(r.publishedDate) >= cutoff;
});

await Actor.pushData(fresh);
await browser.close();

Actor.console.info(`[PNP] collected ${fresh.length} notices (${results.length} seen) across ${pageNo} page(s)`);
await Actor.exit();
