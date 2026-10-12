import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

export const BUTTON_BASE = "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium leading-none transition-colors select-none disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:shadow-ring";
export const BUTTON_SIZE = {
  sm: "h-7 px-2 text-sm touch:h-11 touch:px-3 touch:text-base",       // toolbar, row actions
  md: "h-8 px-2.5 text-sm touch:h-11 touch:px-3.5 touch:text-base",   // section actions, dialog footer
  lg: "h-9 px-3 text-base touch:h-11 touch:px-4",                     // page primary, login
};
export const BUTTON_VARIANT = {
  primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
  default: "bg-background text-foreground shadow-outline hover:bg-hover",
  ghost: "text-foreground hover:bg-hover",
  subtle: "text-muted-foreground hover:bg-hover hover:text-foreground",
  link: "text-primary hover:bg-selected",
  danger: "bg-background text-danger shadow-outline hover:bg-danger-soft",
};

export type ButtonVariant = keyof typeof BUTTON_VARIANT;
export type ButtonSize = keyof typeof BUTTON_SIZE;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  as?: "button" | "a" | typeof Link;
  to?: string;
  href?: string;
  target?: string;
  rel?: string;
  download?: string | boolean;
}

export const ICON_SIZE = "h-4 w-4 touch:h-5 touch:w-5";

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "default", size = "md", icon, as = "button", to, href, target, rel, download, className, children, type, ...rest },
  ref,
) {
  const classes = cn(BUTTON_BASE, BUTTON_SIZE[size], BUTTON_VARIANT[variant], className);
  const content = (
    <>
      {icon && <span className={cn("shrink-0 [&>svg]:h-4 [&>svg]:w-4 touch:[&>svg]:h-5 touch:[&>svg]:w-5")} aria-hidden="true">{icon}</span>}
      {children}
    </>
  );
  if (as === Link && to) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkProps = rest as any;
    return (
      <Link to={to} className={classes} target={target} rel={rel} {...linkProps}>
        {content}
      </Link>
    );
  }
  if (as === "a") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anchorProps = rest as any;
    return (
      <a href={href} className={classes} target={target} rel={rel} download={download} {...anchorProps}>
        {content}
      </a>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} {...rest}>
      {content}
    </button>
  );
});

export default Button;

export const ICON_BUTTON_SIZE = {
  sm: "h-7 w-7 touch:h-11 touch:w-11",
  md: "h-8 w-8 touch:h-11 touch:w-11",
  lg: "h-9 w-9 touch:h-11 touch:w-11",
};

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  "aria-label": string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  children?: ReactNode;
  as?: "button" | "a" | typeof Link;
  to?: string;
  href?: string;
  target?: string;
  rel?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = "ghost", size = "sm", icon, children, className, as = "button", to, href, target, rel, type, ...rest },
  ref,
) {
  const classes = cn(
    BUTTON_BASE,
    "shrink-0 p-0 text-icon hover:text-foreground [&>svg]:h-4 [&>svg]:w-4 touch:[&>svg]:h-5 touch:[&>svg]:w-5",
    ICON_BUTTON_SIZE[size],
    BUTTON_VARIANT[variant],
    variant === "ghost" || variant === "subtle" ? "text-icon" : "",
    className,
  );
  const content = icon ?? children;
  if (as === Link && to) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const linkProps = rest as any;
    return (
      <Link to={to} className={classes} target={target} rel={rel} {...linkProps}>
        {content}
      </Link>
    );
  }
  if (as === "a") {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const anchorProps = rest as any;
    return (
      <a href={href} className={classes} target={target} rel={rel} {...anchorProps}>
        {content}
      </a>
    );
  }
  return (
    <button ref={ref} type={type ?? "button"} className={classes} {...rest}>
      {content}
    </button>
  );
});
