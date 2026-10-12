import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

const BTN = "inline-flex h-7 min-w-7 items-center justify-center rounded px-1 text-sm text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40 touch:h-11 touch:min-w-11";

export default function Pagination({ page, totalPages, total, onPage, onPrev, onNext }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= page - 1 && i <= page + 1)) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "...") {
      pages.push("...");
    }
  }

  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 pt-4">
      <span className="text-sm text-muted-foreground">{total} résultats</span>
      <div className="flex items-center gap-0.5">
        <button type="button" onClick={onPrev} disabled={page <= 1} aria-label="Page précédente" className={BTN}>
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="px-1 text-sm text-muted-foreground" aria-hidden="true">…</span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => onPage(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? "page" : undefined}
              className={`${BTN} tabular-nums ${p === page ? "bg-active font-medium text-foreground" : ""}`}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" onClick={onNext} disabled={page >= totalPages} aria-label="Page suivante" className={BTN}>
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </nav>
  );
}
