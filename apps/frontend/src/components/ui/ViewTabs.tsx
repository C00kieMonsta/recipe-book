import { useEffect, useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface ViewTabItem {
  key: string;
  label: ReactNode;
  to?: string;
  count?: number;
  title?: string;
}

export interface ViewTabsProps {
  items: ViewTabItem[];
  value: string;
  onChange?: (key: string) => void;
  className?: string;
  "aria-label"?: string;
}

const TAB = "relative inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:bg-hover hover:text-foreground touch:h-11 touch:text-base";
const ACTIVE = "text-foreground font-medium after:absolute after:inset-x-2 after:-bottom-[7px] after:h-0.5 after:rounded-full after:bg-foreground touch:after:-bottom-[3px]";

export default function ViewTabs({ items, value, onChange, className, "aria-label": ariaLabel }: ViewTabsProps) {
  const activeRef = useRef<HTMLAnchorElement & HTMLButtonElement>(null);

  // A tab row wider than the screen scrolls the active tab into view on arrival.
  useEffect(() => {
    activeRef.current?.scrollIntoView?.({ inline: "nearest", block: "nearest" });
  }, [value]);

  return (
    <nav aria-label={ariaLabel ?? "Vues"} className={cn("flex items-center gap-0.5 overflow-x-auto", className)}>
      {items.map((item) => {
        const active = item.key === value;
        const content = (
          <>
            {/* The invisible bold copy sets the width, so the active tab does not shift its neighbours. */}
            <span className="grid">
              <span className="col-start-1 row-start-1">{item.label}</span>
              <span aria-hidden className="invisible col-start-1 row-start-1 font-medium">{item.label}</span>
            </span>
            {item.count !== undefined && <span className="text-caption text-muted-foreground">{item.count}</span>}
          </>
        );
        if (item.to) {
          return (
            <Link key={item.key} ref={active ? activeRef : undefined} to={item.to} title={item.title} aria-current={active ? "page" : undefined} className={cn(TAB, active && ACTIVE)} onClick={() => onChange?.(item.key)}>
              {content}
            </Link>
          );
        }
        return (
          <button key={item.key} ref={active ? activeRef : undefined} type="button" title={item.title} aria-pressed={active} className={cn(TAB, active && ACTIVE)} onClick={() => onChange?.(item.key)}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
