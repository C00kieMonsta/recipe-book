import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import Tag, { type TagColour } from "./Tag";
import { Menu, MenuRadio, useMenu } from "./Menu";

export interface SelectPillOption {
  value: string;
  label: ReactNode;
  colour?: TagColour;
  // Tailwind class or CSS colour for an 8px dot inside the tag.
  dot?: string;
}

export interface SelectPillProps {
  value: string;
  options: SelectPillOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  align?: "left" | "right";
  // Default colour for options without one.
  colour?: TagColour;
  title?: string;
  className?: string;
  "aria-label"?: string;
}

const isCssColour = (s: string) => /^(#|rgb|hsl)/.test(s);

export function PillTag({ option, colour }: { option: SelectPillOption; colour?: TagColour }) {
  return (
    <Tag colour={option.colour ?? colour ?? "gray"}>
      {option.dot && (
        <span
          aria-hidden="true"
          className={cn("h-2 w-2 shrink-0 rounded-full", !isCssColour(option.dot) && option.dot)}
          style={isCssColour(option.dot) ? { background: option.dot } : undefined}
        />
      )}
      {option.label}
    </Tag>
  );
}

export default function SelectPill({ value, options, onChange, placeholder = "Choisir", align = "left", colour, title, className, "aria-label": ariaLabel }: SelectPillProps) {
  const menu = useMenu();
  const current = options.find((o) => o.value === value);
  return (
    <div ref={menu.ref} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={menu.toggle}
        aria-haspopup="menu"
        aria-expanded={menu.open}
        aria-label={ariaLabel}
        title={title}
        className="group -mx-1 inline-flex h-7 items-center gap-1 rounded px-1 hover:bg-hover touch:h-11"
      >
        {current ? <PillTag option={current} colour={colour} /> : <span className="text-sm text-placeholder">{placeholder}</span>}
        <ChevronDown className="h-3 w-3 text-icon reveal" aria-hidden="true" />
      </button>
      <Menu {...menu.props} align={align} title={title ?? ariaLabel}>
        {options.map((o) => (
          <MenuRadio key={o.value} checked={o.value === value} onSelect={() => { if (o.value !== value) onChange(o.value); }}>
            <PillTag option={o} colour={colour} />
          </MenuRadio>
        ))}
      </Menu>
    </div>
  );
}
