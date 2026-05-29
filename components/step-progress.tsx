"use client";

import { CheckCircle2, Circle } from "lucide-react";

interface StepProgressProps {
  steps: Array<{ id: string; label: string }>;
  currentStep: string;
  completedSteps?: string[];
}

export function StepProgress({ steps, currentStep, completedSteps = [] }: StepProgressProps) {
  const currentIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="space-y-3 mb-8">
      {/* Progress Bar */}
      <div className="flex gap-2 items-center">
        {steps.map((step, idx) => {
          const isCompleted = completedSteps.includes(step.id);
          const isCurrent = step.id === currentStep;
          const isPast = idx < currentIndex;

          return (
            <div key={step.id} className="flex items-center flex-1">
              {/* Step Indicator */}
              <div
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm transition-all ${
                  isCurrent
                    ? "bg-primary text-primary-foreground ring-2 ring-primary ring-offset-2 ring-offset-background"
                    : isCompleted
                    ? "bg-emerald-500/20 text-emerald-500 border border-emerald-500/30"
                    : isPast
                    ? "bg-primary/20 text-primary border border-primary/30"
                    : "bg-card/50 text-muted-foreground border border-white/5"
                }`}
              >
                {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-4 h-4" />}
              </div>

              {/* Connector Line */}
              {idx < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 transition-all ${
                    isPast || isCurrent
                      ? "bg-gradient-to-r from-primary/60 to-primary/20"
                      : "bg-white/5"
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Current Step Label */}
      <div className="text-sm">
        <p className="text-muted-foreground">
          Step {currentIndex + 1} of {steps.length}
        </p>
        <p className="text-base font-semibold text-white">
          {steps.find((s) => s.id === currentStep)?.label || "Unknown"}
        </p>
      </div>
    </div>
  );
}
