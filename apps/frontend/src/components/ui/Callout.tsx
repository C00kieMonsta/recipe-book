import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import Tag from "./Tag";

export interface CalloutProps {
  emoji?: string;
  title?: ReactNode;
  count?: number;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  tone?: "default" | "success" | "warning" | "danger";
  children?: ReactNode;
  className?: string;
}

const TONE = {
  default: "bg-callout",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export default function Callout({ emoji, title, count, collapsible = false, open = true, onToggle, tone = "default", children, className }: CalloutProps) {
  const showBody = !collapsible || open;
  return (
    <div className={cn("callout flex gap-3", TONE[tone], className)}>
      {emoji && <span className="text-[20px] leading-none" aria-hidden="true">{emoji}</span>}
      <div className="min-w-0 flex-1">
        {title !== undefined && (
          collapsible ? (
            <button type="button" onClick={onToggle} aria-expanded={open} className="flex h-7 w-full items-center gap-2 text-left text-sm font-medium touch:h-11">
              <ChevronRight className={cn("h-4 w-4 shrink-0 text-icon transition-transform", open && "rotate-90")} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {count !== undefined && <Tag colour="gray">{count}</Tag>}
            </button>
          ) : (
            <div className="flex h-7 items-center gap-2 text-sm font-medium touch:h-11">
              <span className="min-w-0 flex-1 truncate">{title}</span>
              {count !== undefined && <Tag colour="gray">{count}</Tag>}
            </div>
          )
        )}
        {showBody && children && <div className={cn("text-sm touch:text-base", title !== undefined && "mt-1")}>{children}</div>}
      </div>
    </div>
  );
}
