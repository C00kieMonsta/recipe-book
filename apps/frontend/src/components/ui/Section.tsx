import type { ReactNode } from "react";

export interface SectionProps {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Section({ title, meta, action, children, className = "" }: SectionProps) {
  return (
    <section className={`mt-block ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-h3">{title}</h2>
          {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
        </div>
        {action && <div className="flex items-center gap-2">{action}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
