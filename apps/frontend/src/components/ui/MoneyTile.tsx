import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface MoneyTick {
  label: string;
  value: number;
}

export interface MoneyProgress {
  value: number;
  max: number;
  ticks?: MoneyTick[];
}

export interface MoneyTileProps {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  progress?: MoneyProgress;
  to?: string;
  // No own background; the parent draws the shared bg-surface stat row.
  flat?: boolean;
  className?: string;
}

function pct(value: number, max: number): number {
  if (!max || max <= 0) return 0;
  return Math.min(100, Math.max(0, (value / max) * 100));
}

export default function MoneyTile({ label, value, sub, progress, to, flat = false, className = "" }: MoneyTileProps) {
  const body = (
    <>
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-h3 tabular-nums text-foreground">{value}</div>
      {sub && <div className="text-caption text-muted-foreground">{sub}</div>}
      {progress && (
        <div className={cn("mt-3", progress.ticks?.length && "pb-5")}>
          <div className="relative h-1 w-full rounded-full bg-divider">
            <div className="h-1 rounded-full bg-primary" style={{ width: `${pct(progress.value, progress.max)}%` }} />
            {progress.ticks?.map((tick) => (
              <div key={tick.label} className="absolute top-0" style={{ left: `${pct(tick.value, progress.max)}%` }}>
                <div className="-mt-1 h-3 w-px bg-divider" />
                <div className="absolute left-0 mt-0.5 -translate-x-1/2 whitespace-nowrap text-caption text-muted-foreground">
                  {tick.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  const base = cn("block p-3", flat ? "rounded-none" : "rounded-lg bg-surface", className);
  if (to) {
    return (
      <Link to={to} className={cn(base, "transition-colors hover:bg-hover")}>
        {body}
      </Link>
    );
  }
  return <div className={base}>{body}</div>;
}
