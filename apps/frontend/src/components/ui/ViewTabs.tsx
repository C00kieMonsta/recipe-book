import type { ReactNode } from "react";
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
  return (
    <nav aria-label={ariaLabel ?? "Vues"} className={cn("flex items-center gap-0.5 overflow-x-auto", className)}>
      {items.map((item) => {
        const active = item.key === value;
        const content = (
          <>
            {item.label}
            {item.count !== undefined && <span className="text-caption text-muted-foreground">{item.count}</span>}
          </>
        );
        if (item.to) {
          return (
            <Link key={item.key} to={item.to} title={item.title} aria-current={active ? "page" : undefined} className={cn(TAB, active && ACTIVE)} onClick={() => onChange?.(item.key)}>
              {content}
            </Link>
          );
        }
        return (
          <button key={item.key} type="button" title={item.title} aria-pressed={active} className={cn(TAB, active && ACTIVE)} onClick={() => onChange?.(item.key)}>
            {content}
          </button>
        );
      })}
    </nav>
  );
}
