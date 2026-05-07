import { NextResponse } from "next/server";
import { startAllAccounts } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    await startAllAccounts();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to start accounts" }, { status: 500 });
  }
}
