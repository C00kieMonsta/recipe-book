import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

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
    <div className="flex items-center justify-between pt-4">
      <span className="text-xs text-muted-foreground">{total} résultats</span>
      <div className="flex items-center gap-1">
        <button onClick={onPrev} disabled={page <= 1} className="p-1.5 rounded-md border text-sm disabled:opacity-30 hover:bg-muted transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`e${i}`} className="px-2 text-xs text-muted-foreground">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onPage(p)}
              className={`w-8 h-8 rounded-md text-xs font-medium transition-colors ${p === page ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              {p}
            </button>
          ),
        )}
        <button onClick={onNext} disabled={page >= totalPages} className="p-1.5 rounded-md border text-sm disabled:opacity-30 hover:bg-muted transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
