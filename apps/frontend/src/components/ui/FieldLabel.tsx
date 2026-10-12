import type { ReactNode } from "react";

export interface FieldLabelProps {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}

export default function FieldLabel({ children, htmlFor, className = "" }: FieldLabelProps) {
  return (
    <label htmlFor={htmlFor} className={`mb-1 block text-base font-medium text-foreground ${className}`}>
      {children}
    </label>
  );
}
