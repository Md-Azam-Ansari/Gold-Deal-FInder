# Gold Deal Finder — Phase 1-3 scaffold

Phases 1-3 from your spec: UI + database schema + pricing engine + demo data +
a live gold/silver rate feed, all running end-to-end. Nothing here talks to a
real retailer yet — that's Phase 4. Every demo product is clearly flagged
`isDemoData: true` per your own "do not fake data" rule; rates switch from
demo to live automatically once you deploy (see below).

## What's included
- `prisma/schema.prisma` — the relational schema (section 27 of your spec)
- `src/lib/pricing-engine.ts` — the only place price math happens (section 5)
- `src/lib/purity.ts` — purity normalization (section 6)
- `src/lib/metal-rate-provider.ts` — fetches live XAU/XAG spot prices in INR
  from gold-api.com (free, no signup, no API key) and expands them into every
  purity the app tracks (section 7)
- `scripts/refresh-rates.ts` — runs the provider and upserts `MetalRate` rows;
  called on a schedule by `.github/workflows/update-rates.yml` (every 6 hours,
  free on GitHub Actions)
- `src/app/api/admin/refresh-rates/route.ts` — same refresh, triggerable
  manually/on-demand (e.g. right after you deploy)
- `src/lib/scrapers/` — `types.ts` (the `RetailerScraper` contract),
  `robots.ts` (robots.txt compliance, checked at runtime), `http.ts`
  (throttled fetch with retries), `caratlane.ts` (first retailer adapter)
- `scripts/run-scraper.ts` — orchestrates any registered scraper, upserts
  products, records a `ScrapeRun`; called by `.github/workflows/scrape.yml`
- `prisma/seed.ts` — ~145 generated demo products + explicit edge cases (missing
  weight, gross-vs-net weight, out-of-stock, excluded diamond product)
- `src/app/page.tsx` + `src/components/ProductCard.tsx` — dashboard + product card
- `src/app/api/products/route.ts`, `src/app/api/rates/route.ts` — paginated APIs
- `.github/workflows/scrape.yml` — placeholder cron job for Phase 4 scrapers

## Run it locally (all free)

1. **Install Node.js 20+** from nodejs.org if you don't have it.
2. **Get a free Postgres database** at https://neon.tech — create a project,
   copy the connection string.
3. In this folder:
   ```bash
   cp .env.example .env
   # paste your Neon connection string into DATABASE_URL in .env
   # make up any random string for ADMIN_REFRESH_SECRET in .env
   npm install
   npx prisma migrate dev --name init
   npm run db:seed
   npm run dev
   ```
4. Open http://localhost:3000 — you should see the dashboard with demo products
   and demo rates.

## Going live with rates

Rates start as demo data from the seed script. Two ways to switch to live gold/silver prices, and you'll usually want both:

- **Automatic, every 6 hours:** once you push this repo to GitHub, add a
  repository secret named `DATABASE_URL` (Settings → Secrets and variables →
  Actions) with your Neon connection string. `.github/workflows/update-rates.yml`
  will then run `npm run rates:update` on its own schedule — no signup with any
  rate provider needed.
- **On-demand:** visit `/api/admin/refresh-rates?secret=YOUR_ADMIN_REFRESH_SECRET`
  (locally or on your deployed URL) any time you want an immediate refresh
  instead of waiting for the next scheduled run.

If the live fetch ever fails, existing rates are left untouched rather than
overwritten with something fabricated — you'd just see their "last updated"
time go stale, which is the honest signal something needs attention.

## Price history

Every product now has its own page at `/products/<id>` (click any product
name/image on the dashboard) with:
- current price, effective ₹/g, metal value, making charge, premium %
- a price history chart with 30D / 90D / 6M / 1Y / ALL range tabs
- lowest / highest / average / current stats, and a "current price is X%
  below/above its N-day average" line — only shown once there are at least
  2 data points in the selected range

A snapshot (`ProductPriceSnapshot`) is written by `scripts/run-scraper.ts`
whenever a product's price changes, or on its very first scrape (a
baseline). Unchanged prices on a later scrape don't create duplicate rows —
so the chart fills in genuinely over the next several scheduled scraper
runs, not all at once. A freshly-scraped product will show "not enough
price history yet" until it's been scraped at least twice.

## Deploying (still free)

- Push this folder to a new GitHub repo.
- Import the repo on https://vercel.com (free Hobby plan) — it deploys on every push.
- Add `DATABASE_URL` and `ADMIN_REFRESH_SECRET` as environment variables in the
  Vercel project settings.
- Scrapers (Phase 4 onward) and rate updates both run via GitHub Actions, not
  on Vercel — Vercel's function timeout is too short for a Playwright scraping
  run, and GitHub Actions can run more often than Vercel's free Cron allows.

## Build order (matches your original spec, section 36)

1. ✅ UI + database + mock data
2. ✅ Pricing normalization engine
3. ✅ Live metal-rate provider
4. ✅ One retailer scraper end-to-end — CaratLane (gold earrings, rings,
   necklaces). See "Running the scraper" below.
5. ✅ Price-history system — `ProductPriceSnapshot` rows are now written on
   every scrape (only when price actually changes, or on a product's first
   observation). Each product has its own detail page with a price chart.
   See "Price history" below.
6. Deal scoring refinements (the `Deal` model + `classifyDeal`/`calculateDealScore`
   are stubbed in; tune thresholds once real data exists)
7. Remaining retailer adapters (Kalyan, Bhima, Tanishq, Malabar, Amazon,
   Flipkart, Mia, Joyalukkas)
8. Alerts
9. Analytics
10. Performance and reliability

## Running the scraper

```bash
npm run scrape
```

This runs `scripts/run-scraper.ts`, which currently registers one adapter:
`src/lib/scrapers/caratlane.ts`. It:
- checks `robots.txt` before touching each page (refuses to scrape if it
  can't verify permission — see `src/lib/scrapers/robots.ts`),
- throttles requests with retries/backoff (`src/lib/scrapers/http.ts`),
- scrapes gold earrings, rings, and necklaces (15 products per category on
  first runs — raise `MAX_PRODUCTS_PER_CATEGORY` in the script once you've
  confirmed it works),
- pulls purity + net metal weight from a `<meta property="og:description">`
  tag CaratLane's product pages carry (verified against live pages before
  writing this), rather than guessing from visual layout,
- leaves making charge as unavailable — CaratLane's product pages don't
  expose a granular price breakup, so this is flagged, not fabricated,
- records a `ScrapeRun` row either way, so you can see what happened.

**Built with Cheerio, not Playwright** — CaratLane's pages turned out to be
server-rendered. If a real run comes back with 0 products, the likely cause
is that the site actually needs JavaScript to render, and this adapter
should be switched to Playwright instead (per spec section 1). Run it
locally first (`npm run scrape`) and check the console output before
relying on the scheduled GitHub Action.

Product listings shown on the dashboard are Phase 1 demo data until you run
the scraper — after that, real CaratLane products (flagged `isDemoData: false`)
mix in alongside them.

