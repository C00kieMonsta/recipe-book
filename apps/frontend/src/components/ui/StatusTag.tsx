import Tag, { type TagColour } from "./Tag";

export type TagStatus = "upcoming" | "completed" | "invoiced" | "deposit" | "paid" | "unpaid";

export interface StatusTagProps {
  status: TagStatus;
  label?: string;
  className?: string;
}

export const STATUS_TAG: Record<TagStatus, { label: string; colour: TagColour }> = {
  upcoming: { label: "À venir", colour: "blue" },
  completed: { label: "Terminé", colour: "green" },
  invoiced: { label: "Facturé", colour: "purple" },
  deposit: { label: "Acompte reçu", colour: "yellow" },
  paid: { label: "Payé", colour: "green" },
  unpaid: { label: "Impayée", colour: "red" },
};

export default function StatusTag({ status, label, className }: StatusTagProps) {
  const s = STATUS_TAG[status];
  return (
    <Tag colour={s.colour} className={className}>
      {label ?? s.label}
    </Tag>
  );
}
