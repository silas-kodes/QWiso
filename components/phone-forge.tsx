"use client";

import { useState, useRef, useCallback } from "react";
import {
  Zap, CheckCircle2, XCircle, RefreshCw, Copy, Download,
  ChevronDown, Play, Wifi, WifiOff, Send, Database, ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { COUNTRIES } from "@/lib/generator";
import type { AccountId } from "@/lib/whatsapp";

interface GeneratedNumber {
  raw: string;
  display: string;
}

interface ValidatedNumber extends GeneratedNumber {
  valid: boolean;
}

type Phase = "idle" | "generating" | "generated" | "validating" | "done";

interface Props {
  /** Currently-connected account statuses — pass from parent */
  accountStatuses: Record<AccountId, { status: string; phone: string | null }>;
  /** Called when user wants to create a campaign from valid numbers */
  onCreateCampaign?: (phones: string[]) => void;
}

export function PhoneForge({ accountStatuses, onCreateCampaign, mode = "both" }: { 
  accountStatuses: Record<AccountId, { status: string; phone: string | null }>;
  onCreateCampaign?: (phones: string[]) => void;
  mode?: "both" | "generate_only" | "validate_only";
}) {
  const [countryIndex, setCountryIndex] = useState(0);
  const [qty, setQty] = useState(100);
  const [useDial, setUseDial] = useState(true);
  const [useSpaces, setUseSpaces] = useState(false);
  const [localOnly, setLocalOnly] = useState(false);
  const [validatorAccount, setValidatorAccount] = useState<AccountId>("account-1");

  const [phase, setPhase] = useState<Phase>("idle");
  const [numbers, setNumbers] = useState<GeneratedNumber[]>([]);
  const [validated, setValidated] = useState<ValidatedNumber[]>([]);
  const [validProgress, setValidProgress] = useState(0);
  const [validTotal, setValidTotal] = useState(0);
  const [error, setError] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  const account1Connected = accountStatuses["account-1"]?.status === "connected";
  const account2Connected = accountStatuses["account-2"]?.status === "connected";
  const anyConnected = account1Connected || account2Connected;
  const selectedConnected = accountStatuses[validatorAccount]?.status === "connected";

  // ── Generate ──────────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    setError("");
    setPhase("generating");
    setNumbers([]);
    setValidated([]);

    try {
      const res = await fetch("/api/phoneforge/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ countryIndex, qty, useDial, useSpaces, localOnly }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Generation failed");
      setNumbers(data.numbers);
      setPhase("generated");
      if (onCreateCampaign && mode === "generate_only") {
        // Just let the user click "Next" or similar if we wanted, but we'll stick to the flow
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed");
      setPhase("idle");
    }
  }, [countryIndex, qty, useDial, useSpaces, localOnly, mode, onCreateCampaign]);

  // ── Validate ──────────────────────────────────────────────────────────────
  const handleValidate = useCallback(async () => {
    if (!selectedConnected) return;
    setError("");
    setPhase("validating");
    setValidated([]);
    setValidProgress(0);
    setValidTotal(numbers.length);

    abortRef.current = new AbortController();
    const results: ValidatedNumber[] = [];

    try {
      const res = await fetch("/api/phoneforge/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numbers, accountId: validatorAccount }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Validation failed");
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });

        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const evt = JSON.parse(line.slice(5).trim());
          if (evt.type === "progress") {
            results.push({ raw: numbers[evt.index].raw, display: numbers[evt.index].display, valid: evt.valid });
            setValidProgress(evt.current);
            setValidated([...results]);
          } else if (evt.type === "complete") {
            setValidated(evt.results);
            setValidProgress(evt.results.length);
          }
        }
      }
      setPhase("done");
    } catch (e: unknown) {
      if (e instanceof Error && e.name === "AbortError") {
        setPhase("done");
      } else {
        setError(e instanceof Error ? e.message : "Validation failed");
        setPhase("generated");
      }
    }
  }, [numbers, selectedConnected, validatorAccount]);

  const stopValidation = () => {
    abortRef.current?.abort();
  };

  const validNumbers = validated.filter((n) => n.valid);
  const invalidNumbers = validated.filter((n) => !n.valid);
  const isValidating = phase === "validating";
  const isDone = phase === "done";
  const hasNumbers = numbers.length > 0;
  const pct = validTotal > 0 ? Math.round((validProgress / validTotal) * 100) : 0;

  const copyValid = () => {
    const txt = validNumbers.map((n) => n.raw.replace(/\D/g, "")).join("\n");
    navigator.clipboard.writeText(txt);
  };

  const downloadValid = () => {
    const txt = validNumbers.map((n) => n.display).join("\n");
    const blob = new Blob([txt], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `valid_numbers_${COUNTRIES[countryIndex].name.replace(/\s/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-5">
      {/* ── Generator config ── */}
      {(mode === "both" || mode === "generate_only") && (
        <Card className="p-6 glass-panel space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-5 h-5 text-primary" />
            <span className="font-bold text-lg">Number Generator</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Country</label>
              <div className="relative">
                <select
                  value={countryIndex}
                  onChange={(e) => setCountryIndex(parseInt(e.target.value))}
                  className="w-full appearance-none rounded-md border border-white/10 bg-black/40 px-3 py-2 text-xs pr-8 focus:border-primary outline-none transition-colors"
                  disabled={isValidating}
                >
                  {COUNTRIES.map((c, i) => (
                    <option key={i} value={i}>{c.name} ({c.dial})</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2.5 top-2.5 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Quantity</label>
              <Input
                type="number"
                min={1}
                max={10000}
                value={qty}
                onChange={(e) => setQty(Math.min(10000, Math.max(1, parseInt(e.target.value) || 1)))}
                disabled={isValidating}
                className="bg-black/40 border-white/10 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {[
              { label: "Dial code", state: useDial, set: setUseDial },
              { label: "Spaces", state: useSpaces, set: setUseSpaces },
              { label: "Local only", state: localOnly, set: setLocalOnly },
            ].map(({ label, state, set }) => (
              <label key={label} className="flex items-center gap-1.5 cursor-pointer text-[10px] font-bold uppercase tracking-widest text-muted-foreground hover:text-white transition-colors">
                <input
                  type="checkbox"
                  checked={state}
                  onChange={(e) => set(e.target.checked)}
                  className="rounded border-white/20 bg-black/40"
                  disabled={isValidating}
                />
                {label}
              </label>
            ))}
          </div>

          <Button
            className="w-full btn-glow font-bold"
            onClick={handleGenerate}
            disabled={isValidating || phase === "generating"}
          >
            {phase === "generating"
              ? <><RefreshCw className="w-3.5 h-3.5 mr-2 animate-spin" />Generating…</>
              : <><Zap className="w-3.5 h-3.5 mr-2" />Generate {qty.toLocaleString()} Numbers</>
            }
          </Button>

          {hasNumbers && mode === "generate_only" && (
            <div className="space-y-4 pt-4 border-t border-white/5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
                  {numbers.length.toLocaleString()} Sequences Generated
                </span>
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="h-7 px-3 text-[10px] uppercase font-bold gap-1.5 btn-glow border-primary/30"
                  onClick={() => onCreateCampaign?.(numbers.map(n => n.raw))}
                >
                  <ShieldCheck className="w-3 h-3" /> Validate Results →
                </Button>
              </div>
              
              <ScrollArea className="h-48 rounded-xl border border-white/5 bg-black/40">
                <div className="p-3 grid grid-cols-2 gap-1">
                  {numbers.map((n, i) => (
                    <div key={i} className="text-[10px] font-mono text-muted-foreground/60 px-2 py-1 bg-white/5 rounded border border-white/5">
                      {n.display}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </Card>
      )}

      {/* ── Results + Validator ── */}
      {(mode === "both" || mode === "validate_only") && (hasNumbers || mode === "validate_only") && (
        <Card className="p-6 glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              <span className="font-bold text-lg">Live Validator</span>
            </div>
            {isDone && validNumbers.length > 0 && (
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] uppercase font-bold gap-1 bg-black/40 border-white/10" onClick={copyValid}>
                  <Copy className="w-3 h-3" /> Copy
                </Button>
                <Button variant="outline" size="sm" className="h-7 px-2 text-[10px] uppercase font-bold gap-1 bg-black/40 border-white/10" onClick={downloadValid}>
                  <Download className="w-3 h-3" /> Export
                </Button>
              </div>
            )}
          </div>

          {numbers.length === 0 && mode === "validate_only" ? (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="p-4 rounded-full bg-white/5 border border-white/5">
                <Database className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold">No Numbers Found</p>
                <p className="text-xs text-muted-foreground">Please complete Step 02 to generate numbers first.</p>
              </div>
              <Button variant="outline" size="sm" className="btn-glow" onClick={() => {}}>Go Back to Step 02</Button>
            </div>
          ) : (
            <>
              {(isValidating || isDone) && (
                <div className="space-y-2">
                  <div className="flex justify-between text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    <span>Validation Stream</span>
                    <span className="font-mono text-white">{validProgress}/{validTotal} · {pct}%</span>
                  </div>
                  <Progress value={pct} className="h-2 bg-black/40" />
                </div>
              )}

              {!isDone && !isValidating && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-2">
                    {(["account-1", "account-2"] as AccountId[]).map((aid) => {
                      const connected = accountStatuses[aid]?.status === "connected";
                      const phone = accountStatuses[aid]?.phone;
                      const selected = validatorAccount === aid;
                      return (
                        <button
                          key={aid}
                          onClick={() => setValidatorAccount(aid)}
                          disabled={!connected}
                          className={`rounded-xl border-2 px-4 py-3 text-left transition-all ${
                            selected && connected
                              ? "border-primary bg-primary/10 shadow-[0_0_15px_rgba(255,153,0,0.1)]"
                              : connected
                                ? "border-white/5 bg-black/40 hover:border-white/20"
                                : "border-white/5 bg-black/20 opacity-40 cursor-not-allowed"
                          }`}
                        >
                          <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-1">
                            {aid === "account-1" ? "Primary" : "Secondary"}
                          </div>
                          {connected ? (
                            <div className="flex items-center gap-1.5 text-white">
                              <Wifi className="w-3.5 h-3.5 text-primary" />
                              <span className="text-xs font-bold font-mono">{phone ? `+${phone}` : "Connected"}</span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <WifiOff className="w-3.5 h-3.5" />
                              <span className="text-xs font-bold">Offline</span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <Button
                    className="w-full btn-glow font-bold"
                    onClick={handleValidate}
                    disabled={!selectedConnected}
                  >
                    <Play className="w-3.5 h-3.5 mr-2" />
                    Start Verification Flow
                  </Button>
                </div>
              )}

              {isValidating && (
                <Button variant="destructive" size="sm" className="w-full font-bold uppercase tracking-widest text-[10px]" onClick={stopValidation}>
                  Abort Stream
                </Button>
              )}

              {isDone && validNumbers.length > 0 && onCreateCampaign && (
                <Button
                  className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-bold btn-glow"
                  onClick={() => onCreateCampaign(validNumbers.map((n) => n.raw))}
                >
                  Schedule {validNumbers.length} Valid Contacts →
                </Button>
              )}

              <ScrollArea className="h-64 rounded-xl border border-white/5 bg-black/40">
                <div className="p-3 space-y-1">
                  {(validated.length > 0 ? validated : numbers).map((n, i) => {
                    const v = "valid" in n ? (n as ValidatedNumber) : null;
                    return (
                      <div
                        key={i}
                        className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-xs transition-colors ${
                          v === null
                            ? "text-muted-foreground/50 border border-transparent"
                            : v.valid
                              ? "bg-primary/5 text-primary border border-primary/20"
                              : "text-muted-foreground/30 border border-transparent"
                        }`}
                      >
                        <span className="font-mono">{n.display}</span>
                        {v !== null && (
                          v.valid
                            ? <CheckCircle2 className="w-3.5 h-3.5 text-primary shrink-0" />
                            : <XCircle className="w-3.5 h-3.5 text-muted-foreground/20 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </Card>
      )}

      {error && (
        <p className="text-xs text-destructive text-center font-bold uppercase tracking-widest">{error}</p>
      )}
    </div>
  );
}
