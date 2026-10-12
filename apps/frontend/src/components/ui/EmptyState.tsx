import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import Button from "./Button";

export interface EmptyStateProps {
  children?: ReactNode;
  message?: ReactNode;
  action?: { label: ReactNode; to?: string; onClick?: () => void };
  className?: string;
}

export default function EmptyState({ children, message, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center gap-2 py-10 text-center", className)}>
      <p className="text-sm text-muted-foreground touch:text-base">{message ?? children}</p>
      {action && (action.to ? (
        <Button as={Link} to={action.to} variant="link" size="sm">{action.label}</Button>
      ) : (
        <Button variant="link" size="sm" onClick={action.onClick}>{action.label}</Button>
      ))}
    </div>
  );
}
