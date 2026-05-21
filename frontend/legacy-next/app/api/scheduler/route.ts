import { NextRequest, NextResponse } from "next/server";
import { getAllTasks, createTask } from "@/lib/scheduler";
import { startSchedulerEngine } from "@/lib/scheduler";
import type { AccountId } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let started = false;
function ensureEngine() {
  if (started) return;
  started = true;
  startSchedulerEngine();
}

export async function GET() {
  ensureEngine();
  return NextResponse.json(getAllTasks());
}

export async function POST(req: NextRequest) {
  ensureEngine();
  try {
    const body = await req.json();
    const { name, accountId, templateContent, templateName, contacts, batchSize, sendTimeHour, sendTimeMinute, timezone, delayMs } = body;

    if (!name?.trim())            return NextResponse.json({ error: "Task name is required" }, { status: 400 });
    if (!accountId)               return NextResponse.json({ error: "Account is required" }, { status: 400 });
    if (!templateContent?.trim()) return NextResponse.json({ error: "Template is required" }, { status: 400 });
    if (!contacts?.length)        return NextResponse.json({ error: "Contacts are required" }, { status: 400 });
    if (!batchSize || batchSize < 1) return NextResponse.json({ error: "Batch size must be at least 1" }, { status: 400 });
    if (sendTimeHour == null || sendTimeMinute == null) return NextResponse.json({ error: "Send time is required" }, { status: 400 });

    const task = createTask({
      name: name.trim(),
      accountId: accountId as AccountId,
      templateContent,
      templateName: templateName ?? "Custom",
      contacts,
      batchSize: Number(batchSize),
      sendTimeHour: Number(sendTimeHour),
      sendTimeMinute: Number(sendTimeMinute),
      timezone: timezone ?? "UTC",
      delayMs: Number(delayMs ?? 3000),
    });

    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    console.error("Create task error:", e);
    return NextResponse.json({ error: "Failed to create task" }, { status: 500 });
  }
}
