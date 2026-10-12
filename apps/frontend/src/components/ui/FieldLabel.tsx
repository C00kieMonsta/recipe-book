import type { ReactNode } from "react";

export interface FieldLabelProps {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

// Form label; used only inside Dialogs, editor pages and the Login.
export default function FieldLabel({ children, htmlFor, className = "" }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className={`mb-1 block text-sm text-muted-foreground ${className}`}>
      {children}
    </label>
  );
}
