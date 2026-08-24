# Public Notice Portal (PNP) Apify Actor — Build Spec

**For:** 9amLeads probate supply
**Source:** https://www.publicnoticeportal.uk
**Purpose:** Collect "Probate and Trustee" public notices published in local/regional UK newspapers. Supplements The Gazette (Section 27 notices). Some notices overlap with Gazette records — these are deduplicated. Others are additional probate leads.
**Estimated yield:** ~20–60 additional unique, verified probate leads/day UK-wide after Gazette dedup.

---

## 1. Why a custom actor is required

The Public Notice Portal is a **React single-page application** (client-side rendered). A plain HTTP scraper cannot read the notice list or detail pages — the data is loaded via JavaScript. This requires a headless-browser actor (Apify `playwright` / `puppeteer` crawler with a real browser context).

## 2. The PNP site

- Home / search: `https://www.publicnoticeportal.uk/`
- Categories are rendered client-side. The relevant category is **"Probate and Trustee"** (publication category used by local newspapers for deceased-estate / trust notices).
- Each notice detail page shows:
  - Publication date
  - Notice text (may include the deceased's name, address, executor/solicitor, claim deadline)
  - The publishing newspaper / publication
  - Region / town

## 3. Actor behaviour

### 3.1 Input
```json
{
  "categories": ["Probate and Trustee"],
  "regions": ["All UK"],
  "searchFromDaysAgo": 2,
  "maxItems": 500
}
```

### 3.2 Flow
1. Launch browser (headless Chromium, `stealth: true` to avoid bot detection).
2. Open `https://www.publicnoticeportal.uk/`.
3. Navigate to the **Probate and Trustee** category (via the UI — do not assume a URL slug; click through the rendered category list).
4. Optionally filter by region if the UI exposes one (default: all UK).
5. Wait for the notice list to render. Scroll + paginate through **today's + yesterday's** notices.
6. Open each notice detail page and extract the fields below.
7. Respect `robots.txt` and rate-limit to ~1 request / 1.5s. Run in the `STANDARD` Apify plan with `maxConcurrency: 2`.
8. Handle JS-rendered content with `waitUntil: 'networkidle'` + a fixed post-render wait.

### 3.3 Output dataset schema (one record per notice)
```json
{
  "noticeId": "pnp-123456",
  "title": "Probate and Trustee notice",
  "publication": "Bristol Post",
  "region": "Bristol / South West",
  "publishedDate": "2026-08-24T00:00:00.000Z",
  "claimDeadline": "2026-10-24T00:00:00.000Z",
  "deceasedName": "Mary Smith",
  "deceasedAddress": "14 High Street, Bristol, BS1 3AB",
  "deceasedPostcode": "BS1 3AB",
  "executorName": "Jane Smith",
  "solicitorName": "Smith & Co Solicitors",
  "solicitorAddress": "1 Legal Lane, Bristol, BS1 4CD",
  "noticeText": "Full original notice text",
  "noticeUrl": "https://www.publicnoticeportal.uk/notice/...",
  "scrapedAt": "2026-08-24T06:00:00.000Z"
}
```

### 3.4 Extraction rules
- **deceasedName**: parse the notice text for the deceased. Common patterns: "Re: [Name], deceased", "In the estate of [Name]", "[Name] (deceased)". Fall back to the notice title.
- **deceasedAddress / postcode**: the notice usually states the deceased's last known address. Extract the address block + postcode if present. Some notices give only a postcode or town — capture whatever exists.
- **executor / solicitor**: extract separately from the "enquiries to" / "executor" / "solicitor" block.
- **claimDeadline**: capture the "by [date]" / "within 2 months" deadline; normalise to ISO date. If only a relative deadline ("within 2 months of [publication date]"), compute the date.
- **noticeText**: store the full cleaned text.

## 4. Dedup & handoff

- The 9amLeads backend deduplicates against Gazette records by `deceasedName + postcode` (or `deceasedName + solicitor`) before merging into the probate pool.
- Return **only genuinely new notices** — dedup on the actor side too (track seen `deceasedName|postcode` hashes) to keep output clean and cheap.
- The actor should expose a **last-crawl timestamp** input so daily runs only pull notices newer than the previous run (avoids re-scraping).

## 5. Scheduling

- Run **twice daily**:
  - 07:30 UK (before the 09:00 delivery; supplements the 06:00 Gazette scrape)
  - 18:00 UK (captures afternoon publications for next morning)
- Actor runtime budget: `timeout: 180s`, `memory: 1024MB`.

## 6. Acceptance criteria
- Pulls **today's + yesterday's** Probate and Trustee notices UK-wide.
- Extracts deceased name + postcode/address on the majority of notices (>60%).
- Extracts executor/solicitor separately where present.
- Output is deduplicated (no duplicate notice URLs; no duplicate name+postcode within the run).
- Completes a full run in < 3 minutes.
- Respects the site's rate limits (no 429s / blocks).

## 7. Integration endpoint (9amLeads)
Backend exposes: `POST /api/admin/pnp-scrape` — accepts the actor's output (array of notice records), merges into the probate pool with source `pnp`, dedupes against Gazette, tags confirmed probate, and makes them available to the 09:00 delivery.
