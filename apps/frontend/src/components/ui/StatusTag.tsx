import Tag, { type TagVariant } from "./Tag";

export type TagStatus = "upcoming" | "completed" | "invoiced" | "deposit" | "paid";

export interface StatusTagProps {
  status: TagStatus;
  label?: string;
  className?: string;
}

const STATUS: Record<TagStatus, { label: string; variant: TagVariant }> = {
  upcoming: { label: "À venir", variant: "info" },
  completed: { label: "Terminé", variant: "success" },
  invoiced: { label: "Facturé", variant: "primary" },
  deposit: { label: "Acompte reçu", variant: "warning" },
  paid: { label: "Payé", variant: "success" },
};

export default function StatusTag({ status, label, className }: StatusTagProps) {
  const s = STATUS[status];
  return (
    <Tag variant={s.variant} className={className}>
      {label ?? s.label}
    </Tag>
  );
}
