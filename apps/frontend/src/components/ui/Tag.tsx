import type { CSSProperties, ReactNode } from "react";

export type TagVariant = "neutral" | "primary" | "success" | "warning" | "info" | "danger" | "supplier";

export interface TagProps {
  variant?: TagVariant;
  tint?: string;
  children: ReactNode;
  className?: string;
}

// Text on a tint is the dark role colour; the primary tint uses foreground (see REDESIGN.md section 4).
const VARIANT_CLASS: Record<TagVariant, string> = {
  neutral: "bg-muted text-foreground",
  primary: "bg-muted text-foreground",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  info: "bg-info-soft text-info",
  danger: "bg-destructive-soft text-destructive",
  supplier: "bg-secondary text-secondary-foreground",
};

const TINT_ALPHA = 0.18;

// Lowers a solid colour to a background tint that keeps dark text readable.
function softTint(color: string): string {
  const m = color.trim().match(/^hsla?\((.+)\)$/i);
  if (m) {
    const inner = m[1].trim();
    if (inner.includes("/")) return color;
    if (inner.includes(",")) return `hsla(${inner}, ${TINT_ALPHA})`;
    return `hsl(${inner} / ${TINT_ALPHA})`;
  }
  return `color-mix(in srgb, ${color} ${Math.round(TINT_ALPHA * 100)}%, transparent)`;
}

export default function Tag({ variant = "neutral", tint, children, className = "" }: TagProps) {
  const style: CSSProperties | undefined = tint ? { backgroundColor: softTint(tint) } : undefined;
  const colour = tint ? "text-foreground" : VARIANT_CLASS[variant];
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-sm px-2.5 py-0.5 text-sm font-medium ${colour} ${className}`} style={style}>
      {children}
    </span>
  );
}
