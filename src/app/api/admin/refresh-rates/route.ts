import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { fetchLiveMetalRates } from "@/lib/metal-rate-provider";

export const dynamic = "force-dynamic";

/**
 * Manual/on-demand rate refresh — useful right after deploying, or while
 * testing locally with `npm run dev`, so you don't have to wait for the
 * scheduled GitHub Actions run (.github/workflows/update-rates.yml, every
 * 6 hours) to see live data.
 *
 * GET /api/admin/refresh-rates?secret=<ADMIN_REFRESH_SECRET>
 *
 * On failure, existing MetalRate rows are left untouched — their `updatedAt`
 * timestamp simply goes stale, which the dashboard surfaces honestly rather
 * than silently showing a wrong "live" number (spec section 7 & 25).
 */
export async function GET(req: NextRequest) {
  const providedSecret = req.nextUrl.searchParams.get("secret");
  const isAuthorized = Boolean(process.env.ADMIN_REFRESH_SECRET) && providedSecret === process.env.ADMIN_REFRESH_SECRET;

  if (!isAuthorized) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const quotes = await fetchLiveMetalRates();

    await Promise.all(
      quotes.map((q) =>
        db.metalRate.upsert({
          where: { metal_purity: { metal: q.metal, purity: q.purity } },
          update: { rate: q.ratePerGram, source: q.source, isDemoData: false },
          create: { metal: q.metal, purity: q.purity, rate: q.ratePerGram, source: q.source, isDemoData: false },
        })
      )
    );

    const rows = await db.metalRate.findMany();
    await db.metalRateSnapshot.createMany({
      data: rows.map((r) => ({ metalRateId: r.id, rate: r.rate, source: r.source })),
    });

    return NextResponse.json({ ok: true, updated: quotes.length, at: new Date().toISOString() });
  } catch (err) {
    console.error("Rate refresh failed:", err);
    return NextResponse.json(
      { ok: false, error: "Live rate fetch failed — existing rates left unchanged" },
      { status: 502 }
    );
  }
}
