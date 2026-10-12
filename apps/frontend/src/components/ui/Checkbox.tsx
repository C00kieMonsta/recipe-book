import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  shape?: "square" | "circle";
  label?: ReactNode;
  readOnly?: boolean;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
  name?: string;
}

export default function Checkbox({ checked, onChange, shape = "square", label, readOnly = false, disabled = false, className, "aria-label": ariaLabel, name }: CheckboxProps) {
  const inert = readOnly || disabled;
  return (
    <label
      className={cn(
        label
          ? "inline-flex h-7 cursor-pointer items-center gap-2 rounded px-1 text-sm hover:bg-hover touch:h-11 touch:text-base"
          : "inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded hover:bg-hover touch:h-11 touch:w-11",
        inert && "pointer-events-none",
        disabled && "opacity-50",
        className,
      )}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        name={name}
        aria-label={ariaLabel}
        readOnly={readOnly}
        disabled={disabled}
        onChange={(e) => { if (!readOnly) onChange?.(e.target.checked); }}
      />
      <span
        aria-hidden="true"
        className={cn(
          "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border-[1.5px] border-[rgba(55,53,47,0.45)] bg-background transition-colors peer-focus-visible:shadow-ring",
          shape === "circle" && "rounded-full",
          checked && "border-primary bg-primary text-primary-foreground",
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      {label && <span className="min-w-0 truncate">{label}</span>}
    </label>
  );
}
