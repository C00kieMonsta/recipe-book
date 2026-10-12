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
    <Tag variant="supplier" tint={color} className={className}>
      <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: color }} aria-hidden="true" />
      {name}
    </Tag>
  );
}
