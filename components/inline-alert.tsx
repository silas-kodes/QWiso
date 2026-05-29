"use client";

import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";

export type AlertType = "info" | "success" | "warning" | "error";

interface InlineAlertProps {
  type: AlertType;
  title?: string;
  message: string;
  children?: React.ReactNode;
}

const stylesByType: Record<AlertType, { bg: string; border: string; icon: React.ReactNode; textColor: string }> = {
  info: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    icon: <Info className="w-5 h-5 text-blue-500" />,
    textColor: "text-blue-500",
  },
  success: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    icon: <CheckCircle2 className="w-5 h-5 text-emerald-500" />,
    textColor: "text-emerald-500",
  },
  warning: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    icon: <AlertTriangle className="w-5 h-5 text-amber-500" />,
    textColor: "text-amber-500",
  },
  error: {
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    icon: <AlertCircle className="w-5 h-5 text-red-500" />,
    textColor: "text-red-500",
  },
};

export function InlineAlert({ type, title, message, children }: InlineAlertProps) {
  const styles = stylesByType[type];

  return (
    <div className={`${styles.bg} border ${styles.border} rounded-lg p-4 space-y-2`}>
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{styles.icon}</div>
        <div className="flex-1 min-w-0">
          {title && <p className={`font-semibold text-sm ${styles.textColor}`}>{title}</p>}
          <p className="text-sm text-muted-foreground">{message}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
