import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({ page, pages, total, onPage }: { page: number; pages: number; total: number; onPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-sm text-slate-600">
      <span>{total} registro(s)</span>
      <div className="flex items-center gap-1">
        <button className="btn-icon" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Página anterior">
          <ChevronLeft size={18} />
        </button>
        <span className="px-2 tabular-nums">
          {page} / {Math.max(1, pages)}
        </span>
        <button className="btn-icon" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Página siguiente">
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
