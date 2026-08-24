# Probate Supply — Next Actions Checklist

Two actions unlock probate at scale. Everything else is already live.

---

## Action 1: Deploy the PNP Apify actor (~30-60 min)
**Result:** +20-60 verified probate leads/day (supplement to Gazette)

| # | Step | Details |
|---|---|---|
| 1 | Open Apify Console | https://console.apify.com/actors (login with the Apify account keyed to `APIFY_API_KEY`) |
| 2 | Create new actor | "Create new actor" → choose **Playwright** template (browser rendering is required — the portal is a React app) |
| 3 | Paste the code | Open `mission control/apify-actors/pnp-probate/src/main.js` and paste into the actor's main file (`src/main.js`) |
| 4 | Copy `package.json` | Ensure `apify` + `@crawlee/playwright` are in the actor's dependencies (or let Apify install from `package.json`) |
| 5 | Build | Apify auto-builds on save. Confirm it builds with no errors |
| 6 | Test run | Click "Run" — a test input `{ "searchFromDaysAgo": 2, "maxItems": 20 }`. Confirm output dataset has probate notices with names + addresses |
| 7 | Wire the webhook | In the actor → **Webhooks** → add: `POST https://nineamleads-backend.onrender.com/api/admin/pnp-scrape` with header `Authorization: Bearer <ADMIN_PASSWORD>` and the default payload (the actor's dataset items arrive as `leads`) |
| 8 | Schedule | Actor → **Schedules** → 07:30 UK and 18:00 UK. Then a test POST to `/api/admin/pnp-scrape` (with the sample `{leads:[...]}`) to confirm `added: N` — the endpoint is live and tested |
| 9 | Verify in pool | `GET /api/admin/pool-sample?product=probate` — new `source: pnp` leads appear; they deliver at 09:00 like Gazette |

---

## Action 2: Send the HMCTS bulk-access enquiry (today)
**Result:** +450-600 usable probate leads/day if approved

| # | Step | Details |
|---|---|---|
| 1 | Open the draft | `mission control/docs/hmcts-bulk-probate-enquiry.md` |
| 2 | Find the right contact | Go to the probate records search site (gov.uk probate search / Find-Will) → use its **Contact** route, or email the HMCTS probate / data-access team. The public search won't sell bulk data — the formal enquiry route is needed |
| 3 | Send the email | Copy the draft, add your name/company, send |
| 4 | Track the answers | The 7 questions matter most: daily files, **full deceased address included?**, cost model, **commercial redistribution permitted?**, latency (14-day delay?), E&W vs Scotland/NI, application process |
| 5 | When approved | Share the agreement + sample file with the founder/dev — the `pnp-scrape` pattern is reused to build `POST /api/admin/hmcts-scrape` (same merge + dedup + delivery) |

---

## What's already done & live (no action needed)
- ✅ Gazette probate scrape (06:00 daily) — ~18-27/day
- ✅ Early-estate (funeral notices) — separate pre-probate source, excluded from confirmed probate
- ✅ `POST /api/admin/pnp-scrape` ingest endpoint — built, deployed, tested
- ✅ Probate delivery: county-wide auto-expansion + 14-day backfill freshness + exact-count
- ✅ Delivery system: door numbers, full postcode, real links, test isolation, 09:00 UK email+dashboard

---

## Expected combined volume
| Stage | Confirmed probate leads/day (UK-wide) |
|---|---|
| Now (Gazette only) | ~18-27 |
| + PNP actor | ~40-85 |
| + HMCTS bulk | ~450-600 |

After cleaning (dedup, incomplete addresses, overseas): **~400-600 strong postcode-matched probate leads/day**.
