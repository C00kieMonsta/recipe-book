import type { ReactNode } from "react";

export type TagColour = "gray" | "brown" | "orange" | "yellow" | "green" | "blue" | "purple" | "pink" | "red";
// Old names; alias for one release.
export type TagVariant = "neutral" | "primary" | "success" | "warning" | "info" | "danger" | "supplier";

export interface TagProps {
  colour?: TagColour;
  variant?: TagVariant;
  children: ReactNode;
  className?: string;
  title?: string;
}

export const TAG_COLOUR_CLASS: Record<TagColour, string> = {
  gray: "bg-tag-gray-bg text-tag-gray-fg",
  brown: "bg-tag-brown-bg text-tag-brown-fg",
  orange: "bg-tag-orange-bg text-tag-orange-fg",
  yellow: "bg-tag-yellow-bg text-tag-yellow-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  purple: "bg-tag-purple-bg text-tag-purple-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  red: "bg-tag-red-bg text-tag-red-fg",
};

const VARIANT_TO_COLOUR: Record<TagVariant, TagColour> = {
  neutral: "gray",
  primary: "blue",
  success: "green",
  warning: "yellow",
  info: "blue",
  danger: "red",
  supplier: "gray",
};

export const TAG_BASE = "inline-flex h-5 max-w-full items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-sm leading-none";

export default function Tag({ colour, variant, children, className = "", title }: TagProps) {
  const c: TagColour = colour ?? (variant ? VARIANT_TO_COLOUR[variant] : "gray");
  return (
    <span className={`${TAG_BASE} ${TAG_COLOUR_CLASS[c]} ${className}`} title={title}>
      {children}
    </span>
  );
}
