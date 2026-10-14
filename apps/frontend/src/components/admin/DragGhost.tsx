import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PrepStatus } from "@packages/types";
import { shortDayLabel } from "@packages/types";
import { Dot } from "@/components/admin/StatusDot";

export interface DragGhostProps {
  // Pointer position from useLongPressDrag; null hides the ghost.
  point: { x: number; y: number } | null;
  status: PrepStatus;
  label: string;
  // The day under the finger.
  target: string | null;
}

const MAX_LABEL = 24;
const OFFSET_X = 24;
const OFFSET_Y = 56;
const EDGE = 8;

export function ghostLabel(label: string): string {
  return label.length > MAX_LABEL ? `${label.slice(0, MAX_LABEL - 1).trimEnd()}…` : label;
}

// The lifted row, drawn above and left of the finger so it stays visible.
export default function DragGhost({ point, status, label, target }: DragGhostProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Keeps the ghost inside the viewport near the right edge.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !point) return;
    const max = window.innerWidth - el.offsetWidth - EDGE;
    el.style.left = `${Math.max(EDGE, Math.min(point.x - OFFSET_X, max))}px`;
  });

  if (!point) return null;

  return createPortal(
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none fixed z-50 flex h-11 max-w-[calc(100vw-16px)] items-center gap-2 rounded-lg bg-background px-3 text-sm shadow-dialog"
      style={{ left: point.x - OFFSET_X, top: point.y - OFFSET_Y }}
    >
      <Dot status={status} />
      <span className="min-w-0 truncate">{ghostLabel(label)}</span>
      {target ? (
        <span className="shrink-0 whitespace-nowrap font-medium">→ {shortDayLabel(target)}</span>
      ) : (
        <span className="shrink-0 whitespace-nowrap text-muted-foreground">Déposez sur un jour</span>
      )}
    </div>,
    document.body,
  );
}
