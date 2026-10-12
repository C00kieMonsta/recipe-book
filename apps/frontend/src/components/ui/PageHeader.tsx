import type { ReactNode } from "react";
import { Link } from "react-router-dom";

export interface Breadcrumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  breadcrumb?: Breadcrumb[];
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ breadcrumb, title, meta, actions, className = "" }: PageHeaderProps) {
  return (
    <header className={`mb-6 ${className}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Fil d'Ariane" className="mb-2 flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          {breadcrumb.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && <span aria-hidden="true">/</span>}
              {crumb.to ? (
                <Link to={crumb.to} className="rounded hover:text-foreground hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-serif text-h1 md:text-h1-lg">{title}</h1>
          {meta && <div className="mt-1 text-base text-muted-foreground">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
