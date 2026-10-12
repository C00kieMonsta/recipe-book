import type { PrepStatus } from "@packages/types";
import SelectPill, { type SelectPillOption } from "./SelectPill";

export interface StatusControlProps {
  value: PrepStatus;
  onChange: (v: PrepStatus) => void;
  // Kept for the old callers; the pill has one size.
  size?: "md" | "lg";
  className?: string;
  align?: "left" | "right";
}

export const PREP_STATUS_OPTIONS: (SelectPillOption & { value: PrepStatus })[] = [
  { value: "todo", label: "À faire", colour: "gray", dot: "bg-status-todo" },
  { value: "doing", label: "En cours", colour: "blue", dot: "bg-status-doing" },
  { value: "done", label: "Fait", colour: "green", dot: "bg-status-done" },
];

export default function StatusControl({ value, onChange, className = "", align }: StatusControlProps) {
  return (
    <SelectPill
      value={value}
      options={PREP_STATUS_OPTIONS}
      onChange={(v) => onChange(v as PrepStatus)}
      aria-label="Statut de préparation"
      title="Statut"
      align={align}
      className={className}
    />
  );
}
