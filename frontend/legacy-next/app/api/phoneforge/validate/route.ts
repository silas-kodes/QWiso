import { NextRequest, NextResponse } from "next/server";
import type { AccountId } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { whatsappManager } = await import("@/lib/whatsapp");
  const { numbers, accountId = "account-1" } = await req.json() as {
    numbers: { raw: string; display: string }[];
    accountId?: AccountId;
  };

  if (!numbers?.length) {
    return NextResponse.json({ error: "No numbers provided" }, { status: 400 });
  }

  const account = whatsappManager.get(accountId as AccountId);
  if (!account.isConnected()) {
    return NextResponse.json({ error: "WhatsApp account not connected" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const push = (data: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      const results: { raw: string; display: string; valid: boolean }[] = [];
      const CONCURRENCY = 4;

      async function processOne(n: { raw: string; display: string }, index: number) {
        const digits = n.raw.replace(/\D/g, "");
        let valid = false;
        try {
          valid = await account.isRegisteredUser(digits);
        } catch {
          valid = false;
        }
        results.push({ ...n, valid });
        push({ type: "progress", index, total: numbers.length, current: results.length, number: n.display, valid });
      }

      let nextIdx = 0;
      async function runWorker() {
        while (true) {
          const idx = nextIdx++;
          if (idx >= numbers.length) return;
          await processOne(numbers[idx], idx);
        }
      }

      const workers = Array.from({ length: Math.min(CONCURRENCY, numbers.length) }, runWorker);
      await Promise.all(workers);

      push({ type: "complete", results });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
