import Tag from "./Tag";
import { supplierColor } from "@/lib/recipe-helpers";

export interface SupplierTagProps {
  name: string;
  className?: string;
}

export default function SupplierTag({ name, className = "" }: SupplierTagProps) {
  if (!name) return null;
  const color = supplierColor(name);
  return (
    <Tag colour="gray" className={className}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
      {name}
    </Tag>
  );
}
