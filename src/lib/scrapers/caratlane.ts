/**
 * CaratLane adapter.
 *
 * Verified by fetching real listing/product pages before writing this:
 *  - Listing pages (e.g. /jewellery/gold-earrings.html) list plain-gold
 *    products with links to individual product pages.
 *  - Product pages carry purity + net metal weight in a clean, predictable
 *    spot: the `og:description` meta tag, formatted like
 *    "Set in 22 KT Yellow Gold(2.420 g)". This is far more reliable than
 *    scraping visible layout, and (being a <meta> tag) survives any
 *    front-end redesign that only touches the visual page.
 *  - Making charge / gross weight / stone weight were NOT found anywhere
 *    accessible on the product page — CaratLane shows a single MRP
 *    ("Inclusive of all taxes") without a granular breakup on these pages.
 *    Those fields are left null and flagged, never guessed (spec section 25).
 *
 * IMPORTANT CAVEAT: this was built by inspecting page content through a
 * tool that may itself execute JavaScript before returning content. If a
 * live run of this scraper (plain `fetch`, no browser) comes back with zero
 * products, the likely cause is that CaratLane needs JS execution to render
 * — in which case this adapter should be rewritten using Playwright instead
 * of Cheerio, per spec section 1 ("Playwright for JS-heavy sites, Cheerio
 * where static HTML parsing is sufficient"). Run it locally first and see.
 */
import * as cheerio from "cheerio";
import { politeFetchText } from "./http";
import { isScrapingAllowed } from "./robots";
import { GOLD_PURITY_FRACTIONS } from "../purity";
import type { CategoryTarget, NormalizedScrapedProduct, ProductCategoryName, RetailerScraper } from "./types";

const BASE_URL = "https://www.caratlane.com";

const CATEGORY_TARGETS: CategoryTarget[] = [
  { url: `${BASE_URL}/jewellery/gold-earrings.html`, category: "EARRING" },
  { url: `${BASE_URL}/jewellery/gold-rings.html`, category: "RING" },
  { url: `${BASE_URL}/jewellery/gold-necklaces.html`, category: "NECKLACE" },
];

// If a product's name contains any of these, it's not plain jewellery —
// exclude it from ranking rather than mis-price it (spec section 3).
const EXCLUDED_KEYWORDS = ["diamond", "gemstone", "ruby", "emerald", "sapphire", "solitaire", "pearl"];

// Product detail URLs end in two hyphen-separated alphanumeric codes that
// each contain a digit (e.g. "-ke06885-2y0000.html"). Category/filter pages
// end in plain words with no digits (e.g. "-gold-earrings.html"). This is a
// heuristic based on today's URL scheme — if CaratLane changes it, this
// regex is the first place to fix.
const PRODUCT_URL_PATTERN = /-[a-z0-9]*\d[a-z0-9]*-[a-z0-9]*\d[a-z0-9]*\.html(?:[?#].*)?$/i;

export const caratLaneScraper: RetailerScraper = {
  retailerSlug: "caratlane",
  retailerName: "CaratLane",
  categoryTargets: CATEGORY_TARGETS,

  async scrapeCategory(categoryUrl: string): Promise<string[]> {
    const path = new URL(categoryUrl).pathname;
    const allowed = await isScrapingAllowed(BASE_URL, path);
    if (!allowed) {
      console.warn(`[caratlane] robots.txt disallows ${path}, skipping`);
      return [];
    }

    const html = await politeFetchText(categoryUrl);
    const $ = cheerio.load(html);

    const urls = new Set<string>();
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href");
      if (!href) return;
      const absolute = href.startsWith("http") ? href : `${BASE_URL}${href.startsWith("/") ? "" : "/"}${href}`;
      if (absolute.startsWith(BASE_URL) && PRODUCT_URL_PATTERN.test(absolute)) {
        urls.add(absolute.split("?")[0].split("#")[0]);
      }
    });

    return Array.from(urls);
  },

  async scrapeProduct(
    productUrl: string,
    category: ProductCategoryName
  ): Promise<NormalizedScrapedProduct | null> {
    const path = new URL(productUrl).pathname;
    const allowed = await isScrapingAllowed(BASE_URL, path);
    if (!allowed) {
      console.warn(`[caratlane] robots.txt disallows ${path}, skipping`);
      return null;
    }

    let html: string;
    try {
      html = await politeFetchText(productUrl);
    } catch (err) {
      console.error(`[caratlane] failed to fetch ${productUrl}:`, err);
      return null;
    }

    const $ = cheerio.load(html);
    const dataQualityWarnings: string[] = [];

    const productName =
      $('meta[property="og:title"]').attr("content")?.trim() || $("h1").first().text().trim();
    if (!productName) {
      console.error(`[caratlane] no product name found at ${productUrl}, skipping`);
      return null;
    }

    const retailerProductId = extractSku(productUrl) ?? productUrl;
    const imageUrl = $('meta[property="og:image"]').attr("content")?.trim() || null;

    // Purity + net weight from og:description, e.g. "Set in 22 KT Yellow Gold(2.420 g)".
    const ogDescription = $('meta[property="og:description"]').attr("content") ?? "";
    const purityMatch = ogDescription.match(/Set in\s+(\d{1,2})\s*KT/i);
    const weightMatch = ogDescription.match(/\(([\d.]+)\s*g\)/i);

    const purity = purityMatch ? `${purityMatch[1]}K` : null;
    const netMetalWeight = weightMatch ? parseFloat(weightMatch[1]) : null;

    if (!purity || !(purity in GOLD_PURITY_FRACTIONS)) {
      dataQualityWarnings.push("Purity uncertain");
    }
    if (netMetalWeight == null) {
      dataQualityWarnings.push("Net weight unavailable", "Cannot reliably calculate ₹/g");
    }
    dataQualityWarnings.push("Making charge unavailable"); // never seen on this site's product pages

    const finalPrice = extractPrice($, html);
    if (finalPrice == null) {
      console.error(`[caratlane] no price found at ${productUrl}, skipping`);
      return null;
    }

    const nameLower = productName.toLowerCase();
    const excludedKeyword = EXCLUDED_KEYWORDS.find((kw) => nameLower.includes(kw));

    return {
      retailerProductId,
      productName,
      productUrl,
      imageUrl,
      metal: "GOLD",
      purity,
      netMetalWeight,
      finalPrice,
      isExcludedFromComparison: Boolean(excludedKeyword),
      exclusionReason: excludedKeyword ? `Product name suggests ${excludedKeyword} content` : null,
      dataQualityWarnings,
    };
  },
};

function extractSku(productUrl: string): string | null {
  // Captures BOTH trailing hyphen segments (e.g. "KE06885-2Y0000"), not just
  // the last one — the last segment alone collides across different products.
  const match = productUrl.match(/-([a-z0-9]*\d[a-z0-9]*-[a-z0-9]*\d[a-z0-9]*)\.html/i);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Tries JSON-LD Product schema first (common, clean, and immune to visual
 * redesigns), then falls back to a text-pattern match for "₹<amount>" as a
 * last resort. Whichever CaratLane actually uses, this is written so a
 * failure of one path doesn't take down the other.
 */
function extractPrice($: cheerio.CheerioAPI, html: string): number | null {
  let jsonLdPrice: number | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdPrice != null) return;
    try {
      const parsed = JSON.parse($(el).contents().text());
      const candidates = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of candidates) {
        const price = item?.offers?.price ?? item?.offers?.[0]?.price;
        if (price != null && !Number.isNaN(Number(price))) {
          jsonLdPrice = Number(price);
        }
      }
    } catch {
      // not valid JSON-LD, ignore and fall through to the text-based match
    }
  });
  if (jsonLdPrice != null) return jsonLdPrice;

  const textMatch = html.match(/₹\s*([\d,]+(?:\.\d+)?)/);
  if (textMatch) {
    const parsed = parseFloat(textMatch[1].replace(/,/g, ""));
    if (!Number.isNaN(parsed)) return parsed;
  }

  return null;
}
