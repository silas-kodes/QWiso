import { NextRequest, NextResponse } from "next/server";
import { COUNTRIES, generateNumber } from "@/lib/generator";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(COUNTRIES.map((c, i) => ({ index: i, name: c.name, dial: c.dial })));
}

export async function POST(req: NextRequest) {
  const { countryIndex, qty = 10, useDial = true, useSpaces = true, localOnly = false } = await req.json();

  if (countryIndex === undefined || !COUNTRIES[countryIndex]) {
    return NextResponse.json({ error: "Invalid country" }, { status: 400 });
  }

  const country = COUNTRIES[countryIndex];
  const maxQty = Math.min(10000, Math.max(1, parseInt(String(qty)) || 10));

  const generated: { raw: string; display: string }[] = [];
  const seen = new Set<string>();
  let attempts = 0;

  while (generated.length < maxQty && attempts < maxQty * 20) {
    attempts++;
    const num = generateNumber(country, useDial, useSpaces, localOnly);
    if (!seen.has(num.raw)) {
      seen.add(num.raw);
      generated.push(num);
    }
  }

  return NextResponse.json({ numbers: generated, country: country.name });
}
