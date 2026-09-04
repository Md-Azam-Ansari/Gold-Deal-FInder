/**
 * Refreshes MetalRate rows from the live provider. Run directly (not via HTTP),
 * so this is what .github/workflows/update-rates.yml calls on a schedule —
 * same pattern as prisma/seed.ts, and independent of both the Next.js app
 * and the retailer scrapers (spec section 7 & 8).
 */
import { PrismaClient } from "@prisma/client";
import { fetchLiveMetalRates } from "../src/lib/metal-rate-provider";

const prisma = new PrismaClient();

async function main() {
  console.log("Fetching live gold/silver rates...");
  const quotes = await fetchLiveMetalRates();

  await Promise.all(
    quotes.map((q) =>
      prisma.metalRate.upsert({
        where: { metal_purity: { metal: q.metal, purity: q.purity } },
        update: { rate: q.ratePerGram, source: q.source, isDemoData: false },
        create: { metal: q.metal, purity: q.purity, rate: q.ratePerGram, source: q.source, isDemoData: false },
      })
    )
  );

  const rows = await prisma.metalRate.findMany();
  await prisma.metalRateSnapshot.createMany({
    data: rows.map((r) => ({ metalRateId: r.id, rate: r.rate, source: r.source })),
  });

  console.log(`Updated ${quotes.length} rates at ${new Date().toISOString()}`);
}

main()
  .catch((err) => {
    // Deliberately does not touch the DB on failure — old rates (and their
    // now-stale updatedAt) stay as-is rather than being overwritten with
    // fabricated data (spec section 25).
    console.error("Rate refresh failed, existing rates left unchanged:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
