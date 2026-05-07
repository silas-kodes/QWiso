"use client";

import { useCallback, useEffect, useState } from "react";
import { 
  MessageCircle, Users, CalendarClock, Clock, Zap, ShieldCheck, 
  Database, LayoutDashboard, LogOut, Play, RefreshCw 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TemplateManager } from "@/components/template-manager";
import { WhatsAppAuth } from "@/components/whatsapp-auth";
import { TaskScheduler } from "@/components/task-scheduler";
import { PhoneForge } from "@/components/phone-forge";
import { LoginComponent } from "@/components/login";
import type { Contact } from "@/lib/excel-parser";
import type { Template } from "@/lib/templates";
import type { AccountId, WhatsAppState } from "@/lib/whatsapp";

// ─── Live clock ───────────────────────────────────────────────────────────────
const CLOCK_TZ = "Asia/Dubai";

function LiveClock() {
  const [time, setTime] = useState("");
  const [date, setDate] = useState("");

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-US", {
        timeZone: CLOCK_TZ, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
      }));
      setDate(now.toLocaleDateString("en-US", {
        timeZone: CLOCK_TZ, weekday: "short", month: "short", day: "numeric",
      }));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-2 shrink-0 bg-black/20 px-3 py-1.5 rounded-lg border border-white/5">
      <Clock className="w-3.5 h-3.5 text-primary" />
      <div className="text-right">
        <p className="font-mono text-sm font-bold leading-tight tracking-tighter text-white">{time}</p>
        <p className="text-[9px] text-muted-foreground uppercase tracking-widest leading-tight">{date}</p>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function Home() {
  const [isAuth, setIsAuth] = useState<boolean | null>(null);
  const [pageTab, setPageTab] = useState<"connect" | "generate" | "validate" | "schedule" | "templates">("connect");
  const [schedulerInitial, setSchedulerInitial] = useState<{ contacts: Contact[]; showCreate: boolean } | null>(null);
  const [waStatuses, setWaStatuses] = useState<Record<AccountId, Pick<WhatsAppState, "status" | "phone">>>({
    "account-1": { status: "disconnected", phone: null },
    "account-2": { status: "disconnected", phone: null },
  });

  // Check auth on mount
  useEffect(() => {
    fetch("/api/auth").then(r => r.json()).then(data => setIsAuth(data.authenticated));
  }, []);

  // Poll account statuses
  useEffect(() => {
    let alive = true;
    const pull = async () => {
      for (const id of ["account-1", "account-2"] as AccountId[]) {
        try {
          const r = await fetch(`/api/whatsapp/${id}/status`);
          const s: WhatsAppState = await r.json();
          if (!alive) return;
          setWaStatuses(prev => ({ ...prev, [id]: { status: s.status, phone: s.phone } }));
        } catch { /* ignore */ }
      }
    };
    pull();
    const t = setInterval(pull, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  // ── Auto-advance when WhatsApp connects ──────────────────────────────────
  useEffect(() => {
    if (pageTab === "connect") {
      const anyConnected = Object.values(waStatuses).some(s => s.status === "connected");
      if (anyConnected) {
        // Optional: wait a moment so user sees the "connected" state
        const timer = setTimeout(() => setPageTab("generate"), 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [waStatuses, pageTab]);

  const [startingAll, setStartingAll] = useState(false);

  const handleStartAll = async () => {
    setStartingAll(true);
    try {
      await fetch("/api/whatsapp/start-all", { method: "POST" });
    } catch (e) {
      console.error(e);
    } finally {
      setStartingAll(false);
    }
  };

  const handleLogout = async () => {
    await fetch("/api/auth", { method: "DELETE" });
    setIsAuth(false);
  };


  if (isAuth === null) return <div className="min-h-screen bg-background flex items-center justify-center font-mono text-primary animate-pulse">BOOTING QWISO...</div>;
  if (isAuth === false) return <LoginComponent onLogin={() => setIsAuth(true)} />;

  const anyAccountConnected = Object.values(waStatuses).some(s => s.status === "connected");

  return (
    <main className="min-h-screen bg-background relative pb-12">
      {/* Top Banner */}
      <div className="bg-primary text-primary-foreground py-1 px-4 text-[10px] font-bold uppercase tracking-[0.3em] flex justify-between items-center">
        <span>Quantum WhatsApp Integrated Scheduler & Optimizer</span>
        <span>Build 4.6.2-Stable</span>
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-card/30 backdrop-blur-xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="p-2.5 rounded-xl bg-primary/10 border border-primary/20 shrink-0">
                <Zap className="w-6 h-6 text-primary fill-primary/20" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tighter text-white">QWISO</h1>
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Unified Control Terminal</p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <LiveClock />
              <button onClick={handleLogout} className="p-2 text-muted-foreground hover:text-destructive transition-colors">
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Navigation - The 5 Steps */}
        <div className="grid grid-cols-5 gap-2 mb-8">
          {[
            { id: "connect", label: "Connect", icon: ShieldCheck },
            { id: "generate", label: "Generate", icon: Database },
            { id: "validate", label: "Validate", icon: Zap },
            { id: "templates", label: "Templates", icon: LayoutDashboard },
            { id: "schedule", label: "Schedule", icon: CalendarClock },
          ].map((step, idx) => {
            const active = pageTab === step.id;
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                onClick={() => setPageTab(step.id as any)}
                className={`group flex flex-col items-center gap-2 p-4 rounded-xl border transition-all duration-300 ${
                  active 
                    ? "bg-primary/10 border-primary text-primary shadow-[0_0_20px_rgba(255,153,0,0.15)]" 
                    : "bg-card/50 border-white/5 text-muted-foreground hover:border-white/20 hover:text-white"
                }`}
              >
                <div className={`p-2 rounded-lg transition-colors ${active ? "bg-primary/20" : "bg-white/5 group-hover:bg-white/10"}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-[9px] uppercase tracking-widest font-bold opacity-50">Step 0{idx + 1}</span>
                  <span className="text-xs font-bold">{step.label}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {pageTab === "connect" && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button 
                  onClick={handleStartAll} 
                  disabled={startingAll}
                  className="btn-glow font-bold uppercase text-[10px] tracking-widest px-6"
                >
                  {startingAll ? (
                    <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Syncing Terminal State…</>
                  ) : (
                    <><Play className="w-3.5 h-3.5 mr-2" />Resume All Linked Sessions</>
                  )}
                </Button>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="p-6 glass-panel space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-primary" />
                    <h3 className="font-bold text-sm uppercase tracking-wider">Primary Account</h3>
                  </div>
                  <WhatsAppAuth accountId="account-1" onSummaryChange={() => {}} />
                </Card>
                <Card className="p-6 glass-panel space-y-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="w-4 h-4 text-accent" />
                    <h3 className="font-bold text-sm uppercase tracking-wider text-accent">Secondary Account</h3>
                  </div>
                  <WhatsAppAuth accountId="account-2" onSummaryChange={() => {}} />
                </Card>
              </div>

              {anyAccountConnected && (
                <div className="flex justify-center pt-4">
                  <Button 
                    variant="outline" 
                    className="btn-glow border-primary/20 text-primary uppercase tracking-widest font-bold px-12 h-12"
                    onClick={() => setPageTab("generate")}
                  >
                    Account Linked - Continue to Step 02 →
                  </Button>
                </div>
              )}
            </div>
          )}


          {pageTab === "generate" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <PhoneForge 
                mode="generate_only"
                accountStatuses={waStatuses} 
                onCreateCampaign={() => setPageTab("validate")} 
              />
              <div className="flex justify-center">
                <Button 
                  variant="outline" 
                  className="btn-glow border-primary/20 text-primary uppercase tracking-widest font-bold px-12 h-12"
                  onClick={() => setPageTab("validate")}
                >
                  Skip to Step 03: Validation →
                </Button>
              </div>
            </div>
          )}

          {pageTab === "validate" && (
            <div className="max-w-2xl mx-auto space-y-6">
              <PhoneForge 
                mode="validate_only"
                accountStatuses={waStatuses} 
                onCreateCampaign={(phones) => {
                  const contacts: Contact[] = phones.map((p, i) => ({
                    phone: "+" + p.replace(/\D/g, ""),
                    rawPhone: p,
                    isValid: true,
                    row: i + 1,
                  }));
                  setSchedulerInitial({ contacts, showCreate: true });
                  setPageTab("schedule");
                }}
              />
              <div className="flex justify-center">
                 <Button 
                  variant="ghost" 
                  className="text-muted-foreground uppercase tracking-widest font-bold text-[10px]"
                  onClick={() => setPageTab("templates")}
                >
                  Manage Messaging Templates →
                </Button>
              </div>
            </div>
          )}

          {pageTab === "templates" && (
            <div className="space-y-6">
              <Card className="p-6 glass-panel">
                <TemplateManager selectedTemplate={null} onSelectTemplate={() => {}} />
              </Card>
              <div className="flex justify-center">
                <Button 
                  variant="outline" 
                  className="btn-glow border-primary/20 text-primary uppercase tracking-widest font-bold px-12 h-12"
                  onClick={() => setPageTab("schedule")}
                >
                  Go to Final Step: Scheduling →
                </Button>
              </div>
            </div>
          )}

          {pageTab === "schedule" && (
            <Card className="p-6 glass-panel">
              <TaskScheduler
                initialContacts={schedulerInitial?.contacts}
                initialShowCreate={schedulerInitial?.showCreate}
              />
            </Card>
          )}
        </div>
      </div>

      {/* Footer Status Bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur-md border-t border-white/5 px-6 py-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground z-50">
        <div className="flex gap-4">
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${waStatuses["account-1"].status === "connected" ? "bg-primary animate-pulse" : "bg-white/10"}`} />
            ACC-01: {waStatuses["account-1"].status}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${waStatuses["account-2"].status === "connected" ? "bg-accent animate-pulse" : "bg-white/10"}`} />
            ACC-02: {waStatuses["account-2"].status}
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <span className="text-primary/50">System Nominal</span>
          <span className="bg-white/5 px-2 py-0.5 rounded text-[8px]">v4.6.2</span>
        </div>
      </footer>
    </main>
  );
}

