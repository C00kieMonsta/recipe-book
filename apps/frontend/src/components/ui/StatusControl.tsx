import type { PrepStatus } from "@packages/types";

export interface StatusControlProps {
  value: PrepStatus;
  onChange: (v: PrepStatus) => void;
  size?: "md" | "lg";
  className?: string;
}

const SEGMENTS: { value: PrepStatus; label: string; active: string }[] = [
  { value: "todo", label: "À faire", active: "bg-foreground text-background" },
  { value: "doing", label: "En cours", active: "bg-warning text-primary-foreground" },
  { value: "done", label: "Fait", active: "bg-success text-primary-foreground" },
];

export default function StatusControl({ value, onChange, size = "md", className = "" }: StatusControlProps) {
  const h = size === "lg" ? "min-h-12" : "min-h-11";
  return (
    <div role="group" aria-label="Statut de préparation" className={`inline-flex w-full rounded-lg border border-border bg-card p-0.5 ${className}`}>
      {SEGMENTS.map((seg) => {
        const active = seg.value === value;
        return (
          <button
            key={seg.value}
            type="button"
            aria-pressed={active}
            onClick={() => { if (!active) onChange(seg.value); }}
            className={`flex-1 ${h} whitespace-nowrap rounded-md px-2 text-base font-medium transition-colors sm:px-3 ${active ? seg.active : "text-muted-foreground hover:bg-hover"}`}
          >
            {seg.label}
          </button>
        );
      })}
    </div>
  );
}
