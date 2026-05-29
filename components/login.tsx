"use client";

import { useState } from "react";
import { Lock, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export function LoginComponent({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        setIsSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || "Login failed");
      }
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 glass-panel space-y-6 text-center">
          <div className="inline-flex p-4 rounded-full bg-primary/20 border border-primary/30 animate-pulse">
            <ShieldAlert className="w-10 h-10 text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tighter text-white">ACCESS GRANTED</h1>
            <p className="text-xs text-muted-foreground uppercase tracking-[0.2em] font-bold">Encrypted Link Established</p>
          </div>
          <Button 
            onClick={onLogin} 
            className="w-full h-14 text-lg font-black btn-glow uppercase tracking-widest"
          >
            Enter Terminal →
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md p-8 glass-panel space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex p-3 rounded-xl bg-primary/10 mb-2">
            <Lock className="w-6 h-6 text-primary" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">QWISO</h1>
          <p className="text-sm text-muted-foreground">Quantum WhatsApp Integrated Scheduler</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-bold uppercase tracking-widest text-primary">Access Key</label>
            <Input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="bg-background/50 font-mono"
              autoFocus
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-destructive bg-destructive/10 p-3 rounded-md border border-destructive/20">
              <ShieldAlert className="w-4 h-4" />
              {error}
            </div>
          )}

          <Button type="submit" className="w-full btn-glow" disabled={loading}>
            {loading ? "Decrypting..." : "Access System"}
          </Button>
        </form>

        <p className="text-[10px] text-center text-muted-foreground uppercase tracking-widest">
          Secure Terminal System v4.6
        </p>
      </Card>
    </div>
  );
}
