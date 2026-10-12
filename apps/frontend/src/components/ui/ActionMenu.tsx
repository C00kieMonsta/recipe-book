import type { ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { IconButton } from "./Button";
import { Menu, MenuCheck, MenuItem, MenuSection, MenuSeparator, useMenu } from "./Menu";

export type ActionMenuItem =
  | { kind?: "item"; label: string; icon?: ReactNode; onClick: () => void; variant?: "default" | "danger"; disabled?: boolean }
  | { kind: "separator" }
  | { kind: "check"; label: string; icon?: ReactNode; checked: boolean; onClick: () => void }
  | { kind: "section"; label: string };

export interface ActionMenuProps {
  items: ActionMenuItem[];
  align?: "left" | "right";
  "aria-label"?: string;
  // Sheet title on touch screens.
  title?: string;
  className?: string;
}

export default function ActionMenu({ items, align = "right", "aria-label": ariaLabel = "Plus d'actions", title, className }: ActionMenuProps) {
  const menu = useMenu();
  return (
    <div ref={menu.ref} className={`relative inline-flex ${className ?? ""}`}>
      <IconButton
        size="sm"
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        onClick={menu.toggle}
        icon={<MoreHorizontal />}
      />
      <Menu {...menu.props} align={align} title={title} aria-label={ariaLabel}>
        {items.map((item, i) => {
          if (item.kind === "separator") return <MenuSeparator key={i} />;
          if (item.kind === "section") return <MenuSection key={i} label={item.label}>{null}</MenuSection>;
          if (item.kind === "check") {
            return <MenuCheck key={i} checked={item.checked} onChange={() => item.onClick()} icon={item.icon}>{item.label}</MenuCheck>;
          }
          return (
            <MenuItem key={i} icon={item.icon} onSelect={item.onClick} danger={item.variant === "danger"} disabled={item.disabled}>
              {item.label}
            </MenuItem>
          );
        })}
      </Menu>
    </div>
  );
}
