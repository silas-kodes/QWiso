"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  Wifi, WifiOff, RefreshCw, CheckCircle, Smartphone,
  KeyRound, QrCode,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { AccountId, LoginMethod, WhatsAppState } from "@/lib/whatsapp";

type WASummary = Pick<WhatsAppState, "status" | "phone">;

interface WhatsAppAuthProps {
  accountId: AccountId;
  onSummaryChange?: (s: WASummary) => void;
}

export function WhatsAppAuth({ accountId, onSummaryChange }: WhatsAppAuthProps) {
  const [state, setState] = useState<WhatsAppState>({
    status: "disconnected", loginMethod: null,
    qrCode: null, pairingCode: null, phone: null, error: null,
  });
  const [method, setMethod] = useState<LoginMethod>("qr");
  const [phoneInput, setPhoneInput] = useState("");
  const [isRequesting, setIsRequesting] = useState(false);
  const [inputError, setInputError] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // ── Keep a ref to onSummaryChange so it is NEVER a useEffect dependency ──
  // If onSummaryChange were listed as a dep, any parent re-render that passes
  // a new function reference (even with same semantics) would re-fire the
  // effect and call setState in the parent → infinite loop.
  const onSummaryChangeRef = useRef(onSummaryChange);
  useEffect(() => { onSummaryChangeRef.current = onSummaryChange; });

  const base = `/api/whatsapp/${accountId}`;

  // Client-side canvas fallback for raw QR strings
  useEffect(() => {
    if (state.status === "qr_ready" && state.qrCode && !state.qrCode.startsWith("data:") && canvasRef.current) {
      import("qrcode").then((lib) =>
        lib.default.toCanvas(canvasRef.current!, state.qrCode!, { width: 280, margin: 2 })
      ).catch(() => {});
    }
  }, [state.qrCode, state.status]);

  const openSSE = useCallback(() => {
    esRef.current?.close();
    const es = new EventSource(`${base}/connect`);
    esRef.current = es;

    es.onmessage = (ev) => {
      try {
        const s: WhatsAppState = JSON.parse(ev.data);
        setState(s);
        if (["qr_ready", "pairing", "connected"].includes(s.status)) setIsRequesting(false);
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      // THE KEY FIX: After the user scans the QR code, Baileys fires a transient
      // connection:close on the server (WebSocket upgrade), which briefly breaks
      // the SSE stream and triggers this onerror. If we reset to "disconnected"
      // here we wipe the qr_ready/connecting state and the UI goes back to the
      // login screen — user has to click Refresh to try again.
      //
      // Solution: only reset to disconnected if we are NOT in an in-flight auth
      // state (qr_ready or pairing or connecting). For those states, leave the
      // current status alone — EventSource will auto-reconnect within ~1-2s and
      // the server's buffered state (now "connected") will arrive via onmessage.
      setState((prev) => {
        const inFlight = ["connecting", "qr_ready", "pairing"].includes(prev.status);
        if (prev.status === "connected" || inFlight) return prev; // hold — do not reset
        return { ...prev, status: "disconnected", error: "Connection lost." };
      });
      setIsRequesting(false);
    };
  }, [base]);

  useEffect(() => {
    fetch(`${base}/status`).then((r) => r.json()).then((s: WhatsAppState) => {
      setState(s);
      if (s.loginMethod) setMethod(s.loginMethod);
      if (["connecting", "qr_ready", "pairing", "connected"].includes(s.status)) openSSE();
    }).catch(() => {});
    return () => esRef.current?.close();
  }, [base, openSSE]);

  // Call onSummaryChange via ref — no dependency on the prop function itself,
  // so this effect only re-runs when status or phone actually changes.
  useEffect(() => {
    onSummaryChangeRef.current?.({ status: state.status, phone: state.phone });
  }, [state.status, state.phone]);

  const connect = async () => {
    if (method === "pairing") {
      const digits = phoneInput.replace(/\D/g, "");
      if (digits.length < 7 || digits.length > 15) {
        setInputError("Enter a valid number with country code, e.g. +971501234567");
        return;
      }
      setInputError("");
    }
    setIsRequesting(true);
    openSSE();
    const res = await fetch(`${base}/connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone: phoneInput.trim() || undefined, method }),
    });
    if (!res.ok) {
      const d = await res.json();
      setState((p) => ({ ...p, error: d.error ?? "Failed to start session." }));
      setIsRequesting(false);
    }
  };

  const disconnect = async () => {
    esRef.current?.close();
    await fetch(`${base}/disconnect`, { method: "POST" });
    setState({ status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: null });
    setPhoneInput(""); setIsRequesting(false);
  };

  const retry = async () => {
    // Disconnect on the server to clear any stale socket, then reset UI
    esRef.current?.close();
    await fetch(`${base}/disconnect`, { method: "POST" }).catch(() => {});
    setState({ status: "disconnected", loginMethod: null, qrCode: null, pairingCode: null, phone: null, error: null });
    setIsRequesting(false);
  };

  const isActive = ["connecting", "qr_ready", "pairing"].includes(state.status);

  return (
    <div className="space-y-6">
      <StatusBanner state={state} />

      {state.status === "connected" ? (
        <ConnectedView phone={state.phone} onDisconnect={disconnect} />
      ) : state.status === "qr_ready" ? (
        <QRView
          qrCode={state.qrCode}
          canvasRef={canvasRef}
          onRefresh={retry}
          onDisconnect={disconnect}
        />
      ) : state.status === "pairing" ? (
        <PairingCodeView code={state.pairingCode} onRetry={retry} onDisconnect={disconnect} />
      ) : (
        <div className="space-y-6">
          {/* Method picker */}
          <div className="grid grid-cols-2 gap-3">
            {(["qr", "pairing"] as LoginMethod[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMethod(m); setInputError(""); }}
                disabled={isActive}
                className={`flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-sm font-bold transition-all duration-300 ${
                  method === m
                    ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(255,153,0,0.1)]"
                    : "border-white/5 bg-black/40 text-muted-foreground hover:border-white/20 hover:text-white"
                }`}
              >
                {m === "qr"
                  ? <><QrCode className="w-8 h-8 mb-1" /><span>QR Login</span><span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Camera Scan</span></>
                  : <><Smartphone className="w-8 h-8 mb-1" /><span>Pairing</span><span className="text-[10px] font-bold uppercase tracking-widest opacity-50">Manual Code</span></>
                }
              </button>
            ))}
          </div>

          {/* Phone input (pairing only) */}
          {method === "pairing" && (
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-primary">Target Number</label>
              <Input
                placeholder="+971 50 123 4567"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && connect()}
                disabled={isRequesting || isActive}
                className="bg-black/40 border-white/10 font-mono text-center text-lg h-12"
              />
              {inputError && <p className="text-xs text-destructive font-bold">{inputError}</p>}
            </div>
          )}

          <Button
            className="w-full btn-glow h-12 font-bold uppercase tracking-widest"
            onClick={connect}
            disabled={isRequesting || isActive || (method === "pairing" && !phoneInput.trim())}
          >
            {isRequesting || isActive ? (
              <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Syncing…</>
            ) : method === "qr" ? (
              <><QrCode className="w-4 h-4 mr-2" />Generate Access QR</>
            ) : (
              <><KeyRound className="w-4 h-4 mr-2" />Request Pairing Code</>
            )}
          </Button>
        </div>
      )}

      <HowItWorks method={method} status={state.status} />
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function StatusBanner({ state }: { state: WhatsAppState }) {
  const map: Record<string, { bg: string; icon: React.ReactNode; label: string; sub: string }> = {
    disconnected: { bg: "bg-white/5 border-white/5",   icon: <WifiOff className="w-5 h-5 text-muted-foreground" />,           label: "System Offline",      sub: "Awaiting authentication signal." },
    connecting:   { bg: "bg-amber-500/10 border-amber-500/20",   icon: <RefreshCw className="w-5 h-5 text-amber-500 animate-spin" />,   label: "Initializing…",        sub: "Connecting to secure relay." },
    qr_ready:     { bg: "bg-primary/10 border-primary/20",     icon: <QrCode className="w-5 h-5 text-primary" />,                     label: "QR Ready",       sub: "Handshake requested. Scan now." },
    pairing:      { bg: "bg-primary/10 border-primary/20",     icon: <KeyRound className="w-5 h-5 text-primary" />,                   label: "Code Issued", sub: "Input pairing token on device." },
    connected:    { bg: "bg-primary/10 border-primary/30",     icon: <CheckCircle className="w-5 h-5 text-primary" />,                label: "Terminal Active", sub: state.phone ? `+${state.phone} Linked Successfully` : "Ready for transmission" },
  };
  const cfg = map[state.status] ?? map.disconnected;
  return (
    <div className={`flex items-start gap-4 p-5 rounded-xl border backdrop-blur-md ${cfg.bg}`}>
      <div className="mt-0.5">{cfg.icon}</div>
      <div>
        <p className="font-bold text-sm uppercase tracking-wider text-white">{cfg.label}</p>
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-widest mt-0.5">{state.error ?? cfg.sub}</p>
      </div>
    </div>
  );
}

function QRView({ qrCode, canvasRef, onRefresh, onDisconnect }: {
  qrCode: string | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-6 py-4">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Scan via WhatsApp &gt; Linked Devices</p>
      <div className="p-4 bg-white rounded-2xl shadow-[0_0_50px_rgba(255,153,0,0.15)] border-4 border-primary/20">
        {qrCode?.startsWith("data:") ? (
          <Image src={qrCode} alt="QR" width={280} height={280} unoptimized className="block mix-blend-multiply" />
        ) : qrCode ? (
          <canvas ref={canvasRef} width={280} height={280} style={{ display: "block" }} className="mix-blend-multiply" />
        ) : (
          <div className="w-[280px] h-[280px] flex flex-col items-center justify-center gap-4 text-black">
            <RefreshCw className="w-10 h-10 animate-spin text-primary" />
            <p className="font-bold text-sm">FINALIZING...</p>
          </div>
        )}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" size="sm" className="btn-glow font-bold uppercase text-[10px] tracking-widest bg-black/40 border-white/10" onClick={onRefresh}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
        </Button>
        <Button variant="ghost" size="sm" className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground" onClick={onDisconnect}>
          <WifiOff className="w-3.5 h-3.5 mr-1.5" /> Abort
        </Button>
      </div>
    </div>
  );
}

function PairingCodeView({ code, onRetry, onDisconnect }: { code: string | null; onRetry: () => void; onDisconnect: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-6 text-center">
      <div className="p-4 rounded-full bg-primary/10 border border-primary/20"><KeyRound className="w-8 h-8 text-primary" /></div>
      <div className="space-y-1">
        <p className="font-bold text-lg">Input Verification Token</p>
        <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Linked Devices &gt; Link with phone number</p>
      </div>
      <div className="flex items-center justify-center px-10 py-6 rounded-2xl bg-black/40 border border-white/10 shadow-[0_0_30px_rgba(255,153,0,0.05)]">
        {code
          ? <span className="font-mono text-5xl font-black tracking-[0.3em] text-primary select-all">{code}</span>
          : <RefreshCw className="w-8 h-8 animate-spin text-primary" />}
      </div>
      <div className="flex gap-3">
        <Button variant="outline" size="sm" className="btn-glow font-bold uppercase text-[10px] tracking-widest bg-black/40 border-white/10" onClick={onRetry}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> New Token
        </Button>
        <Button variant="ghost" size="sm" className="font-bold uppercase text-[10px] tracking-widest text-muted-foreground" onClick={onDisconnect}>
          <WifiOff className="w-3.5 h-3.5 mr-1.5" /> Cancel
        </Button>
      </div>
    </div>
  );
}

function ConnectedView({ phone, onDisconnect }: { phone: string | null; onDisconnect: () => void }) {
  return (
    <div className="flex flex-col items-center gap-6 py-8 text-center">
      <div className="relative">
        <div className="p-6 rounded-full bg-primary/10 border border-primary/20">
          <CheckCircle className="w-12 h-12 text-primary" />
        </div>
        <div className="absolute -bottom-2 -right-2 p-1.5 rounded-full bg-background border border-primary/30">
          <Wifi className="w-4 h-4 text-primary animate-pulse" />
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xl font-black tracking-tight">TERMINAL LINKED</p>
        {phone && <p className="font-mono text-sm text-primary font-bold">+{phone}</p>}
      </div>
      <Button variant="outline" size="sm" className="font-bold uppercase text-[10px] tracking-widest border-white/10 hover:border-destructive hover:text-destructive transition-all" onClick={onDisconnect}>
        <WifiOff className="w-4 h-4 mr-2" /> Terminate Link
      </Button>
    </div>
  );
}

function HowItWorks({ method, status }: { method: LoginMethod; status: string }) {
  if (status === "connected") return null;
  const qrSteps = [
    { n: 1, text: 'Click "Start Session & Show QR"' },
    { n: 2, text: "A QR code appears on screen" },
    { n: 3, text: "Open WhatsApp on your phone" },
    { n: 4, text: "Go to ⋮ → Linked Devices → Link a Device" },
    { n: 5, text: "Point your camera at the QR code" },
  ];
  const pairingSteps = [
    { n: 1, text: 'Enter your number and click "Get Pairing Code"' },
    { n: 2, text: "An 8-character code appears on screen" },
    { n: 3, text: "Open WhatsApp on your phone" },
    { n: 4, text: "Go to ⋮ → Linked Devices → Link with phone number" },
    { n: 5, text: "Type the code shown — you're linked!" },
  ];
  const steps = method === "qr" ? qrSteps : pairingSteps;
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">How it works</p>
      <div className="space-y-2">
        {steps.map((s) => (
          <div key={s.n} className="flex items-start gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-primary/20 text-primary text-xs font-bold flex items-center justify-center mt-0.5">{s.n}</span>
            <span className="text-sm text-muted-foreground">{s.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
