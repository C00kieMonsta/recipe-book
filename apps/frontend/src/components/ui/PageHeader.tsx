import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { PAGE_ICONS, type PageIconKey } from "@/lib/page-icons";
import { EditableText } from "./editable";

export interface Breadcrumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  breadcrumb?: Breadcrumb[];
  title: ReactNode;
  // Emoji before the title; `iconKey` reads it from page-icons.
  icon?: string;
  iconKey?: PageIconKey;
  // Makes the title an inline-editable text; an empty value reverts.
  onTitleChange?: (next: string) => void;
  titlePlaceholder?: string;
  meta?: ReactNode;
  properties?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export default function PageHeader({ breadcrumb, title, icon, iconKey, onTitleChange, titlePlaceholder, meta, properties, actions, className = "" }: PageHeaderProps) {
  const emoji = icon ?? (iconKey ? PAGE_ICONS[iconKey] : undefined);
  const editable = Boolean(onTitleChange) && typeof title === "string";
  return (
    <header className={cn("mb-4", className)}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Fil d'Ariane" className="mb-3 flex flex-wrap items-center gap-0.5 text-sm text-muted-foreground">
          {breadcrumb.map((crumb, i) => (
            <span key={`${crumb.label}-${i}`} className="flex items-center gap-0.5">
              {i > 0 && <span aria-hidden="true" className="px-0.5 text-icon">/</span>}
              {crumb.to ? (
                <Link to={crumb.to} className="inline-flex h-6 items-center rounded px-1 hover:bg-hover hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span className="inline-flex h-6 items-center px-1">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-h1 md:text-h1-lg">
            {emoji && <span className="shrink-0 text-[28px] leading-none md:text-[36px]" aria-hidden="true">{emoji}</span>}
            {editable ? (
              <EditableText
                value={title as string}
                onSave={(v) => { if (v.trim()) onTitleChange?.(v.trim()); }}
                placeholder={titlePlaceholder ?? "Sans titre"}
                className="min-w-0 flex-1 text-h1 md:text-h1-lg"
              />
            ) : (
              <span className="min-w-0">{title}</span>
            )}
          </h1>
          {meta && <div className="mt-1 text-base text-muted-foreground">{meta}</div>}
          {properties}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </div>
    </header>
  );
}
