/**
 * DEMO DATA ONLY — every row this script creates is flagged isDemoData: true.
 * Nothing here is a real scraped price. See spec section 35: "Do not fake data."
 */
import { PrismaClient, Metal, ProductCategory, Availability } from "@prisma/client";
import { GOLD_PURITY_FRACTIONS, SILVER_PURITY_FRACTIONS } from "../src/lib/purity";

const prisma = new PrismaClient();

const RETAILERS = [
  { name: "Kalyan Jewellers", slug: "kalyan", websiteUrl: "https://www.kalyanjewellers.net" },
  { name: "Bhima Jewellers", slug: "bhima", websiteUrl: "https://www.bhimagold.com" },
  { name: "Tanishq", slug: "tanishq", websiteUrl: "https://www.tanishq.co.in" },
  { name: "Malabar Gold & Diamonds", slug: "malabar", websiteUrl: "https://www.malabargoldanddiamonds.com" },
  { name: "CaratLane", slug: "caratlane", websiteUrl: "https://www.caratlane.com" },
  { name: "Amazon India", slug: "amazon-in", websiteUrl: "https://www.amazon.in" },
  { name: "Flipkart", slug: "flipkart", websiteUrl: "https://www.flipkart.com" },
  { name: "Mia by Tanishq", slug: "mia", websiteUrl: "https://www.miabytanishq.com" },
  { name: "Joyalukkas", slug: "joyalukkas", websiteUrl: "https://www.joyalukkas.in" },
];

const CATEGORIES: ProductCategory[] = [
  "RING", "CHAIN", "NECKLACE", "BRACELET", "BANGLE", "EARRING",
  "PENDANT", "ANKLET", "NOSE_PIN", "MANGALSUTRA",
];

const GOLD_PURITIES = ["24K", "22K", "20K", "18K", "14K", "9K"];
const SILVER_PURITIES = ["999", "925"];

// Demo benchmark rates (₹/gram) — clearly not live rates.
const DEMO_GOLD_RATES: Record<string, number> = {
  "24K": 10850, "22K": 9940, "20K": 9040, "18K": 8140, "14K": 6340, "9K": 4070,
};
const DEMO_SILVER_RATE = 132; // ₹/gram, 999 fine

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log("Seeding DEMO data (clearly flagged isDemoData: true)...");

  const retailerRows = await Promise.all(
    RETAILERS.map((r) =>
      prisma.retailer.upsert({
        where: { slug: r.slug },
        update: {},
        create: r,
      })
    )
  );

  const categoryRows = await Promise.all(
    CATEGORIES.map((name) =>
      prisma.category.upsert({ where: { name }, update: {}, create: { name } })
    )
  );
  const investmentCategories = await Promise.all(
    (["GOLD_COIN", "GOLD_BAR", "SILVER_COIN", "SILVER_BAR"] as ProductCategory[]).map((name) =>
      prisma.category.upsert({ where: { name }, update: {}, create: { name } })
    )
  );

  // Metal rate benchmarks
  for (const [purity, rate] of Object.entries(DEMO_GOLD_RATES)) {
    await prisma.metalRate.upsert({
      where: { metal_purity: { metal: Metal.GOLD, purity } },
      update: { rate, isDemoData: true, source: "Demo seed" },
      create: { metal: Metal.GOLD, purity, rate, source: "Demo seed", isDemoData: true },
    });
  }
  for (const purity of SILVER_PURITIES) {
    const rate = purity === "999" ? DEMO_SILVER_RATE : DEMO_SILVER_RATE * 0.925;
    await prisma.metalRate.upsert({
      where: { metal_purity: { metal: Metal.SILVER, purity } },
      update: { rate, isDemoData: true, source: "Demo seed" },
      create: { metal: Metal.SILVER, purity, rate, source: "Demo seed", isDemoData: true },
    });
  }

  // Bulk-generate jewellery products: ~90 gold + 45 silver, across retailers/categories/purities.
  let created = 0;
  for (let i = 0; i < 90; i++) created += await createDemoProduct("GOLD", retailerRows, categoryRows);
  for (let i = 0; i < 45; i++) created += await createDemoProduct("SILVER", retailerRows, categoryRows);

  // A handful of explicit edge cases called out in spec section 38.
  await createEdgeCaseProducts(retailerRows, categoryRows);

  // Investment products (coins/bars) — kept separate from jewellery rankings.
  for (let i = 0; i < 10; i++) {
    await createDemoProduct("GOLD", retailerRows, investmentCategories, true);
  }

  console.log(`Seed complete. ${created} standard demo products created, plus edge cases and investment items.`);
}

async function createDemoProduct(
  metal: "GOLD" | "SILVER",
  retailers: { id: string }[],
  categories: { id: string; name: ProductCategory }[],
  isInvestment = false
) {
  const purity = metal === "GOLD" ? pick(GOLD_PURITIES) : pick(SILVER_PURITIES);
  const rate = metal === "GOLD" ? DEMO_GOLD_RATES[purity] : purity === "999" ? DEMO_SILVER_RATE : DEMO_SILVER_RATE * 0.925;
  const netMetalWeight = Math.round(rand(2, 45) * 100) / 100;
  const makingChargePct = rand(6, 22);
  const metalValue = rate * netMetalWeight;
  const makingCharge = Math.round((metalValue * makingChargePct) / 100);
  const gstPct = 3;
  const preTax = metalValue + makingCharge;
  const tax = Math.round(preTax * (gstPct / 100));
  const discount = Math.random() < 0.3 ? Math.round(preTax * rand(0.02, 0.08)) : 0;
  const finalPrice = Math.round(preTax + tax - discount);

  const retailer = pick(retailers);
  const category = pick(categories.filter((c) => (isInvestment ? c.name.includes("_") && (c.name === "GOLD_COIN" || c.name === "GOLD_BAR") : !["GOLD_COIN", "GOLD_BAR", "SILVER_COIN", "SILVER_BAR"].includes(c.name))));

  return prisma.product
    .create({
      data: {
        retailerId: retailer.id,
        retailerProductId: `DEMO-${metal}-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
        productName: `${purity} ${metal === "GOLD" ? "Gold" : "Silver"} ${category.name.replace("_", " ").toLowerCase()}`,
        productUrl: "https://example.com/demo-product",
        categoryId: category.id,
        metal: metal === "GOLD" ? Metal.GOLD : Metal.SILVER,
        purity,
        purityPercentage: Math.round(
          (metal === "GOLD" ? GOLD_PURITY_FRACTIONS[purity] : SILVER_PURITY_FRACTIONS[purity]) * 100 * 100
        ) / 100,
        grossWeight: Math.round((netMetalWeight + rand(0, 1.5)) * 1000) / 1000,
        netMetalWeight,
        stoneWeight: 0,
        makingCharge,
        makingChargePercentage: Math.round(makingChargePct * 100) / 100,
        productPrice: preTax,
        discount,
        tax,
        finalPrice,
        availability: Availability.IN_STOCK,
        isInvestmentProduct: isInvestment,
        dataQualityScore: 0.95,
        isDemoData: true,
      },
    })
    .then(() => 1);
}

async function createEdgeCaseProducts(
  retailers: { id: string }[],
  categories: { id: string; name: ProductCategory }[]
) {
  const retailer = retailers[0];
  const category = categories.find((c) => c.name === "CHAIN")!;

  // 1. Missing net metal weight — must NOT get a fabricated ₹/g.
  await prisma.product.create({
    data: {
      retailerId: retailer.id,
      retailerProductId: "DEMO-EDGE-NO-WEIGHT",
      productName: "22K Gold Chain (weight not disclosed by listing)",
      productUrl: "https://example.com/demo-product",
      categoryId: category.id,
      metal: Metal.GOLD,
      purity: "22K",
      grossWeight: null,
      netMetalWeight: null,
      makingCharge: null,
      productPrice: 65000,
      finalPrice: 65000,
      availability: Availability.IN_STOCK,
      weightIncomplete: true,
      dataQualityWarnings: ["Net weight unavailable", "Cannot reliably calculate ₹/g"],
      dataQualityScore: 0.3,
      isDemoData: true,
    },
  });

  // 2. Gross weight vs net weight distinction (stone weight matters).
  await prisma.product.create({
    data: {
      retailerId: retailer.id,
      retailerProductId: "DEMO-EDGE-STONE-WEIGHT",
      productName: "18K Gold Ring with stone setting (net metal weight only)",
      productUrl: "https://example.com/demo-product",
      categoryId: categories.find((c) => c.name === "RING")!.id,
      metal: Metal.GOLD,
      purity: "18K",
      grossWeight: 5.3,
      netMetalWeight: 5.0,
      stoneWeight: 0.3,
      makingCharge: 4200,
      makingChargePercentage: 10.3,
      productPrice: 40700,
      tax: 1221,
      finalPrice: 41921,
      availability: Availability.IN_STOCK,
      dataQualityScore: 0.9,
      isDemoData: true,
    },
  });

  // 3. Product currently out of stock.
  await prisma.product.create({
    data: {
      retailerId: retailer.id,
      retailerProductId: "DEMO-EDGE-OOS",
      productName: "22K Gold Bangle (currently unavailable)",
      productUrl: "https://example.com/demo-product",
      categoryId: categories.find((c) => c.name === "BANGLE")!.id,
      metal: Metal.GOLD,
      purity: "22K",
      netMetalWeight: 12,
      makingCharge: 6000,
      productPrice: 119280,
      finalPrice: 125280,
      availability: Availability.OUT_OF_STOCK,
      dataQualityScore: 0.85,
      isDemoData: true,
    },
  });

  // 4. Excluded from comparison — diamond jewellery, stones materially affect price.
  await prisma.product.create({
    data: {
      retailerId: retailer.id,
      retailerProductId: "DEMO-EDGE-DIAMOND",
      productName: "18K Gold Diamond Pendant (excluded from ₹/g ranking)",
      productUrl: "https://example.com/demo-product",
      categoryId: categories.find((c) => c.name === "PENDANT")!.id,
      metal: Metal.GOLD,
      purity: "18K",
      netMetalWeight: 2.1,
      stoneWeight: 0.8,
      makingCharge: 3000,
      productPrice: 55000,
      finalPrice: 55000,
      availability: Availability.IN_STOCK,
      isExcludedFromComparison: true,
      exclusionReason: "Diamond jewellery — stone value materially affects price",
      dataQualityScore: 0.7,
      isDemoData: true,
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
