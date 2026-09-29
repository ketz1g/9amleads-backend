# 9amLeads visual system

The public site is built into `9amwebsite/dist/`. The existing HTML files remain source material for reference pages. The shared templates replace the homepage, five lead-type pages and main conversion/support pages at build time.

## Commands

From `9amwebsite`:

```sh
npm ci --include=dev
npm run build
npm run preview
npm run test:site
npm run render:3d
```

Preview: `http://127.0.0.1:4173`. The preview serves public fixtures for the blog and disables live API requests. It uses the existing customer portal HTML for signup checks. Stop the preview before running the browser suite, which starts its own server on that port.

Browser screenshots are saved in the ignored `9amwebsite/test-results/` directory. Set `SITE_SCREENSHOTS` to use another output directory. The test suite uses fictional input and intercepts all API requests, including signup, contact and referral-pack requests.

## Editing the design

- `content.cjs`: product copy, public pricing, daily allowances, FAQs and illustrative sample records.
- `components.cjs`: shared header, footer, buttons, sample cards and pricing cards.
- `pages.cjs`: homepage, product pages and primary conversion templates.
- `support-pages.cjs`: supporting pages and the location-page template.
- `illustrations.cjs`: lightweight SVG fallback artwork.
- `scripts/three/scenes.js` + `scripts/render-3d.cjs`: the real 3D scene definitions (three.js) and the local renderer that outputs `assets/refresh/3d/*.webp` + `.png`. Regenerate with `npm run render:3d` (or `npm run render:3d` with `RENDER_SCENES=morning,moving` to render a subset). The generated images are committed, so the deploy build only copies them and needs no browser or GPU.
- `site.css` / `site.js`: responsive marketing styles and interactions.
- `portal.css` / `portal.js`: customer presentation and the three-step signup enhancement. Existing authentication and targeting code lives in `mission control/portal/index.html`.
- `backend.cjs`: blog index/article rendering, customer-page style injection and an interactive fictional demo.
- `demo.js`: page-local demo interactions, without a demo login or account-state changes.

The catalogue used by browser pricing and signup labels is generated from `content.cjs`. The live billing API remains authoritative for transactions; if the commercial offer changes, update the backend and this public catalogue together.

## Deployment wiring

The root `netlify.toml` installs the website dependencies, builds the public site and publishes `9amwebsite/dist`. The existing API, portal and blog proxies are retained. The generated redirects preserve product/location routes and direct old product pricing/contact/about URLs to their shared replacements.

The backend in `mission control/production_api_server.js` imports `../9amwebsite/site/backend.cjs`. Deploy the repository with both directories available. The backend also serves an explicit allowlist of shared visual assets, so portal and blog pages work on the backend host as well as through Netlify.

Both the Netlify site and the Render backend need a release to enable the entire refresh. Building locally does not publish either service.

## Verification

The browser suite checks desktop/mobile layouts, page errors, main headings, navigation, sample switching, pricing/CTA selection, trade filtering, contact success/error handling, the existing signup payload, demo notes, blog filtering/pagination and public-only output. It also checks that legacy pricing routes reach the current shared offer.

Never start the production API just to preview the design: the preview server avoids production data, mailing jobs and scheduled work.
