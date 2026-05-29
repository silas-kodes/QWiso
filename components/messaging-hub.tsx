"use client";

import { useState } from "react";
import { MessageCircle, MessageSquare } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export type MessageChannel = "whatsapp" | "sms";

interface MessagingHubProps {
  onChannelSelect: (channel: MessageChannel) => void;
}

export function MessagingHub({ onChannelSelect }: MessagingHubProps) {
  const [selected, setSelected] = useState<MessageChannel | null>(null);

  const channels: Array<{ id: MessageChannel; name: string; icon: typeof MessageCircle; description: string }> = [
    {
      id: "whatsapp",
      name: "WhatsApp",
      icon: MessageCircle,
      description: "Send via connected WhatsApp accounts with media support",
    },
    {
      id: "sms",
      name: "SMS/TextBee",
      icon: MessageSquare,
      description: "Send via TextBee Android device gateway",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold uppercase tracking-wider">Select Messaging Channel</h2>
        <p className="text-sm text-muted-foreground">Choose your preferred communication platform</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {channels.map((ch) => {
          const Icon = ch.icon;
          const isSelected = selected === ch.id;

          return (
            <Card
              key={ch.id}
              onClick={() => setSelected(ch.id)}
              className={`p-6 cursor-pointer transition-all duration-300 border-2 ${
                isSelected
                  ? "border-primary bg-primary/10 shadow-[0_0_20px_rgba(255,153,0,0.15)]"
                  : "border-white/10 bg-card/50 hover:border-white/20"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`p-3 rounded-lg ${
                    isSelected ? "bg-primary/20 text-primary" : "bg-white/5 text-muted-foreground"
                  }`}
                >
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-lg mb-1">{ch.name}</h3>
                  <p className="text-sm text-muted-foreground">{ch.description}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {selected && (
        <div className="flex justify-center pt-4">
          <Button
            onClick={() => onChannelSelect(selected)}
            className="btn-glow font-bold uppercase text-[10px] tracking-widest px-12 h-12"
          >
            Continue with {selected === "whatsapp" ? "WhatsApp" : "SMS"} →
          </Button>
        </div>
      )}
    </div>
  );
}
