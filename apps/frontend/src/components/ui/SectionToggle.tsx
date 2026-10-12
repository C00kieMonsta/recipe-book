import { useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface SectionToggleProps {
  title: ReactNode;
  defaultOpen?: boolean;
  storageKey?: string;
  children: ReactNode;
  className?: string;
}

function readStored(storageKey: string | undefined, fallback: boolean): boolean {
  if (!storageKey) return fallback;
  try {
    const v = localStorage.getItem(`section:${storageKey}`);
    return v === null ? fallback : v === "1";
  } catch {
    return fallback;
  }
}

export default function SectionToggle({ title, defaultOpen = false, storageKey, children, className = "" }: SectionToggleProps) {
  const [open, setOpen] = useState(() => readStored(storageKey, defaultOpen));

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (storageKey) {
      try { localStorage.setItem(`section:${storageKey}`, next ? "1" : "0"); } catch { /* storage unavailable */ }
    }
  };

  return (
    <div className={`mt-block ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full min-h-11 items-center gap-2 rounded-lg text-left hover:bg-hover -mx-2 px-2"
      >
        <ChevronRight className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
        <h2 className="text-h3">{title}</h2>
      </button>
      {open && <div className="mt-3">{children}</div>}
    </div>
  );
}
