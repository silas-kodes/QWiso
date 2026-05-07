"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarClock, Plus, Pause, Play, Trash2, ChevronDown,
  ChevronUp, Clock, Users, CheckCircle, XCircle, AlertCircle,
  Calendar, RefreshCw, X, Wifi, WifiOff, Smartphone, MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { ScheduledTask, TaskStatus } from "@/lib/scheduler";
import type { Contact } from "@/lib/excel-parser";
import type { Template } from "@/lib/templates";
import type { AccountId, WhatsAppState } from "@/lib/whatsapp";
import { ExcelUploader } from "@/components/excel-uploader";
import { TemplateManager } from "@/components/template-manager";

// ── Common timezones ──────────────────────────────────────────────────────────
const TIMEZONES = [
  "Asia/Dubai", "Asia/Riyadh", "Asia/Kuwait", "Asia/Bahrain", "Asia/Qatar",
  "Asia/Muscat", "Asia/Karachi", "Asia/Kolkata", "Asia/Dhaka", "Asia/Bangkok",
  "Asia/Singapore", "Asia/Tokyo", "Europe/London", "Europe/Paris",
  "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
  "UTC",
];

const DELAY_OPTIONS = [
  { label: "Fast (~1s)",   value: 1000 },
  { label: "Normal (~3s)", value: 3000 },
  { label: "Slow (~5s)",   value: 5000 },
  { label: "Safe (~8s)",   value: 8000 },
];

const STATUS_CONFIG: Record<TaskStatus, { label: string; color: string; bg: string }> = {
  active:    { label: "Active",    color: "text-primary",          bg: "bg-primary/10 border-primary/20" },
  paused:    { label: "Paused",    color: "text-amber-500",        bg: "bg-amber-500/10 border-amber-500/20" },
  completed: { label: "Completed", color: "text-emerald-500",      bg: "bg-emerald-500/10 border-emerald-500/20" },
  cancelled: { label: "Cancelled", color: "text-muted-foreground", bg: "bg-muted/30 border-border" },
};

// ── Hook: fetch both account statuses ─────────────────────────────────────────
function useAccountStatuses() {
  const [statuses, setStatuses] = useState<Record<AccountId, WhatsAppState>>({
    "account-1": { status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: null },
    "account-2": { status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: null },
  });

  useEffect(() => {
    const fetch2 = async () => {
      for (const id of ["account-1", "account-2"] as AccountId[]) {
        try {
          const r = await fetch(`/api/whatsapp/${id}/status`);
          const s: WhatsAppState = await r.json();
          setStatuses(prev => ({ ...prev, [id]: s }));
        } catch { /* ignore */ }
      }
    };
    fetch2();
    const t = setInterval(fetch2, 5000);
    return () => clearInterval(t);
  }, []);

  return statuses;
}

// ── Account picker with connection status ────────────────────────────────────
// ── Account picker with connection status ────────────────────────────────────
function AccountPicker({ value, onChange }: { value: AccountId; onChange: (a: AccountId) => void }) {
  const statuses = useAccountStatuses();

  return (
    <div className="grid grid-cols-2 gap-3">
      {(["account-1", "account-2"] as AccountId[]).map(a => {
        const s = statuses[a];
        const isConnected = s.status === "connected";
        const isConnecting = ["connecting", "qr_ready", "pairing"].includes(s.status);
        const selected = value === a;

        return (
          <button
            key={a}
            onClick={() => onChange(a)}
            className={`rounded-xl border-2 px-4 py-4 text-left transition-all duration-300 ${
              selected
                ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(255,153,0,0.1)]"
                : "border-white/5 bg-black/40 hover:border-white/20"
            }`}
          >
            <div className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${selected ? "text-primary" : "text-muted-foreground"}`}>
              {a === "account-1" ? "Primary Terminal" : "Secondary Terminal"}
            </div>
            {isConnected ? (
              <div className="flex items-center gap-2">
                <Wifi className="w-3.5 h-3.5 text-primary" />
                <span className="text-white font-bold font-mono text-xs">
                  {s.phone ? `+${s.phone}` : "CONNECTED"}
                </span>
              </div>
            ) : isConnecting ? (
              <div className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span className="text-amber-500 font-bold text-[10px] uppercase tracking-widest">Syncing…</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <WifiOff className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-muted-foreground font-bold text-[10px] uppercase tracking-widest">Offline</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Create task form ──────────────────────────────────────────────────────────
interface CreateFormProps {
  onCreated: () => void;
  onCancel: () => void;
  initialContacts?: Contact[];
}

function CreateTaskForm({ onCreated, onCancel, initialContacts }: CreateFormProps) {
  const [step, setStep] = useState<"contacts" | "template" | "settings">(initialContacts ? "template" : "contacts");
  const [contacts, setContacts] = useState<Contact[]>(initialContacts || []);
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [accountId, setAccountId] = useState<AccountId>("account-1");
  const [batchSize, setBatchSize] = useState(20);
  const [sendHour, setSendHour] = useState(9);
  const [sendMinute, setSendMinute] = useState(0);
  const [timezone, setTimezone] = useState("Asia/Dubai");
  const [delayMs, setDelayMs] = useState(3000);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const validContacts = contacts.filter(c => c.isValid);
  const totalDays = batchSize > 0 ? Math.ceil(validContacts.length / batchSize) : 0;

  const handleCreate = async () => {
    if (!name.trim()) { setError("Please enter a task name"); return; }
    if (!template)    { setError("Please select a template"); return; }
    if (validContacts.length === 0) { setError("No valid contacts loaded"); return; }

    setSaving(true); setError("");
    try {
      const res = await fetch("/api/scheduler", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          accountId,
          templateContent: template.content,
          templateName: template.name,
          contacts: validContacts.map(c => c.phone),
          batchSize,
          sendTimeHour: sendHour,
          sendTimeMinute: sendMinute,
          timezone,
          delayMs,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        setError(d.error ?? "Failed to create task");
      } else {
        onCreated();
      }
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <Card className="p-6 glass-panel border-primary/20 shadow-[0_0_40px_rgba(255,153,0,0.05)]">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-lg">Mission Config</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-muted-foreground hover:text-white rounded-full">
           <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Step tabs */}
      <div className="flex rounded-xl bg-black/60 p-1 gap-1 mb-8 border border-white/5">
        {(["contacts", "template", "settings"] as const).map((s, i) => {
           const active = step === s;
           const past = (step === "template" && s === "contacts") || (step === "settings" && (s === "contacts" || s === "template"));
           return (
              <button key={s} onClick={() => setStep(s)}
                className={`flex-1 rounded-lg px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-all duration-300 ${
                  active ? "bg-primary text-primary-foreground shadow-lg" : past ? "text-primary/70 hover:text-primary" : "text-muted-foreground hover:text-white"
                }`}>
                0{i + 1} {s}
              </button>
           );
        })}
      </div>

      {/* Step 1: Contacts */}
      {step === "contacts" && (
        <div className="space-y-4">
          <ExcelUploader onContactsLoaded={setContacts} contacts={contacts} />
          {validContacts.length > 0 && (
            <Button className="w-full btn-glow font-bold h-12" onClick={() => setStep("template")}>
              PROCEED WITH {validContacts.length} CONTACTS →
            </Button>
          )}
        </div>
      )}

      {/* Step 2: Template */}
      {step === "template" && (
        <div className="space-y-4">
          <TemplateManager selectedTemplate={template} onSelectTemplate={setTemplate} />
          {template && (
            <Button className="w-full btn-glow font-bold h-12" onClick={() => setStep("settings")}>
              {/* eslint-disable-next-line react/no-unescaped-entities */}
              USE "{template.name.toUpperCase()}" →
            </Button>
          )}
        </div>
      )}

      {/* Step 3: Settings */}
      {step === "settings" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Campaign Identifier</label>
                <Input placeholder="e.g. Dubai Property Campaign" value={name} onChange={e => setName(e.target.value)} className="bg-black/40 border-white/10 font-bold" />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Transmitting Terminal</label>
                <AccountPicker value={accountId} onChange={setAccountId} />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Daily Batch Size</label>
                <Input type="number" min={1} max={validContacts.length} value={batchSize}
                  onChange={e => setBatchSize(Math.max(1, parseInt(e.target.value) || 1))} className="bg-black/40 border-white/10 font-mono text-center text-lg" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mt-2">
                  Timeline: <span className="text-white">{totalDays} Execution Day{totalDays !== 1 ? "s" : ""}</span>
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Execution Window</label>
                <div className="flex gap-2 items-center">
                  <Input type="number" min={0} max={23} value={sendHour}
                    onChange={e => setSendHour(Math.min(23, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="bg-black/40 border-white/10 font-mono text-center text-xl h-12" placeholder="HH" />
                  <span className="text-primary font-black text-xl animate-pulse">:</span>
                  <Input type="number" min={0} max={59} value={sendMinute}
                    onChange={e => setSendMinute(Math.min(59, Math.max(0, parseInt(e.target.value) || 0)))}
                    className="bg-black/40 border-white/10 font-mono text-center text-xl h-12" placeholder="MM" />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary">System Timezone</label>
                <select value={timezone} onChange={e => setTimezone(e.target.value)}
                  className="w-full appearance-none rounded-md border border-white/10 bg-black/40 px-4 py-2.5 text-xs font-bold focus:border-primary outline-none">
                  {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Pulse Interval</label>
                <div className="grid grid-cols-2 gap-2">
                  {DELAY_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => setDelayMs(o.value)}
                      className={`rounded-lg border px-3 py-2 text-[10px] font-bold uppercase tracking-widest transition-all ${
                        delayMs === o.value ? "border-primary bg-primary/20 text-primary" : "border-white/5 bg-black/40 text-muted-foreground hover:border-white/20"
                      }`}>
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 text-[11px] font-medium leading-relaxed text-muted-foreground space-y-1">
             <div className="flex justify-between">
               <span>TRANSFERS:</span>
               <span className="text-white font-bold">{validContacts.length} TOTAL CONTACTS</span>
             </div>
             <div className="flex justify-between">
               <span>FREQUENCY:</span>
               <span className="text-white font-bold">{batchSize} / DAY @ {String(sendHour).padStart(2, "0")}:{String(sendMinute).padStart(2, "0")}</span>
             </div>
             <div className="flex justify-between">
               <span>TEMPLATE:</span>
               <span className="text-white font-bold">{template?.name.toUpperCase()}</span>
             </div>
          </div>

          {error && <p className="text-xs text-destructive font-bold text-center uppercase tracking-widest">{error}</p>}

          <Button className="w-full btn-glow h-14 font-black uppercase tracking-[0.2em]" onClick={handleCreate} disabled={saving}>
            {saving
              ? <><RefreshCw className="w-5 h-5 mr-3 animate-spin" />INITIALIZING MISSION…</>
              : <><CalendarClock className="w-5 h-5 mr-3" />COMMENCE SCHEDULE</>}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ── Task card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onRefresh }: { task: ScheduledTask; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [acting, setActing] = useState(false);
  const statuses = useAccountStatuses();

  const cfg = STATUS_CONFIG[task.status];
  const totalSent = task.contacts.filter(c => c.sentAt).length;
  const totalFailed = task.contacts.filter(c => c.failed).length;
  const totalContacts = task.contacts.length;
  const pct = totalContacts > 0 ? Math.round((totalSent / totalContacts) * 100) : 0;

  const accountStatus = statuses[task.accountId];
  const accountLabel = task.accountId === "account-1" ? "Primary" : "Secondary";
  const isConnected = accountStatus?.status === "connected";

  const nextRun = task.status === "active"
    ? new Date(task.nextRunAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : null;

  const action = async (a: "pause" | "resume" | "cancel") => {
    setActing(true);
    await fetch(`/api/scheduler/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: a }),
    });
    onRefresh();
    setActing(false);
  };

  const handleDelete = async () => {
    await fetch(`/api/scheduler/${task.id}`, { method: "DELETE" });
    onRefresh();
  };

  return (
    <Card className={`p-5 glass-panel border backdrop-blur-xl transition-all duration-500 hover:shadow-[0_0_30px_rgba(255,153,0,0.05)] ${cfg.bg}`}>
      {/* Header row */}
      <div className="flex items-start gap-4">
        <div className="p-3 rounded-xl bg-black/40 border border-white/5">
           <CalendarClock className={`w-6 h-6 ${cfg.color}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-black text-base tracking-tight uppercase">{task.name}</span>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              {isConnected
                ? <><Wifi className="w-3 h-3 text-primary" /><span className="text-white">{accountLabel} TERMINAL</span></>
                : <><WifiOff className="w-3 h-3 text-destructive" /><span>OFFLINE</span></>
              }
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Users className="w-3 h-3" />{task.contacts.length} TARGETS
            </span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Calendar className="w-3 h-3" />PROGRESS: {Math.min(task.currentDay, task.totalDays)}/{task.totalDays}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {task.status === "active" && (
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-black/40 border-white/10 hover:border-primary" onClick={() => action("pause")} disabled={acting}>
              <Pause className="w-4 h-4" />
            </Button>
          )}
          {task.status === "paused" && (
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-black/40 border-white/10 hover:border-primary" onClick={() => action("resume")} disabled={acting}>
              <Play className="w-4 h-4" />
            </Button>
          )}
          {(task.status === "active" || task.status === "paused") && (
            <Button variant="outline" size="icon" className="h-9 w-9 rounded-xl bg-black/40 border-white/10 hover:border-destructive hover:text-destructive" onClick={() => action("cancel")} disabled={acting}>
              <X className="w-4 h-4" />
            </Button>
          )}
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)}>
            <Trash2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-white/5" onClick={() => setExpanded(e => !e)}>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-5 space-y-2">
        <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest">
          <span className="text-muted-foreground">
            <span className="text-primary font-black">{totalSent}</span> SUCCESSFUL ·{" "}
            <span className="text-destructive font-black">{totalFailed}</span> REJECTED ·{" "}
            {totalContacts - totalSent - totalFailed} QUEUED
          </span>
          <span className="text-white font-mono">{pct}% COMPLETE</span>
        </div>
        <Progress value={pct} className="h-2 bg-black/40" />
      </div>

      {/* Status line */}
      {nextRun && (
        <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
             <Clock className="w-3.5 h-3.5 text-primary" />
             NEXT TRANSMISSION: <span className="text-white">{nextRun}</span>
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-primary">
             BATCH: {task.batchSize}
          </div>
        </div>
      )}

      {/* Expanded: day logs */}
      {expanded && (
        <div className="mt-5 pt-5 border-t border-white/5 space-y-4">
          <div className="flex items-center justify-between">
             <p className="text-[10px] font-black uppercase tracking-[0.2em] text-primary">MISSION LOGS</p>
             <p className="text-[10px] font-bold text-muted-foreground">{task.timezone}</p>
          </div>
          {task.dayLogs.length === 0 ? (
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/40 py-2">Waiting for first execution cycle...</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {task.dayLogs.map(log => (
                <div key={log.day} className="flex items-center justify-between rounded-xl bg-black/40 border border-white/5 px-4 py-3">
                  <div className="space-y-0.5">
                    <div className="text-[9px] font-black uppercase tracking-widest text-primary">CYCLE 0{log.day}</div>
                    <div className="text-[10px] font-bold text-muted-foreground">{log.date}</div>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-bold font-mono">
                    <span className="text-primary flex items-center gap-1">+{log.sent}</span>
                    {log.failed > 0 && <span className="text-destructive flex items-center gap-1">-{log.failed}</span>}
                    <span className="text-white/40">
                      {log.ranAt ? new Date(log.ranAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : "—"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Template preview */}
          <div className="rounded-2xl bg-[#005c4b]/20 border border-emerald-500/10 p-4 space-y-2">
            <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-400">
               <MessageSquare className="w-3.5 h-3.5" />
               SIGNAL PAYLOAD: {task.templateName.toUpperCase()}
            </div>
            <p className="text-xs text-white/80 whitespace-pre-wrap leading-relaxed font-medium line-clamp-6">{task.templateContent}</p>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent className="glass-panel border-destructive/20">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-black uppercase tracking-tight">TERMINATE MISSION?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs font-medium text-muted-foreground uppercase tracking-widest leading-relaxed">
              Permanent deletion requested for &quot;<strong className="text-white">{task.name}</strong>&quot;. This action will purge all sequence data and cannot be recovered.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-white/5 border-white/10 font-bold uppercase text-[10px] tracking-widest">Abort</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive hover:bg-destructive/90 font-black uppercase text-[10px] tracking-widest" onClick={handleDelete}>CONFIRM TERMINATION</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function TaskScheduler({ initialContacts, initialShowCreate }: { initialContacts?: Contact[]; initialShowCreate?: boolean }) {
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [showCreate, setShowCreate] = useState(initialShowCreate || false);
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      const r = await fetch("/api/scheduler");
      const data = await r.json();
      setTasks(Array.isArray(data) ? data : []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchTasks();
    intervalRef.current = setInterval(fetchTasks, 15_000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchTasks]);

  const activeTasks    = tasks.filter(t => t.status === "active");
  const pausedTasks    = tasks.filter(t => t.status === "paused");
  const completedTasks = tasks.filter(t => t.status === "completed" || t.status === "cancelled");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
            <CalendarClock className="w-5 h-5 text-primary" />
          </div>
          <div className="flex flex-col">
            <span className="font-black text-sm uppercase tracking-[0.1em]">Mission Control</span>
            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Automated Transmission Streams</span>
          </div>
          {activeTasks.length > 0 && (
            <span className="ml-2 rounded-full bg-primary text-primary-foreground text-[9px] font-black px-2 py-0.5 uppercase tracking-widest animate-pulse">
              {activeTasks.length} Live
            </span>
          )}
        </div>
        {!showCreate && (
          <Button size="sm" className="btn-glow font-bold uppercase text-[10px] tracking-widest h-10 px-6" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />Initialize Mission
          </Button>
        )}
      </div>

      {/* Create form */}
      {showCreate && (
        <CreateTaskForm
          onCreated={() => { setShowCreate(false); fetchTasks(); }}
          onCancel={() => setShowCreate(false)}
          initialContacts={initialContacts}
        />
      )}

      {/* Empty state */}
      {!loading && tasks.length === 0 && !showCreate && (
        <div className="py-20 glass-panel border-dashed border-white/10 rounded-3xl flex flex-col items-center gap-6 text-center">
          <div className="relative">
             <CalendarClock className="w-16 h-16 text-white/5" />
             <Plus className="absolute -bottom-2 -right-2 w-8 h-8 text-primary/40" />
          </div>
          <div className="space-y-2">
            <p className="font-black text-lg uppercase tracking-tight">No Active Missions</p>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest max-w-sm px-6 leading-relaxed">
              Initialize your first automated transmission sequence to begin batch message processing.
            </p>
          </div>
          <Button className="btn-glow font-black uppercase text-[10px] tracking-widest h-12 px-8" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-2" />Request First Link
          </Button>
        </div>
      )}

      {activeTasks.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary ml-1">Live Sequences</p>
          <div className="space-y-4">
            {activeTasks.map(t => <TaskCard key={t.id} task={t} onRefresh={fetchTasks} />)}
          </div>
        </div>
      )}

      {pausedTasks.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-amber-500 ml-1">Suspended Missions</p>
          <div className="space-y-4">
            {pausedTasks.map(t => <TaskCard key={t.id} task={t} onRefresh={fetchTasks} />)}
          </div>
        </div>
      )}

      {completedTasks.length > 0 && (
        <div className="space-y-3">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground ml-1">Archived Cycles</p>
          <div className="space-y-4">
            {completedTasks.map(t => <TaskCard key={t.id} task={t} onRefresh={fetchTasks} />)}
          </div>
        </div>
      )}
    </div>
  );
}
