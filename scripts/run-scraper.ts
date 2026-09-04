/**
 * Runs every registered scraper, upserts normalized products, and records a
 * ScrapeRun per retailer (spec section 8). This file contains NO
 * retailer-specific logic — that all lives in src/lib/scrapers/<retailer>.ts.
 */
import { PrismaClient, ScrapeMode, ScrapeStatus } from "@prisma/client";
import { caratLaneScraper } from "../src/lib/scrapers/caratlane";
import type { RetailerScraper } from "../src/lib/scrapers/types";
import { calculateEffectivePricePerGram } from "../src/lib/pricing-engine";

const prisma = new PrismaClient();

// Register additional retailer adapters here as they're built (Phase 7).
const SCRAPERS: RetailerScraper[] = [caratLaneScraper];

// Deliberately small for the first few runs — polite to the site and easy
// to sanity-check the results. Raise this once you've confirmed it works.
const MAX_PRODUCTS_PER_CATEGORY = 15;

async function runScraper(scraper: RetailerScraper) {
  const retailer = await prisma.retailer.findUnique({ where: { slug: scraper.retailerSlug } });
  if (!retailer) {
    console.error(`Retailer "${scraper.retailerSlug}" not found — run "npm run db:seed" first.`);
    return;
  }

  const startedAt = new Date();
  let productsFound = 0;
  let productsUpdated = 0;
  let errorMessage: string | undefined;

  try {
    for (const target of scraper.categoryTargets) {
      const category = await prisma.category.findUnique({ where: { name: target.category } });
      if (!category) {
        console.warn(`Category "${target.category}" not seeded, skipping ${target.url}`);
        continue;
      }

      console.log(`[${scraper.retailerName}] scraping category: ${target.url}`);
      const productUrls = (await scraper.scrapeCategory(target.url)).slice(0, MAX_PRODUCTS_PER_CATEGORY);
      console.log(`[${scraper.retailerName}] found ${productUrls.length} product link(s)`);

      for (const url of productUrls) {
        try {
          const normalized = await scraper.scrapeProduct(url, target.category);
          if (!normalized) continue;

          productsFound++;
          const productRow = await prisma.product.upsert({
            where: {
              retailerId_retailerProductId: {
                retailerId: retailer.id,
                retailerProductId: normalized.retailerProductId,
              },
            },
            update: {
              productName: normalized.productName,
              productUrl: normalized.productUrl,
              purity: normalized.purity ?? "unknown",
              netMetalWeight: normalized.netMetalWeight,
              productPrice: normalized.finalPrice,
              finalPrice: normalized.finalPrice,
              weightIncomplete: normalized.netMetalWeight == null,
              dataQualityWarnings: normalized.dataQualityWarnings,
              dataQualityScore: normalized.netMetalWeight != null ? 0.6 : 0.3,
              isExcludedFromComparison: normalized.isExcludedFromComparison,
              exclusionReason: normalized.exclusionReason,
              isDemoData: false,
              lastSeenAt: new Date(),
            },
            create: {
              retailerId: retailer.id,
              retailerProductId: normalized.retailerProductId,
              productName: normalized.productName,
              productUrl: normalized.productUrl,
              categoryId: category.id,
              metal: normalized.metal,
              purity: normalized.purity ?? "unknown",
              netMetalWeight: normalized.netMetalWeight,
              productPrice: normalized.finalPrice,
              finalPrice: normalized.finalPrice,
              weightIncomplete: normalized.netMetalWeight == null,
              dataQualityWarnings: normalized.dataQualityWarnings,
              dataQualityScore: normalized.netMetalWeight != null ? 0.6 : 0.3,
              isExcludedFromComparison: normalized.isExcludedFromComparison,
              exclusionReason: normalized.exclusionReason,
              isDemoData: false,
            },
          });
          productsUpdated++;

          // Capture the product image (spec section 27 — ProductImage is its
          // own table, not a field crammed onto Product).
          if (normalized.imageUrl) {
            const existingPrimary = await prisma.productImage.findFirst({
              where: { productId: productRow.id, isPrimary: true },
            });
            if (!existingPrimary) {
              await prisma.productImage.create({
                data: { productId: productRow.id, imageUrl: normalized.imageUrl, isPrimary: true },
              });
            } else if (existingPrimary.imageUrl !== normalized.imageUrl) {
              await prisma.productImage.update({
                where: { id: existingPrimary.id },
                data: { imageUrl: normalized.imageUrl },
              });
            }
          }

          // Price history (spec section 9) — only write a new snapshot when
          // something actually changed, or when this product has never had
          // one before (its first observation IS a meaningful data point,
          // even if "nothing changed" — there's nothing to compare against).
          const latestSnapshot = await prisma.productPriceSnapshot.findFirst({
            where: { productId: productRow.id },
            orderBy: { recordedAt: "desc" },
          });
          const priceChanged =
            !latestSnapshot || Number(latestSnapshot.finalPrice) !== normalized.finalPrice;

          if (priceChanged) {
            const rate = await prisma.metalRate.findUnique({
              where: { metal_purity: { metal: normalized.metal, purity: normalized.purity ?? "" } },
            });
            await prisma.productPriceSnapshot.create({
              data: {
                productId: productRow.id,
                productPrice: normalized.finalPrice,
                finalPrice: normalized.finalPrice,
                effectivePricePerGram: calculateEffectivePricePerGram(
                  normalized.finalPrice,
                  normalized.netMetalWeight
                ),
                benchmarkRateAtSnapshot: rate ? Number(rate.rate) : null,
                availability: "IN_STOCK",
              },
            });
          }
        } catch (err) {
          console.error(`[${scraper.retailerName}] failed on ${url}:`, err);
        }
      }
    }
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[${scraper.retailerName}] scrape run failed:`, err);
  }

  const finishedAt = new Date();
  const status: ScrapeStatus = errorMessage ? ScrapeStatus.FAILED : productsFound > 0 ? ScrapeStatus.SUCCESS : ScrapeStatus.PARTIAL;

  await prisma.scrapeRun.create({
    data: {
      retailerId: retailer.id,
      mode: ScrapeMode.FULL,
      status,
      startedAt,
      finishedAt,
      productsFound,
      productsUpdated,
      errorMessage,
      durationMs: finishedAt.getTime() - startedAt.getTime(),
    },
  });

  console.log(`[${scraper.retailerName}] done — ${productsFound} product(s), status: ${status}`);
}

async function main() {
  for (const scraper of SCRAPERS) {
    await runScraper(scraper);
  }
}

main()
  .catch((err) => {
    console.error("Scraper run failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
