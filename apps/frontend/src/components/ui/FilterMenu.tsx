import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import Button from "./Button";
import Checkbox from "./Checkbox";
import Sheet from "./Sheet";

export interface FilterOption {
  value: string;
  label: ReactNode;
}

type Draft = Record<string, string | string[]>;

interface FilterContextValue {
  touch: boolean;
  draft: Draft;
  setDraft: (name: string, value: string | string[]) => void;
  register: (name: string, onChange: (v: never) => void) => void;
}

const FilterContext = createContext<FilterContextValue | null>(null);

export interface FilterButtonProps {
  count: number;
  children: ReactNode;
  onClear?: () => void;
  title?: string;
  className?: string;
}

// "Filtrer" button; a 280px Menu panel on pointer, a Sheet with "Appliquer" on touch.
export function FilterButton({ count, children, onClear, title = "Filtrer", className }: FilterButtonProps) {
  const touch = useTouchScreen();
  const [open, setOpen] = useState(false);
  const [draft, setDraftState] = useState<Draft>({});
  const handlers = useRef<Record<string, (v: never) => void>>({});
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || touch) return;
    const down = (e: MouseEvent | TouchEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, touch]);

  useEffect(() => { if (!open) setDraftState({}); }, [open]);

  const ctx: FilterContextValue = {
    touch,
    draft,
    setDraft: (name, value) => setDraftState((d) => ({ ...d, [name]: value })),
    register: (name, onChange) => { handlers.current[name] = onChange; },
  };

  const apply = () => {
    for (const [name, value] of Object.entries(draft)) handlers.current[name]?.(value as never);
    setOpen(false);
  };

  const trigger = (
    <Button
      variant="subtle"
      size="sm"
      onClick={() => setOpen((o) => !o)}
      aria-haspopup="dialog"
      aria-expanded={open}
      icon={<SlidersHorizontal />}
      className={cn(count > 0 && "bg-selected text-primary hover:text-primary", className)}
    >
      {count > 0 ? `Filtrer · ${count}` : "Filtrer"}
    </Button>
  );

  if (touch) {
    return (
      <FilterContext.Provider value={ctx}>
        {trigger}
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title={title}
          headerRight={onClear ? <Button variant="subtle" size="sm" onClick={() => { onClear(); setOpen(false); }}>Effacer</Button> : undefined}
        >
          <div className="flex flex-col pb-2">{children}</div>
          <div className="px-4 pt-2">
            <Button variant="primary" size="lg" className="w-full" onClick={apply}>Appliquer</Button>
          </div>
        </Sheet>
      </FilterContext.Provider>
    );
  }

  return (
    <FilterContext.Provider value={ctx}>
      <div ref={wrapRef} className="relative inline-flex">
        {trigger}
        {open && (
          <div role="dialog" aria-label={title} className="absolute right-0 top-full z-50 mt-1 w-[280px] rounded-lg bg-background py-1 shadow-menu animate-pop">
            {children}
            {count > 0 && onClear && (
              <>
                <div className="my-1 h-px bg-border" />
                <div className="px-1">
                  <Button variant="subtle" size="sm" onClick={() => { onClear(); setOpen(false); }}>Effacer les filtres</Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </FilterContext.Provider>
  );
}

interface FilterGroupBase {
  label?: ReactNode;
  // Key used on touch while choices wait for "Appliquer"; defaults to the label.
  name?: string;
  options: FilterOption[];
  renderOption?: (o: FilterOption) => ReactNode;
  className?: string;
}

export type FilterGroupProps = FilterGroupBase & (
  | { kind: "radio"; value: string; onChange: (v: string) => void }
  | { kind: "check"; value: string[]; onChange: (v: string[]) => void }
);

export function FilterGroup(props: FilterGroupProps) {
  const ctx = useContext(FilterContext);
  const { label, options, renderOption, className, kind } = props;
  const name = props.name ?? (typeof label === "string" ? label : "group");
  const touch = ctx?.touch ?? false;

  useEffect(() => { ctx?.register(name, props.onChange as (v: never) => void); });

  const current = touch && ctx && name in ctx.draft ? ctx.draft[name] : props.value;
  const isOn = (v: string) => (kind === "radio" ? current === v : (current as string[]).includes(v));
  const choose = (v: string) => {
    const next = kind === "radio" ? v : isOn(v) ? (current as string[]).filter((x) => x !== v) : [...(current as string[]), v];
    if (touch && ctx) ctx.setDraft(name, next);
    else (props.onChange as (x: string | string[]) => void)(next);
  };

  return (
    <div role="group" className={cn("py-1 [&+&]:border-t [&+&]:border-border", className)}>
      {label && <div className={cn("flex h-7 items-center px-2 text-caption text-muted-foreground", touch && "px-4")}>{label}</div>}
      {options.map((o) => (
        <Checkbox
          key={o.value}
          shape={kind === "radio" ? "circle" : "square"}
          checked={isOn(o.value)}
          onChange={() => choose(o.value)}
          label={renderOption ? renderOption(o) : o.label}
          className={cn("mx-1 flex h-8 w-auto items-center gap-2 rounded px-2 text-sm hover:bg-hover", touch && "mx-0 h-11 rounded-none px-4 text-base")}
        />
      ))}
    </div>
  );
}

export { FilterChip } from "./Toolbar";
