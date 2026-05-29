import * as fs from "fs";
import * as path from "path";
import type { AccountId } from "@/lib/whatsapp";

// ─── Types ────────────────────────────────────────────────────────────────────

export type TaskStatus = "active" | "paused" | "completed" | "cancelled";

export interface ScheduledContact {
  phone: string;
  sentAt: string | null;   // ISO timestamp or null
  failed: boolean;
}

export interface DayLog {
  day: number;
  date: string;            // ISO date "YYYY-MM-DD"
  sent: number;
  failed: number;
  ranAt: string | null;    // ISO timestamp when batch ran
}

export interface ScheduledTask {
  id: string;
  name: string;
  accountId: AccountId;
  templateContent: string;
  templateName: string;
  contacts: ScheduledContact[];
  batchSize: number;         // contacts per day
  sendTimeHour: number;      // 0-23 local server hour
  sendTimeMinute: number;    // 0-59
  timezone: string;          // e.g. "Asia/Dubai"
  status: TaskStatus;
  createdAt: string;
  nextRunAt: string;         // ISO — when next batch fires
  currentDay: number;        // 1-based day counter
  totalDays: number;
  dayLogs: DayLog[];
  delayMs: number;           // delay between messages within a batch
}

export interface CreateTaskInput {
  name: string;
  accountId: AccountId;
  templateContent: string;
  templateName: string;
  contacts: string[];        // array of phone numbers
  batchSize: number;
  sendTimeHour: number;
  sendTimeMinute: number;
  timezone: string;
  delayMs: number;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const DATA_FILE = path.join(process.cwd(), "scheduled_tasks.json");

function loadTasks(): ScheduledTask[] {
  if (!fs.existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, "utf-8")) as ScheduledTask[];
  } catch { return []; }
}

function saveTasks(tasks: ScheduledTask[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

/**
 * Compute the next UTC timestamp for when hour:minute fires in the given IANA timezone.
 *
 * Strategy: instead of trying to compute offsets manually (which was broken),
 * we binary-search/iterate over "today" and "tomorrow" in the target timezone
 * by formatting candidate UTC times back into the target timezone and comparing.
 */
function nextRunTimestamp(hour: number, minute: number, tz: string): string {
  const now = new Date();

  // Try today and tomorrow in the target timezone
  for (let dayOffset = 0; dayOffset <= 1; dayOffset++) {
    // Get the current date in the target timezone
    const tzNow = new Date(now.getTime() + dayOffset * 86_400_000);

    // Format "YYYY-MM-DD" in the target timezone
    const dateStr = tzNow.toLocaleDateString("en-CA", { timeZone: tz }); // "YYYY-MM-DD"

    // Build the target wall-clock time string in the TZ
    const targetStr = `${dateStr} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00`;

    // Find the UTC instant that corresponds to targetStr in the target TZ.
    // We do this by finding a UTC time T such that T formatted in `tz` == targetStr.
    // Use a reference: parse targetStr as UTC then correct with offset.
    const guessUTC = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00Z`);

    // Format guessUTC in the target timezone and compute the drift
    const guessInTz = guessUTC.toLocaleString("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false,
    });
    // guessInTz looks like "03/22/2025, 07:18:00"
    const guessDate = new Date(guessInTz.replace(/(\d+)\/(\d+)\/(\d+),\s/, "$3-$1-$2T") + "Z");
    const driftMs = guessUTC.getTime() - guessDate.getTime();
    const correctedUTC = new Date(guessUTC.getTime() + driftMs);

    // If this time is still in the future (with a 10-second grace), use it
    if (correctedUTC.getTime() > now.getTime() - 10_000) {
      return correctedUTC.toISOString();
    }
  }

  // Fallback: 24h from now
  return new Date(now.getTime() + 86_400_000).toISOString();
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export function getAllTasks(): ScheduledTask[] {
  return loadTasks();
}

export function getTask(id: string): ScheduledTask | undefined {
  return loadTasks().find(t => t.id === id);
}

export function createTask(input: CreateTaskInput): ScheduledTask {
  const tasks = loadTasks();
  const totalDays = Math.ceil(input.contacts.length / input.batchSize);
  const nextRun = nextRunTimestamp(input.sendTimeHour, input.sendTimeMinute, input.timezone);

  const task: ScheduledTask = {
    id: `task-${Date.now()}`,
    name: input.name,
    accountId: input.accountId,
    templateContent: input.templateContent,
    templateName: input.templateName,
    contacts: input.contacts.map(phone => ({ phone, sentAt: null, failed: false })),
    batchSize: input.batchSize,
    sendTimeHour: input.sendTimeHour,
    sendTimeMinute: input.sendTimeMinute,
    timezone: input.timezone,
    status: "active",
    createdAt: new Date().toISOString(),
    nextRunAt: nextRun,
    currentDay: 1,
    totalDays,
    dayLogs: [],
    delayMs: input.delayMs,
  };

  saveTasks([...tasks, task]);
  console.log(`[Scheduler] Task "${task.name}" created — first run at ${task.nextRunAt} (${new Date(task.nextRunAt).toLocaleString("en-US", { timeZone: input.timezone })} ${input.timezone})`);
  return task;
}

export function updateTask(id: string, patch: Partial<ScheduledTask>): ScheduledTask | null {
  const tasks = loadTasks();
  const idx = tasks.findIndex(t => t.id === id);
  if (idx === -1) return null;
  tasks[idx] = { ...tasks[idx], ...patch };
  saveTasks(tasks);
  return tasks[idx];
}

export function deleteTask(id: string): boolean {
  const tasks = loadTasks();
  const filtered = tasks.filter(t => t.id !== id);
  if (filtered.length === tasks.length) return false;
  saveTasks(filtered);
  return true;
}

export function pauseTask(id: string): ScheduledTask | null {
  return updateTask(id, { status: "paused" });
}

export function resumeTask(id: string): ScheduledTask | null {
  const task = getTask(id);
  if (!task || task.status !== "paused") return null;
  const nextRun = nextRunTimestamp(task.sendTimeHour, task.sendTimeMinute, task.timezone);
  return updateTask(id, { status: "active", nextRunAt: nextRun });
}

// ─── Scheduler engine ─────────────────────────────────────────────────────────

let engineStarted = false;

export function startSchedulerEngine(): void {
  if (engineStarted) return;
  engineStarted = true;
  console.log("[Scheduler] Engine started — checking every 30 seconds");

  // Check immediately on startup, then every 30 seconds
  checkAndRunDueTasks();
  setInterval(checkAndRunDueTasks, 30_000);
}

async function checkAndRunDueTasks(): Promise<void> {
  const tasks = loadTasks();
  const now = new Date();

  for (const task of tasks) {
    if (task.status !== "active") continue;
    if (new Date(task.nextRunAt) > now) continue;

    // This task is due — run it
    console.log(`[Scheduler] Running task "${task.name}" (day ${task.currentDay}/${task.totalDays})`);
    await runTaskBatch(task);
  }
}

async function runTaskBatch(task: ScheduledTask): Promise<void> {
  // Find the next unsent contacts
  const pending = task.contacts.filter(c => !c.sentAt && !c.failed);
  if (pending.length === 0) {
    updateTask(task.id, { status: "completed" });
    console.log(`[Scheduler] Task "${task.name}" completed — all contacts sent`);
    return;
  }

  const batch = pending.slice(0, task.batchSize);
  const today = new Date().toISOString().split("T")[0];
  const ranAt = new Date().toISOString();

  let sent = 0;
  let failed = 0;

  // Dynamically import whatsappManager (server-side only)
  const { whatsappManager } = await import("@/lib/whatsapp");
  const account = whatsappManager.get(task.accountId);

  if (!account.isConnected()) {
    console.warn(`[Scheduler] Task "${task.name}" skipped — account ${task.accountId} not connected`);
    // Reschedule for tomorrow same time
    const nextRun = nextRunTimestamp(task.sendTimeHour, task.sendTimeMinute, task.timezone);
    updateTask(task.id, { nextRunAt: nextRun });
    return;
  }

  // Send to each contact in the batch
  for (const contact of batch) {
    try {
      const success = await account.sendMessage(contact.phone, task.templateContent);
      if (success) {
        contact.sentAt = new Date().toISOString();
        sent++;
      } else {
        contact.failed = true;
        failed++;
      }
    } catch (e) {
      contact.failed = true;
      failed++;
      console.error(`[Scheduler] Failed to send to ${contact.phone}:`, e);
    }

    // Delay between messages
    if (batch.indexOf(contact) < batch.length - 1) {
      await new Promise(r => setTimeout(r, task.delayMs + Math.floor(Math.random() * task.delayMs * 0.3)));
    }
  }

  // Update task state
  const dayLog: DayLog = {
    day: task.currentDay,
    date: today,
    sent,
    failed,
    ranAt,
  };

  const nextDay = task.currentDay + 1;
  const remainingContacts = task.contacts.filter(c => !c.sentAt && !c.failed).length - sent;
  const isComplete = remainingContacts <= 0 || nextDay > task.totalDays;

  const nextRun = isComplete
    ? task.nextRunAt // won't be used
    : nextRunTimestamp(task.sendTimeHour, task.sendTimeMinute, task.timezone);

  updateTask(task.id, {
    contacts: task.contacts,  // updated sentAt/failed flags
    currentDay: nextDay,
    status: isComplete ? "completed" : "active",
    nextRunAt: nextRun,
    dayLogs: [...task.dayLogs, dayLog],
  });

  console.log(`[Scheduler] Task "${task.name}" day ${task.currentDay} done — ${sent} sent, ${failed} failed`);
}
