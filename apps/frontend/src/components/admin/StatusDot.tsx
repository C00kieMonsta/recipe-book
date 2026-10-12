import type { PrepStatus } from "@packages/types";
import { Check } from "lucide-react";

export const STATUS_LABEL: Record<PrepStatus, string> = { todo: "À faire", doing: "En cours", done: "Fait" };

const DOT: Record<PrepStatus, string> = {
  todo: "border-[1.5px] border-[rgba(55,53,47,0.45)]",
  doing: "bg-status-doing",
  done: "bg-status-done text-white",
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
  className?: string;
}

// One tap cycles todo, doing, done.
export function StatusDot({ value, onCycle, className = "" }: StatusDotProps) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onCycle(); }}
      aria-label={`Statut : ${STATUS_LABEL[value]}. Changer`}
      title={STATUS_LABEL[value]}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-hover touch:h-11 touch:w-11 ${className}`}
    >
      <Dot status={value} />
    </button>
  );
}
