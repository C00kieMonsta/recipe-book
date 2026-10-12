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
    <div className={`mt-6 ${className}`}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="-mx-1 flex h-8 w-full items-center gap-1 rounded px-1 text-left hover:bg-hover touch:h-11"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-icon transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
        <h2 className="text-base font-semibold">{title}</h2>
      </button>
      {open && <div className="mt-2 pl-5">{children}</div>}
    </div>
  );
}
