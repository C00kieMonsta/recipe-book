import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export interface ListRowProps {
  icon?: ReactNode;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  to?: string;
  className?: string;
}

export default function ListRow({ icon, leading, title, subtitle, trailing, onClick, to, className = "" }: ListRowProps) {
  const interactive = Boolean(to || onClick);
  const base = cn(
    "group flex w-full min-h-9 items-center gap-3 rounded px-2 py-1 text-left touch:min-h-11",
    interactive && "hover:bg-hover focus-visible:outline-none focus-visible:shadow-ring",
    className,
  );

  const content = (
    <>
      {icon && <span className="flex w-5 shrink-0 items-center justify-center text-base leading-none" aria-hidden="true">{icon}</span>}
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium touch:text-base">{title}</div>
        {subtitle && <div className="truncate text-caption text-muted-foreground touch:text-sm">{subtitle}</div>}
      </div>
      {trailing && <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground tabular-nums">{trailing}</div>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={base} onClick={onClick}>
        {content}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={base} onClick={onClick}>
        {content}
      </button>
    );
  }
  return <div className={base}>{content}</div>;
}
