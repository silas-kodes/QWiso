"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Send, AlertTriangle } from "lucide-react";
import type { Contact } from "@/lib/excel-parser";
import type { MessageChannel } from "@/components/messaging-hub";

interface UnifiedMessengerProps {
  channel: MessageChannel;
  contacts: Contact[];
  messageTemplate: string;
  onSendComplete: (results: SendResult[]) => void;
}

export interface SendResult {
  contact: Contact;
  success: boolean;
  error?: string;
}

export function UnifiedMessenger({
  channel,
  contacts,
  messageTemplate,
  onSendComplete,
}: UnifiedMessengerProps) {
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<SendResult[]>([]);
  const [currentContact, setCurrentContact] = useState<Contact | null>(null);

  const handleSend = async () => {
    if (!contacts.length) {
      alert("No contacts to send to");
      return;
    }

    setSending(true);
    setProgress(0);
    setResults([]);
    const sendResults: SendResult[] = [];

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      setCurrentContact(contact);
      setProgress((i / contacts.length) * 100);

      try {
        const payload = {
          channel,
          recipient: contact.phone,
          message: messageTemplate,
        };

        const res = await fetch("/api/messaging/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (res.ok && data.success) {
          sendResults.push({ contact, success: true });
        } else {
          sendResults.push({
            contact,
            success: false,
            error: data.error || "Unknown error",
          });
        }
      } catch (err) {
        sendResults.push({
          contact,
          success: false,
          error: err instanceof Error ? err.message : "Network error",
        });
      }

      // Small delay between sends to avoid rate limiting
      await new Promise((r) => setTimeout(r, 1000));
    }

    setProgress(100);
    setResults(sendResults);
    setSending(false);
    setCurrentContact(null);
    onSendComplete(sendResults);
  };

  const successCount = results.filter((r) => r.success).length;
  const failedCount = results.filter((r) => !r.success).length;

  return (
    <div className="space-y-6">
      {!sending && results.length === 0 && (
        <Card className="p-6 glass-panel space-y-4">
          <div className="space-y-2">
            <h3 className="font-bold text-lg">Ready to Send</h3>
            <p className="text-sm text-muted-foreground">
              {contacts.length} contact{contacts.length !== 1 ? "s" : ""} will receive your message via{" "}
              {channel === "whatsapp" ? "WhatsApp" : "SMS"}
            </p>
          </div>

          <div className="bg-black/40 p-4 rounded-lg border border-white/5 max-h-32 overflow-y-auto">
            <p className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-words">
              {messageTemplate}
            </p>
          </div>

          <Button
            onClick={handleSend}
            className="btn-glow w-full font-bold uppercase text-[10px] tracking-widest h-12"
          >
            <Send className="w-4 h-4 mr-2" />
            Send to All
          </Button>
        </Card>
      )}

      {sending && (
        <Card className="p-6 glass-panel space-y-4">
          <div className="space-y-2">
            <h3 className="font-bold text-lg">Sending Messages...</h3>
            <p className="text-sm text-muted-foreground">
              {Math.round(progress)}% complete
            </p>
          </div>

          <div className="w-full bg-black/40 rounded-full h-2 border border-white/5">
            <div
              className="bg-primary h-full rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>

          {currentContact && (
            <p className="text-xs text-muted-foreground">
              Current: {currentContact.phone}
            </p>
          )}
        </Card>
      )}

      {results.length > 0 && (
        <Card className="p-6 glass-panel space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-lg">Send Results</h3>
            <div className="flex gap-4 text-sm">
              <div className="flex items-center gap-2 text-emerald-500">
                <CheckCircle className="w-4 h-4" />
                {successCount}
              </div>
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="w-4 h-4" />
                {failedCount}
              </div>
            </div>
          </div>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={`p-3 rounded-lg border flex items-start justify-between text-sm ${
                  result.success
                    ? "bg-emerald-500/5 border-emerald-500/20"
                    : "bg-destructive/5 border-destructive/20"
                }`}
              >
                <div className="flex-1">
                  <p className="font-mono text-xs">{result.contact.phone}</p>
                  {result.error && (
                    <p className="text-xs text-muted-foreground mt-1">{result.error}</p>
                  )}
                </div>
                {result.success ? (
                  <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-destructive flex-shrink-0 mt-0.5" />
                )}
              </div>
            ))}
          </div>

          {!sending && (
            <Button
              onClick={() => {
                setResults([]);
                setProgress(0);
              }}
              variant="outline"
              className="w-full uppercase text-[10px] tracking-widest"
            >
              Send Again
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
