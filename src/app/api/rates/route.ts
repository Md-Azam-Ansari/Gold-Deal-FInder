import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const rates = await db.metalRate.findMany({ orderBy: [{ metal: "asc" }, { purity: "desc" }] });

  // If a purity has no row at all, the UI must show "Rate unavailable" — never fabricate (spec section 7).
  return NextResponse.json({
    data: rates.map((r) => ({
      metal: r.metal,
      purity: r.purity,
      ratePerGram: r.rate,
      source: r.source,
      isDemoData: r.isDemoData,
      updatedAt: r.updatedAt,
    })),
  });
}
