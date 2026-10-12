import type { PrepStatus } from "@packages/types";
import { Check } from "lucide-react";

export const STATUS_LABEL: Record<PrepStatus, string> = { todo: "À faire", doing: "En cours", done: "Fait" };

const DOT: Record<PrepStatus, string> = {
  todo: "border-2 border-muted-foreground bg-transparent",
  doing: "border-2 border-warning bg-warning",
  done: "border-2 border-success bg-success text-primary-foreground",
};

export function Dot({ status, className = "" }: { status: PrepStatus; className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${DOT[status]} ${className}`}>
      {status === "done" && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

export interface StatusDotProps {
  value: PrepStatus;
  onCycle: () => void;
  // "touch" keeps the 44px target only on touch screens; "always" keeps it everywhere.
  target?: "touch" | "always";
  className?: string;
}

// One tap cycles todo, doing, done.
export function StatusDot({ value, onCycle, target = "touch", className = "" }: StatusDotProps) {
  const size = target === "always" ? "min-h-11 min-w-11" : "min-h-9 min-w-9 touch:min-h-11 touch:min-w-11";
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCycle(); }}
      aria-label={`Statut : ${STATUS_LABEL[value]}. Changer`}
      title={STATUS_LABEL[value]}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg hover:bg-hover ${size} ${className}`}
    >
      <Dot status={value} />
    </button>
  );
}

export interface StatusDotsProps {
  value: PrepStatus;
  onChange: (v: PrepStatus) => void;
  className?: string;
}

// Three dots side by side for narrow hover reveals where the labelled StatusControl does not fit.
export function StatusDots({ value, onChange, className = "" }: StatusDotsProps) {
  const all: PrepStatus[] = ["todo", "doing", "done"];
  return (
    <div role="group" aria-label="Statut de préparation" className={`inline-flex items-center rounded-lg border border-border bg-card p-0.5 ${className}`}>
      {all.map((s) => (
        <button
          key={s}
          type="button"
          aria-pressed={s === value}
          aria-label={STATUS_LABEL[s]}
          title={STATUS_LABEL[s]}
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (s !== value) onChange(s); }}
          className={`inline-flex min-h-9 min-w-9 items-center justify-center rounded-md ${s === value ? "bg-muted" : "hover:bg-hover"}`}
        >
          <Dot status={s} />
        </button>
      ))}
    </div>
  );
}
