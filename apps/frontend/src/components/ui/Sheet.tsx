import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./Button";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: "bottom" | "left";
  title?: ReactNode;
  headerRight?: ReactNode;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

const PANEL = {
  bottom: "fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-3xl bg-background pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-dialog animate-sheet",
  left: "fixed inset-y-0 left-0 z-50 w-[280px] overflow-y-auto bg-sidebar shadow-dialog",
};

export default function Sheet({ open, onClose, side = "bottom", title, headerRight, children, className, "aria-label": ariaLabel }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-50 bg-overlay animate-fade-in" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-label={ariaLabel} className={cn(PANEL[side], className)} onClick={(e) => e.stopPropagation()}>
        {side === "bottom" && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-divider" aria-hidden="true" />}
        {(title !== undefined || headerRight !== undefined) && (
          <div className="flex h-11 items-center justify-between px-4 text-base font-semibold">
            <span className="min-w-0 truncate">{title}</span>
            {headerRight ?? <IconButton size="md" aria-label="Fermer" onClick={onClose} icon={<X />} />}
          </div>
        )}
        {children}
      </div>
    </>,
    document.body,
  );
}
