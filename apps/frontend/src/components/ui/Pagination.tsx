import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

const BTN = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-sm font-medium transition-colors disabled:opacity-40";
const ARROW = `${BTN} border border-input bg-card text-foreground hover:bg-hover disabled:hover:bg-card`;

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
      <div className="flex items-center gap-1">
        <button type="button" onClick={onPrev} disabled={page <= 1} aria-label="Page précédente" className={ARROW}>
          <ChevronLeft className="h-5 w-5" />
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
              className={`${BTN} ${p === page ? "bg-active font-medium text-foreground" : "hover:bg-hover"}`}
            >
              {p}
            </button>
          ),
        )}
        <button type="button" onClick={onNext} disabled={page >= totalPages} aria-label="Page suivante" className={ARROW}>
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </nav>
  );
}
