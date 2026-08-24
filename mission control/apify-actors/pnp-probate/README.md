# Public Notice Portal — Probate & Trustee Notices

Apify Playwright actor that collects "Probate & Trustee" notices from the UK Public Notice Portal and outputs them as structured probate leads for 9amLeads.

## Why a browser is required
The portal is a Next.js app (React Server Components). The notice list is rendered client-side, so a plain HTTP scraper cannot read it. This actor runs a headless stealth Chromium to render + paginate.

## Input
```json
{
  "searchFromDaysAgo": 2,
  "maxItems": 500,
  "maxPages": 20
}
```

## Output dataset
```json
{
  "noticeId": "pnp-...",
  "title": "...",
  "publication": "Bristol Post",
  "region": "...",
  "publishedDate": "ISO",
  "claimDeadline": "ISO",
  "deceasedName": "...",
  "deceasedAddress": "...",
  "deceasedPostcode": "LS6 3NJ",
  "executorName": "...",
  "solicitorName": "...",
  "solicitorAddress": "...",
  "noticeText": "...",
  "noticeUrl": "...",
  "scrapedAt": "ISO"
}
```

## Deployment (Apify Console)
1. Create a new actor → choose "Python/Node with Playwright" (or import this folder).
2. Set the main file to `src/main.js` and the build command to `npm install`.
3. Select the **STANDARD** plan (browser rendering required).
4. Run manually to test, then schedule:
   - 07:30 UK (supplements the 06:00 Gazette scrape)
   - 18:00 UK (afternoon publications)

## Handoff to 9amLeads
Point the actor's **webhook** at the ingest endpoint. It accepts the raw Apify webhook payload directly (no custom formatting needed):

```
POST https://nineamleads-backend.onrender.com/api/admin/pnp-scrape
Authorization: Bearer <ADMIN_PASSWORD>
Content-Type: application/json
```

The endpoint accepts all of these payload shapes automatically:
- Apify webhook default (`{ resource: { defaultDatasetId }, ... }` — it fetches the dataset items from the Apify API using `APIFY_API_KEY`)
- `{ items: [ ... ] }`
- `{ leads: [ ... ] }`
- a raw `[ ... ]` dataset array

The backend merges them into the probate pool (source `pnp`), dedupes against Gazette records by name+postcode, and makes them available to the 09:00 delivery.

## Notes / caveats
- Not all notices carry a full deceased address — many give only a postcode or town. Those are still added (PAF can resolve a full address from postcode + name).
- The actor extracts the deceased from the notice text using standard probate phrasings; the backend re-parses and PAF-verifies at delivery.
- Rate-limited to ~1 detail page / 1.5s to avoid bot detection.
