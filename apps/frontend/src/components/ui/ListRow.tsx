import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface ListRowProps {
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onClick?: () => void;
  to?: string;
  className?: string;
}

export default function ListRow({ leading, title, subtitle, trailing, onClick, to, className = "" }: ListRowProps) {
  const interactive = Boolean(to || onClick);
  const base = `flex w-full items-center gap-3 min-h-12 py-3 px-3 rounded-lg text-left ${interactive ? "hover:bg-hover focus-visible:outline-none focus-visible:shadow-ring" : ""} ${className}`;

  const content = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-medium text-foreground">{title}</div>
        {subtitle && <div className="truncate text-sm text-muted-foreground">{subtitle}</div>}
      </div>
      {trailing && <div className="shrink-0 flex items-center gap-2">{trailing}</div>}
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
