import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, ChevronUp } from "lucide-react";
import type { ChecklistItem, GroceryList, PrestationTypeSetting } from "@packages/types";
import { checklistCount, parseYmd, rangeLabel } from "@packages/types";
import { fmtEur0, plural } from "@/lib/use-planning-data";
import { Dot } from "./StatusDot";

export interface WeekChecklistProps {
  items: ChecklistItem[];
  open: boolean;
  onToggle: () => void;
  // Location to return to, passed as state.from on every link.
  from: string;
  monday: string;
  prestationTypes: PrestationTypeSetting[];
  // Newest list covering the week, shown as a muted row when nothing is uncovered.
  coveringList?: Pick<GroceryList, "listId" | "range">;
  busy: boolean;
  onCreateClientWeek: (clientId: string, guestCount: number) => void;
  onSetType: (eventId: string, type: PrestationTypeSetting) => Promise<void>;
  onAssign: () => void;
  onCreateGroceries: (eventIds: string[]) => void;
  onCloseEvent: (eventId: string) => Promise<void>;
}

const ACTION = "ml-auto inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg px-2 text-base font-medium text-primary hover:bg-hover disabled:opacity-50 touch:min-h-11";
const ROW = "flex min-h-10 items-center gap-2 text-base";

const monthName = new Intl.DateTimeFormat("fr-BE", { month: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("fr-BE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function ymLabel(ym: string): string {
  return monthName.format(parseYmd(`${ym}-01`));
}

export default function WeekChecklist(props: WeekChecklistProps) {
  const { items, open, onToggle, from, coveringList } = props;
  const count = checklistCount(items);
  const state = { from };
  const notConfigured = items.find((i) => i.kind === "not_configured");
  const retour = encodeURIComponent(from.split("?")[0]);

  const notConfiguredRow = notConfigured && notConfigured.kind === "not_configured" && (
    <li className={`${ROW} text-muted-foreground`}>
      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0">
        {notConfigured.clients && notConfigured.ledger
          ? "Clients et comptabilité non configurés"
          : notConfigured.clients ? "Clients non configurés" : "Comptabilité non configurée"}
      </span>
      <Link to="/settings#apropos" state={state} className={ACTION}>Paramètres <ChevronRight className="h-4 w-4" aria-hidden="true" /></Link>
    </li>
  );

  if (count === 0) {
    return (
      <section aria-live="polite" aria-label="À faire avant la semaine" className="card-elevated p-3">
        <p className="flex min-h-11 items-center rounded-lg bg-success-soft px-3 text-base">Semaine prête, rien à faire avant lundi</p>
        {notConfiguredRow && <ul className="mt-1">{notConfiguredRow}</ul>}
      </section>
    );
  }

  if (!open) {
    return (
      <section aria-live="polite" className="card-elevated p-3">
        <button type="button" onClick={onToggle} aria-expanded={false} className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-1 text-left hover:bg-hover">
          <span className="text-h3">À faire avant la semaine · {count}</span>
          <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </section>
    );
  }

  return (
    <section aria-live="polite" className="card-elevated p-3">
      <div className="flex min-h-9 items-center justify-between gap-2 px-1">
        <h2 className="text-h3">À faire avant la semaine · {count}</h2>
        <button type="button" onClick={onToggle} aria-expanded className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-base text-muted-foreground hover:bg-hover touch:min-h-11">
          Réduire <ChevronUp className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="grid gap-x-6 xl:grid-cols-2">
        {items.map((item, i) => {
          if (item.kind === "not_configured") return null;
          return <ChecklistRow key={i} item={item} {...props} state={state} retour={retour} />;
        })}
        {coveringList && !items.some((i) => i.kind === "groceries") && (
          <li className={`${ROW} text-muted-foreground`}>
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
            <Link to={`/grocery-list?id=${coveringList.listId}`} state={state} className="inline-flex min-h-10 items-center gap-1 rounded-lg hover:bg-hover">
              Courses · liste{coveringList.range ? ` du ${rangeLabel(coveringList.range.from, coveringList.range.to)}` : ""}
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </li>
        )}
        {notConfiguredRow}
      </ul>
    </section>
  );
}

type RowProps = WeekChecklistProps & { item: ChecklistItem; state: { from: string }; retour: string };

function ChecklistRow({ item, state, retour, monday, prestationTypes, busy, onCreateClientWeek, onSetType, onAssign, onCreateGroceries, onCloseEvent }: RowProps) {
  const [closing, setClosing] = useState<string | null>(null);
  const dot = <Dot status="todo" />;

  switch (item.kind) {
    case "client_week":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{item.clientName} : {plural(item.missingDays, "jour")} sans événement</span>
          <button type="button" disabled={busy} onClick={() => onCreateClientWeek(item.clientId, item.guestCount)} className={ACTION}>Créer la semaine</button>
        </li>
      );
    case "no_menu":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{item.name} : aucune recette au menu</span>
          <Link to={`/events/${item.eventId}?ajouter=1#menu`} state={state} className={ACTION}>Ajouter</Link>
        </li>
      );
    case "no_price":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{item.name} : prix non fixé</span>
          <Link to={`/events/${item.eventId}?focus=prix`} state={state} className={ACTION}>Fixer</Link>
        </li>
      );
    case "no_type":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{item.name} : type de prestation manquant</span>
          <select
            aria-label={`Type de prestation de ${item.name}`}
            value=""
            disabled={busy}
            onChange={(e) => {
              const type = prestationTypes.find((t) => t.key === e.target.value);
              if (type) void onSetType(item.eventId, type);
            }}
            className="ml-auto min-h-10 shrink-0 rounded-lg border border-input bg-card px-2 text-base font-medium text-primary touch:min-h-11"
          >
            <option value="">Choisir</option>
            {prestationTypes.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
        </li>
      );
    case "unassigned":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{plural(item.lineCount, "ligne")} sans personne ({plural(item.eventCount, "événement")})</span>
          <button type="button" onClick={onAssign} className={ACTION}>Assigner</button>
        </li>
      );
    case "groceries":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">
            {item.partial
              ? `Courses : ${plural(item.uncoveredEventIds.length, "événement")} sans liste`
              : `Courses non créées (${item.uncoveredEventIds.length} évén.)`}
          </span>
          <button type="button" disabled={busy} onClick={() => onCreateGroceries(item.uncoveredEventIds)} className={ACTION}>Créer</button>
        </li>
      );
    case "to_close":
      return (
        <li className="xl:col-span-2">
          <div className={ROW}>
            {dot}
            <span className="min-w-0">{plural(item.events.length, "événement passé", "événements passés")} à terminer</span>
          </div>
          <ul className="pl-6">
            {item.events.map((ev) => (
              <li key={ev.eventId} className={ROW}>
                <Link to={`/events/${ev.eventId}`} state={state} className="min-w-0 truncate rounded hover:underline underline-offset-4">
                  {ev.name} · {shortDate.format(parseYmd(ev.date.slice(0, 10)))}
                </Link>
                <button
                  type="button"
                  disabled={busy || closing === ev.eventId}
                  onClick={() => { setClosing(ev.eventId); onCloseEvent(ev.eventId).finally(() => setClosing(null)); }}
                  className={ACTION}
                >
                  Terminer
                </button>
              </li>
            ))}
          </ul>
        </li>
      );
    case "to_invoice":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{item.name} · {fmtEur0(item.htva)}</span>
          <Link to={`/events/${item.eventId}?facturer=1#facturation`} state={state} className={ACTION}>Facturer</Link>
        </li>
      );
    case "to_invoice_many":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{item.count} événements terminés à facturer · {fmtEur0(item.htva)}</span>
          <Link to="/comptes/a-facturer" state={state} className={ACTION}>Voir</Link>
        </li>
      );
    case "to_invoice_month":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">{item.clientName} : {ymLabel(item.ym)} à facturer · {plural(item.eventIds.length, "événement")} · {fmtEur0(item.htva)}</span>
          <Link to={`/comptes/journal?client=${item.clientId}&prefill=month&ym=${item.ym}`} state={state} className={ACTION}>Facturer le mois</Link>
        </li>
      );
    case "unpaid":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">
            {plural(item.count, "facture impayée", "factures impayées")} · {fmtEur0(item.totalTvac)} · la plus ancienne du {shortDate.format(parseYmd(item.oldestDate.slice(0, 10)))}
          </span>
          <Link to="/comptes/a-facturer#impayes" state={state} className={ACTION}>Voir</Link>
        </li>
      );
    case "empty_week":
      return (
        <li className={ROW}>
          {dot}
          <span className="min-w-0">Aucun événement cette semaine</span>
          <Link to={`/events/new?date=${monday}&retour=${retour}`} state={state} className={ACTION}>+ Ajouter</Link>
        </li>
      );
    default:
      return null;
  }
}
