import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SectionProps {
  title: ReactNode;
  meta?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function Section({ title, meta, action, children, className = "" }: SectionProps) {
  return (
    <section className={cn("mt-block", className)}>
      <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
          <h2 className="shrink-0 text-h3">{title}</h2>
          {meta && <span className="min-w-0 text-sm text-muted-foreground md:truncate">{meta}</span>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}
