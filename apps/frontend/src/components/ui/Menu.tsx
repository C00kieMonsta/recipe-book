import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { Link } from "react-router-dom";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import Sheet from "./Sheet";

interface MenuContextValue {
  close: () => void;
  touch: boolean;
}

const MenuContext = createContext<MenuContextValue>({ close: () => {}, touch: false });

export interface MenuProps {
  open: boolean;
  onClose: () => void;
  // Clicks inside this element do not close the menu (the trigger wrapper).
  anchorRef?: RefObject<HTMLElement>;
  align?: "left" | "right";
  // Sheet title on touch screens.
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

// Owns the open state and the wrapper ref; spread `props` on the Menu.
export function useMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  return { open, setOpen, close, toggle, ref, props: { open, onClose: close, anchorRef: ref } };
}

export function Menu({ open, onClose, anchorRef, align = "left", title, children, className, "aria-label": ariaLabel }: MenuProps) {
  const touch = useTouchScreen();
  const panelRef = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState(false);

  // Open upwards when the panel would run past the viewport bottom.
  useLayoutEffect(() => {
    if (!open || touch) { setFlip(false); return; }
    const panel = panelRef.current;
    const anchor = anchorRef?.current;
    if (!panel || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const h = panel.offsetHeight + 4;
    setFlip(a.bottom + h > window.innerHeight && a.top - h >= 0);
  }, [open, touch, anchorRef]);

  useEffect(() => {
    if (!open || touch) return;
    const down = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (panelRef.current?.contains(t) || anchorRef?.current?.contains(t)) return;
      onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("touchstart", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("touchstart", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, touch, onClose, anchorRef]);

  if (!open) return null;

  if (touch) {
    return (
      <MenuContext.Provider value={{ close: onClose, touch: true }}>
        <Sheet open onClose={onClose} title={title} aria-label={ariaLabel}>
          <div role="menu" className="flex flex-col py-1">{children}</div>
        </Sheet>
      </MenuContext.Provider>
    );
  }

  return (
    <MenuContext.Provider value={{ close: onClose, touch: false }}>
      <div
        ref={panelRef}
        role="menu"
        aria-label={ariaLabel}
        className={cn(
          "absolute z-50 min-w-[200px] max-w-[320px] rounded-lg bg-background py-1 shadow-menu animate-pop",
          flip ? "bottom-full mb-1" : "top-full mt-1",
          align === "right" ? "right-0" : "left-0",
          className,
        )}
      >
        {children}
      </div>
    </MenuContext.Provider>
  );
}

export const MENU_ITEM = "mx-1 flex h-7 cursor-pointer items-center gap-2 rounded px-2 text-left text-sm hover:bg-hover aria-selected:bg-hover disabled:pointer-events-none disabled:opacity-50";
export const MENU_ITEM_TOUCH = "mx-0 h-11 rounded-none px-4 text-base";

export interface MenuItemProps {
  icon?: ReactNode;
  children: ReactNode;
  trailing?: ReactNode;
  onSelect?: () => void;
  to?: string;
  href?: string;
  danger?: boolean;
  selected?: boolean;
  disabled?: boolean;
  closeOnSelect?: boolean;
  className?: string;
}

export function MenuItem({ icon, children, trailing, onSelect, to, href, danger = false, selected = false, disabled = false, closeOnSelect = true, className }: MenuItemProps) {
  const { close, touch } = useContext(MenuContext);
  const classes = cn(MENU_ITEM, touch && MENU_ITEM_TOUCH, danger && "text-danger hover:bg-danger-soft", className);
  const content = (
    <>
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-icon [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {trailing && <span className="shrink-0 text-caption text-muted-foreground">{trailing}</span>}
    </>
  );
  const handle = () => { onSelect?.(); if (closeOnSelect) close(); };
  if (to) {
    return (
      <Link to={to} role="menuitem" className={classes} onClick={handle} aria-selected={selected || undefined}>
        {content}
      </Link>
    );
  }
  if (href) {
    return (
      <a href={href} role="menuitem" className={classes} onClick={handle} aria-selected={selected || undefined} target="_blank" rel="noreferrer">
        {content}
      </a>
    );
  }
  return (
    <button type="button" role="menuitem" className={classes} onClick={handle} disabled={disabled} aria-selected={selected || undefined}>
      {content}
    </button>
  );
}

export interface MenuRadioProps {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

// A choice with the check on the right; closes on selection.
export function MenuRadio({ checked, onSelect, children, icon, className }: MenuRadioProps) {
  const { close, touch } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={checked}
      className={cn(MENU_ITEM, touch && MENU_ITEM_TOUCH, className)}
      onClick={() => { onSelect(); close(); }}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-icon [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {checked && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

export interface MenuCheckProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}

// A toggle with the check on the right; stays open.
export function MenuCheck({ checked, onChange, children, icon, className }: MenuCheckProps) {
  const { touch } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={checked}
      className={cn(MENU_ITEM, touch && MENU_ITEM_TOUCH, className)}
      onClick={() => onChange(!checked)}
    >
      {icon && <span className="flex h-4 w-4 shrink-0 items-center justify-center text-icon [&>svg]:h-4 [&>svg]:w-4" aria-hidden="true">{icon}</span>}
      <span className="flex-1 truncate">{children}</span>
      {checked && <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-border" />;
}

export function MenuSection({ label, children }: { label?: ReactNode; children: ReactNode }) {
  const { touch } = useContext(MenuContext);
  return (
    <div role="group">
      {label && <div className={cn("px-3 pb-1 pt-2 text-caption text-muted-foreground", touch && "px-4")}>{label}</div>}
      {children}
    </div>
  );
}

export function useMenuContext() {
  return useContext(MenuContext);
}
