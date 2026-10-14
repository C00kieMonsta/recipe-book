import { Fragment, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import ListRow from "./ListRow";

export interface TableColumn<T> {
  key: string;
  label?: ReactNode;
  width?: string;
  align?: "left" | "right" | "center";
  render?: (row: T) => ReactNode;
  // Phone list: shown on the right of the row (amount, status tag).
  trailing?: boolean;
  className?: string;
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey?: (row: T, index: number) => string;
  onRowClick?: (row: T) => void;
  rowHref?: (row: T) => string;
  // Cells for the tfoot row, by column key.
  footer?: Partial<Record<string, ReactNode>>;
  groupBy?: (row: T) => string;
  empty?: ReactNode;
  className?: string;
}

const ALIGN = { left: "text-left", right: "text-right", center: "text-center" };

function cell<T>(col: TableColumn<T>, row: T): ReactNode {
  if (col.render) return col.render(row);
  const v = (row as Record<string, unknown>)[col.key];
  return v === null || v === undefined ? "" : String(v);
}

// Database table on md and up; ListRows below md.
export default function Table<T>({ columns, rows, rowKey, onRowClick, rowHref, footer, groupBy, empty, className }: TableProps<T>) {
  const navigate = useNavigate();
  const key = (row: T, i: number) => (rowKey ? rowKey(row, i) : String(i));
  const groups: { label: string | null; rows: T[] }[] = [];
  if (groupBy) {
    for (const row of rows) {
      const g = groupBy(row);
      const last = groups[groups.length - 1];
      if (last && last.label === g) last.rows.push(row);
      else groups.push({ label: g, rows: [row] });
    }
  } else {
    groups.push({ label: null, rows });
  }
  const interactive = Boolean(onRowClick || rowHref);
  const phoneTitle = columns[0];
  const phoneSub = columns.slice(1).filter((c) => !c.trailing).slice(0, 2);
  const phoneTrailing = columns.filter((c) => c.trailing);

  const phoneFooter = columns.filter((c, i) => i === 0 || c.trailing);

  // The link goes in the first cell with content, so an empty number column does not get an invisible focus target.
  const linkColumn = (row: T) => {
    const i = columns.findIndex((c) => { const v = cell(c, row); return v !== "" && v !== null && v !== undefined && v !== false; });
    return i < 0 ? 0 : i;
  };

  // That cell carries a real link or button so the keyboard reaches the row.
  const titleCell = (content: ReactNode, row: T) => {
    if (rowHref) {
      return (
        <Link to={rowHref(row)} className="rounded focus-visible:outline-none focus-visible:shadow-ring" onClick={(e) => { e.stopPropagation(); onRowClick?.(row); }}>
          {content}
        </Link>
      );
    }
    return (
      <button type="button" className="rounded text-left focus-visible:outline-none focus-visible:shadow-ring" onClick={(e) => { e.stopPropagation(); onRowClick?.(row); }}>
        {content}
      </button>
    );
  };

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <>
      <div className={cn("hidden md:block", className)}>
        <table className="table">
          <thead className="sticky top-0 bg-background">
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={c.width ? { width: c.width } : undefined} className={cn(ALIGN[c.align ?? "left"], c.className)}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g, gi) => (
              <Fragment key={g.label ?? gi}>
                {g.label !== null && (
                  <tr className="[&>td]:hover:bg-transparent">
                    <td colSpan={columns.length} className="h-auto border-b-0 pt-3 text-sm font-medium text-muted-foreground">{g.label}</td>
                  </tr>
                )}
                {g.rows.map((row, i) => (
                  <tr
                    key={key(row, i)}
                    className={cn(interactive && "cursor-pointer")}
                    onClick={interactive ? () => { onRowClick?.(row); if (rowHref) navigate(rowHref(row)); } : undefined}
                  >
                    {columns.map((c, ci) => (
                      <td key={c.key} className={cn(ALIGN[c.align ?? "left"], c.align === "right" && "tabular-nums", c.className)}>
                        {interactive && ci === linkColumn(row) ? titleCell(cell(c, row), row) : cell(c, row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {footer && (
            <tfoot>
              <tr>
                {columns.map((c) => (
                  <td key={c.key} className={cn(ALIGN[c.align ?? "left"], c.align === "right" && "tabular-nums")}>{footer[c.key]}</td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div className={cn("md:hidden", className)}>
        {groups.map((g, gi) => (
          <Fragment key={g.label ?? gi}>
            {g.label !== null && <div className="pb-1 pt-3 text-sm font-medium text-muted-foreground">{g.label}</div>}
            <div className="divide-y divide-border">
              {g.rows.map((row, i) => {
                const sub = phoneSub.map((c) => cell(c, row)).filter((v) => v !== "" && v !== null && v !== undefined);
                return (
                  <ListRow
                    key={key(row, i)}
                    title={cell(phoneTitle, row)}
                    subtitle={sub.length ? sub.map((v, j) => <Fragment key={j}>{j > 0 && " · "}{v}</Fragment>) : undefined}
                    trailing={phoneTrailing.length ? phoneTrailing.map((c) => <Fragment key={c.key}>{cell(c, row)}</Fragment>) : undefined}
                    to={rowHref ? rowHref(row) : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  />
                );
              })}
            </div>
          </Fragment>
        ))}
        {footer && (
          <div className="mt-1 flex items-center justify-between border-t border-divider pt-2 text-sm font-semibold">
            {phoneFooter.filter((c) => footer[c.key] !== undefined).map((c) => <span key={c.key} className={cn(c.align === "right" && "tabular-nums")}>{footer[c.key]}</span>)}
          </div>
        )}
      </div>
    </>
  );
}
