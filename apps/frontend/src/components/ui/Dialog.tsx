import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { IconButton } from "./Button";
import Sheet from "./Sheet";

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  "aria-label"?: string;
}

const SIZE = { sm: "max-w-sm", md: "max-w-md", lg: "max-w-2xl" };
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Dialog({ open, onClose, title, size = "md", children, footer, className, "aria-label": ariaLabel }: DialogProps) {
  const touch = useTouchScreen();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || touch) return;
    const panel = panelRef.current;
    const previous = document.activeElement as HTMLElement | null;
    const first = panel?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? panel)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
      else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus?.();
    };
  }, [open, touch, onClose]);

  if (!open) return null;

  if (touch) {
    return (
      <Sheet open onClose={onClose} title={title} aria-label={ariaLabel}>
        <div className={cn("px-4 text-base", className)}>{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2 px-4">{footer}</div>}
      </Sheet>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4 animate-fade-in" onClick={onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        tabIndex={-1}
        className={cn("flex max-h-[90dvh] w-full flex-col rounded-2xl bg-background p-5 shadow-dialog outline-none animate-pop", SIZE[size], className)}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-2">
            <h2 className="min-w-0 truncate text-base font-semibold">{title}</h2>
            <IconButton size="sm" aria-label="Fermer" onClick={onClose} icon={<X />} />
          </div>
        )}
        <div className="mt-3 min-h-0 overflow-y-auto text-sm touch:text-base">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
