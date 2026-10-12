import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ToolbarProps {
  left?: ReactNode;
  // DateNav or a similar group; wraps to a full second row on touch.
  center?: ReactNode;
  right?: ReactNode;
  // Shown instead of `right` on touch screens (⋯ and the primary only).
  rightTouch?: ReactNode;
  // Active filter chips; the row renders only when non-empty.
  filters?: ReactNode;
  className?: string;
}

export default function Toolbar({ left, center, right, rightTouch, filters, className }: ToolbarProps) {
  return (
    <div className={cn("no-print", className)}>
      <div className="flex h-10 items-center gap-1 border-b border-border touch:h-auto touch:min-h-12 touch:flex-wrap touch:gap-2">
        {left && <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">{left}</div>}
        {center && <div className="ml-2 flex items-center gap-0.5 touch:order-last touch:ml-0 touch:w-full touch:pb-1">{center}</div>}
        {right && <div className={cn("ml-auto flex items-center gap-0.5", rightTouch && "touch:hidden")}>{right}</div>}
        {rightTouch && <div className="ml-auto hidden items-center gap-0.5 touch:flex">{rightTouch}</div>}
      </div>
      {filters && <div className="flex flex-wrap items-center gap-1 py-1.5">{filters}</div>}
    </div>
  );
}

export interface FilterChipProps {
  children: ReactNode;
  onRemove?: () => void;
  className?: string;
}

export function FilterChip({ children, onRemove, className }: FilterChipProps) {
  return (
    <span className={cn("inline-flex h-7 items-center gap-1 rounded-sm bg-selected px-2 text-sm text-primary shadow-[0_0_0_1px_rgba(35,131,226,0.35)] touch:h-9", className)}>
      {children}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label="Retirer le filtre" className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded hover:bg-hover">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
        </button>
      )}
    </span>
  );
}
