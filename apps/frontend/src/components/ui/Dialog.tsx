import { useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { IconButton } from "./Button";
import Sheet from "./Sheet";
import { useFocusTrap } from "./use-focus-trap";

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

export default function Dialog({ open, onClose, title, size = "md", children, footer, className, "aria-label": ariaLabel }: DialogProps) {
  const touch = useTouchScreen();
  const panelRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // On touch the Sheet owns the trap, so the Dialog only traps on pointer screens.
  useFocusTrap(panelRef, open && !touch, onClose, contentRef);

  if (!open) return null;

  if (touch) {
    return (
      <Sheet open onClose={onClose} title={title} aria-label={ariaLabel} className="flex flex-col">
        <div className={cn("min-h-0 flex-1 overflow-y-auto px-4 text-base", className)}>{children}</div>
        {footer && <div className="mt-3 flex shrink-0 justify-end gap-2 px-4 pt-3">{footer}</div>}
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
        aria-labelledby={ariaLabel === undefined && title !== undefined ? titleId : undefined}
        tabIndex={-1}
        className={cn("flex max-h-[90dvh] w-full flex-col rounded-2xl bg-background p-5 shadow-dialog outline-none animate-pop", SIZE[size], className)}
        onClick={(e) => e.stopPropagation()}
      >
        {title !== undefined && (
          <div className="flex items-center justify-between gap-2">
            <h2 id={titleId} className="min-w-0 truncate text-base font-semibold">{title}</h2>
            <IconButton size="sm" aria-label="Fermer" onClick={onClose} icon={<X />} />
          </div>
        )}
        <div ref={contentRef} className="mt-3 min-h-0 overflow-y-auto text-sm touch:text-base">{children}</div>
        {footer && <div className="mt-5 flex justify-end gap-2">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
