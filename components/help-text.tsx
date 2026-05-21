"use client";

import { HelpCircle } from "lucide-react";

interface HelpTextProps {
  children: React.ReactNode;
  icon?: boolean;
}

export function HelpText({ children, icon = true }: HelpTextProps) {
  return (
    <div className="flex items-start gap-2 text-xs text-muted-foreground bg-card/50 border border-white/5 rounded-lg p-3 mt-2">
      {icon && <HelpCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
      <div className="space-y-1">{children}</div>
    </div>
  );
}
