import { db } from "@/lib/db";
import { computePricing, classifyDeal } from "@/lib/pricing-engine";
import { ProductCard } from "@/components/ProductCard";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [rates, products, totalProducts] = await Promise.all([
    db.metalRate.findMany({ orderBy: [{ metal: "asc" }, { purity: "desc" }] }),
    db.product.findMany({
      where: { isExcludedFromComparison: false, isInvestmentProduct: false },
      include: { retailer: true, category: true },
      // Bounded candidate pool, NOT the final page size — ranking by premium
      // % has to happen in JS below since it's a computed value, not a raw
      // DB column. Without fetching a wide-enough pool first, `take` would
      // silently cut off newly-scraped products before they ever got a
      // chance to be ranked (this was a real bug — fixed after Phase 4).
      take: 500,
    }),
    db.product.count(),
  ]);

  const rateFor = (metal: string, purity: string) =>
    rates.find((r) => r.metal === metal && r.purity === purity)?.rate ?? null;

  // Once real scraped products exist, demo data must not compete for ranking
  // spots — a demo product's price was frozen at seed time, so once live
  // benchmark rates move away from the placeholder rate used back then, it
  // can look like an impossible "deal" that isn't real. Demo only serves as
  // a fallback so the dashboard isn't empty before any scraper has run.
  const realProducts = products.filter((p) => !p.isDemoData);
  const rankingPool = realProducts.length > 0 ? realProducts : products;

  const cards = rankingPool
    .map((p) => {
      const benchmarkRatePerGram = rateFor(p.metal, p.purity);
      const pricing = computePricing({
        finalPrice: Number(p.finalPrice),
        makingCharge: p.makingCharge != null ? Number(p.makingCharge) : null,
        netMetalWeight: p.netMetalWeight != null ? Number(p.netMetalWeight) : null,
        benchmarkRatePerGram: benchmarkRatePerGram != null ? Number(benchmarkRatePerGram) : null,
      });
      return {
        product: p,
        pricing,
        classification: classifyDeal(pricing.premiumPercentage, pricing.canCalculate),
      };
    })
    .sort((a, b) => (a.pricing.premiumPercentage ?? 999) - (b.pricing.premiumPercentage ?? 999))
    .slice(0, 8);

  const gold22k = rates.find((r) => r.metal === "GOLD" && r.purity === "22K");
  const silver999 = rates.find((r) => r.metal === "SILVER" && r.purity === "999");
  const anyRateIsDemo = rates.some((r) => r.isDemoData);
  const latestRateUpdate = rates.reduce<Date | null>(
    (latest, r) => (!latest || r.updatedAt > latest ? r.updatedAt : latest),
    null
  );

  return (
    <main className="min-h-screen bg-[#FBF8F2] px-4 py-8 md:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl font-bold text-neutral-900 md:text-3xl">
          Find the best gold &amp; silver jewellery deals.
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Compare real ₹/gram prices across India&apos;s leading online jewellers.
        </p>

        <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="Spot Gold (22K)" value={gold22k ? `₹${Number(gold22k.rate).toLocaleString("en-IN")}/g` : "Rate unavailable"} />
          <StatCard label="Spot Silver (999)" value={silver999 ? `₹${Number(silver999.rate).toLocaleString("en-IN")}/g` : "Rate unavailable"} />
          <StatCard label="Total Products" value={totalProducts.toLocaleString("en-IN")} />
          <StatCard
            label="Rates Last Updated"
            value={latestRateUpdate ? formatRelativeTime(latestRateUpdate) : "Never"}
            isDemo={anyRateIsDemo}
          />
        </div>
        {anyRateIsDemo && (
          <p className="mt-2 text-xs text-amber-600">
            Rates shown are demo seed values — push to GitHub to enable the automatic refresh
            every 6 hours, or trigger it manually now (see README).
          </p>
        )}


        <h2 className="mt-10 text-lg font-semibold text-neutral-900">Best Deals Today</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {cards.map(({ product, pricing, classification }) => (
            <ProductCard
              key={product.id}
              id={product.id}
              retailer={product.retailer.name}
              productName={product.productName}
              netMetalWeight={product.netMetalWeight != null ? Number(product.netMetalWeight) : null}
              purity={product.purity}
              finalPrice={Number(product.finalPrice)}
              effectivePricePerGram={pricing.effectivePricePerGram}
              makingCharge={product.makingCharge != null ? Number(product.makingCharge) : null}
              metalValue={pricing.metalValue}
              premiumPercentage={pricing.premiumPercentage}
              dealClassification={classification}
              productUrl={product.productUrl}
              isDemoData={product.isDemoData}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function StatCard({ label, value, isDemo }: { label: string; value: string; isDemo?: boolean }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-400">{label}</p>
      <p className={`mt-1 text-lg font-bold ${isDemo ? "text-amber-600" : "text-neutral-900"}`}>{value}</p>
    </div>
  );
}

function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
