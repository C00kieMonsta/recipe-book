import { useState } from "react";
import { Link } from "react-router-dom";
import type { ChecklistItem, GroceryList, PrestationTypeSetting } from "@packages/types";
import { checklistCount, isoWeekOf, parseIsoWeek, parseYmd, rangeLabel } from "@packages/types";
import { fmtEur0, plural } from "@/lib/use-planning-data";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Button, BUTTON_BASE, BUTTON_SIZE, BUTTON_VARIANT, Callout, SelectPill, Tag } from "@/components/ui";

export interface WeekChecklistProps {
  items: ChecklistItem[];
  // Fresh install: a five-step guide replaces the checklist.
  firstRun?: boolean;
  open: boolean;
  onToggle: () => void;
  // Location to return to, passed as state.from on every link.
  from: string;
  monday: string;
  // ISO week number shown in the title; derived from monday when absent.
  weekNo?: number;
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

const ROW = "flex min-h-7 items-center gap-2 text-sm touch:min-h-11";
const TEXT = "min-w-0 flex-1";
// Guide rows wrap on phones: bullet and link follow the first line of text.
const GUIDE_ROW = "flex min-h-7 items-start gap-2 text-sm touch:min-h-11";

const monthName = new Intl.DateTimeFormat("fr-BE", { month: "long", timeZone: "UTC" });
const shortDate = new Intl.DateTimeFormat("fr-BE", { day: "2-digit", month: "2-digit", timeZone: "UTC" });

function ymLabel(ym: string): string {
  return monthName.format(parseYmd(`${ym}-01`));
}

// "5 préparations", "1 tâche" or "5 préparations et 1 tâche".
function unassignedLabel(lineCount: number, taskCount: number): string {
  const parts: string[] = [];
  if (lineCount > 0) parts.push(plural(lineCount, "préparation"));
  if (taskCount > 0) parts.push(plural(taskCount, "tâche"));
  return parts.join(" et ");
}

// A link styled as the small link button; Button cannot carry router state.
function ActionLink({ to, state, className, children }: { to: string; state: unknown; className?: string; children: ReactNode }) {
  return <Link to={to} state={state} className={cn(BUTTON_BASE, BUTTON_SIZE.sm, BUTTON_VARIANT.link, className)}>{children}</Link>;
}

function Bullet({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("ml-0.5 mr-1 h-1.5 w-1.5 shrink-0 rounded-full bg-icon", className)} />;
}

export default function WeekChecklist(props: WeekChecklistProps) {
  const { items, firstRun = false, open, onToggle, from, coveringList, monday } = props;
  const weekNo = props.weekNo ?? parseIsoWeek(isoWeekOf(monday)).week;
  const count = checklistCount(items);
  const state = { from };
  const notConfigured = items.find((i) => i.kind === "not_configured");
  const retour = encodeURIComponent(from.split("?")[0]);

  if (firstRun) {
    // `short` is the phone label; the long one would push the step text onto three lines.
    const steps: { text: string; label: string; short: string; to: string }[] = [
      { text: "1. Ajoutez votre équipe", label: "Paramètres › Équipe", short: "Équipe", to: "/settings#equipe" },
      { text: "2. Créez vos ingrédients avec leur prix", label: "Ingrédients", short: "Ingrédients", to: "/ingredients" },
      { text: "3. Créez vos recettes", label: "Recettes", short: "Recettes", to: "/recipes" },
      { text: "4. Ajoutez vos clients", label: "Clients", short: "Clients", to: "/clients/new" },
      { text: "5. Planifiez un premier événement", label: "+ Nouvel événement", short: "+ Événement", to: `/events/new?date=${monday}&retour=${retour}` },
    ];
    return (
      <div aria-live="polite">
        <Callout emoji="🚀" title="Pour commencer">
          <ul>
            {steps.map((step) => (
              <li key={step.to} className={GUIDE_ROW}>
                <Bullet className="mt-[7px]" />
                <span className={`${TEXT} leading-5`}>{step.text}</span>
                <ActionLink to={step.to} state={state} className="-mt-1 touch:-mt-3">
                  <span className="md:hidden">{step.short}</span>
                  <span className="hidden md:inline">{step.label}</span>
                </ActionLink>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-sm text-muted-foreground">Un événement, c'est une date, un client et un menu de recettes ; les fiches, les quantités et les courses en découlent.</p>
        </Callout>
      </div>
    );
  }

  const notConfiguredRow = notConfigured && notConfigured.kind === "not_configured" && (
    <li className={`${ROW} text-muted-foreground`}>
      <span className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className={TEXT}>
        {notConfigured.clients && notConfigured.ledger
          ? "Clients et comptabilité non configurés"
          : notConfigured.clients ? "Clients non configurés" : "Comptabilité non configurée"}
      </span>
      <ActionLink to="/settings#apropos" state={state}>Paramètres</ActionLink>
    </li>
  );

  if (count === 0) {
    return (
      <div aria-live="polite">
        <Callout tone="success" emoji="✅" title={`Semaine ${weekNo} prête, rien ne manque`}>
          {notConfiguredRow && <ul className="text-foreground">{notConfiguredRow}</ul>}
        </Callout>
      </div>
    );
  }

  return (
    <div aria-live="polite">
      <Callout
        emoji="📋"
        title={<span className="inline-flex items-center gap-2">Ce qui manque pour la semaine {weekNo}<Tag colour="gray">{count} {count === 1 ? "point" : "points"}</Tag></span>}
        collapsible
        open={open}
        onToggle={onToggle}
      >
        <p className="mb-1 text-sm text-muted-foreground">Calculée d'après vos événements, rien à remplir ici. Le lien bleu règle chaque point et la ligne disparaît.</p>
        <ul>
          {items.map((item, i) => {
            if (item.kind === "not_configured") return null;
            return <ChecklistRow key={i} item={item} {...props} state={state} retour={retour} />;
          })}
          {coveringList && !items.some((i) => i.kind === "groceries") && (
            <li className={`${ROW} text-muted-foreground`}>
              <span className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className={TEXT}>Courses · liste{coveringList.range ? ` du ${rangeLabel(coveringList.range.from, coveringList.range.to)}` : ""}</span>
              <ActionLink to={`/grocery-list?id=${coveringList.listId}`} state={state}>Voir</ActionLink>
            </li>
          )}
          {notConfiguredRow}
        </ul>
      </Callout>
    </div>
  );
}

type RowProps = WeekChecklistProps & { item: ChecklistItem; state: { from: string }; retour: string };

function ChecklistRow({ item, state, retour, monday, prestationTypes, busy, onCreateClientWeek, onSetType, onAssign, onCreateGroceries, onCloseEvent }: RowProps) {
  const [closing, setClosing] = useState<string | null>(null);

  switch (item.kind) {
    case "client_week":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{item.clientName} : {plural(item.missingDays, "jour")} sans événement cette semaine</span>
          <Button variant="link" size="sm" disabled={busy} onClick={() => onCreateClientWeek(item.clientId, item.guestCount)}>Créer la semaine {item.clientName}</Button>
        </li>
      );
    case "no_menu":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{item.name} n'a pas encore de menu</span>
          <ActionLink to={`/events/${item.eventId}?ajouter=1#menu`} state={state}>Ajouter des recettes</ActionLink>
        </li>
      );
    case "no_price":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{item.name} n'a pas de prix par convive</span>
          <ActionLink to={`/events/${item.eventId}?focus=prix`} state={state}>Fixer le prix</ActionLink>
        </li>
      );
    case "no_type":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{item.name} n'a pas de type de prestation</span>
          <SelectPill
            value=""
            placeholder="Choisir"
            align="right"
            colour="gray"
            aria-label={`Type de prestation de ${item.name}`}
            title="Type de prestation"
            options={prestationTypes.map((t) => ({ value: t.key, label: t.label }))}
            onChange={(key) => {
              const type = prestationTypes.find((t) => t.key === key);
              if (type && !busy) void onSetType(item.eventId, type);
            }}
          />
        </li>
      );
    case "unassigned":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{unassignedLabel(item.lineCount, item.taskCount)} sans personne ({plural(item.eventCount, "événement")})</span>
          <Button variant="link" size="sm" onClick={onAssign}>Choisir qui fait quoi</Button>
        </li>
      );
    case "groceries": {
      const n = item.uncoveredEventIds.length;
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>
            {item.partial
              ? `${plural(n, "événement")} ${n === 1 ? "n'a" : "n'ont"} pas de liste de courses`
              : `Les courses ne sont pas encore créées (${plural(n, "événement")})`}
          </span>
          <Button variant="link" size="sm" disabled={busy} onClick={() => onCreateGroceries(item.uncoveredEventIds)}>
            {item.partial ? "Compléter la liste" : "Créer la liste de courses"}
          </Button>
        </li>
      );
    }
    case "to_close":
      return (
        <li>
          <div className={ROW}>
            <Bullet />
            <span className={TEXT}>
              {item.events.length === 1
                ? "1 événement passé est à terminer, puis à facturer"
                : `${item.events.length} événements passés sont à terminer, puis à facturer`}
            </span>
          </div>
          <ul className="pl-6">
            {item.events.map((ev) => (
              <li key={ev.eventId} className={ROW}>
                <Link to={`/events/${ev.eventId}`} state={state} className={`${TEXT} truncate rounded hover:underline underline-offset-4`}>
                  {ev.name} · {shortDate.format(parseYmd(ev.date.slice(0, 10)))}
                </Link>
                <Button
                  variant="link"
                  size="sm"
                  disabled={busy || closing === ev.eventId}
                  onClick={() => { setClosing(ev.eventId); onCloseEvent(ev.eventId).finally(() => setClosing(null)); }}
                >
                  Terminer
                </Button>
              </li>
            ))}
          </ul>
        </li>
      );
    case "to_invoice":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{item.name} est terminé · {fmtEur0(item.htva)} à facturer</span>
          <ActionLink to={`/events/${item.eventId}?facturer=1#facturation`} state={state}>Créer la facture</ActionLink>
        </li>
      );
    case "to_invoice_many":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{item.count} événements terminés à facturer · {fmtEur0(item.htva)}</span>
          <ActionLink to="/comptes/a-facturer" state={state}>Voir à facturer</ActionLink>
        </li>
      );
    case "to_invoice_month":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>{item.clientName} : {ymLabel(item.ym)} à facturer · {plural(item.eventIds.length, "événement")} · {fmtEur0(item.htva)}</span>
          <ActionLink to={`/comptes/journal?client=${item.clientId}&prefill=month&ym=${item.ym}`} state={state}>Facturer le mois</ActionLink>
        </li>
      );
    case "unpaid": {
      const oldest = `la plus ancienne du ${shortDate.format(parseYmd(item.oldestDate.slice(0, 10)))}`;
      // The longest row: the date goes to a title on phones.
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT} title={oldest}>
            {item.count === 1 ? "1 facture n'est pas encore payée" : `${item.count} factures ne sont pas encore payées`} · {fmtEur0(item.totalTvac)}<span className="hidden md:inline"> · {oldest}</span>
          </span>
          <ActionLink to="/comptes/a-facturer#impayes" state={state}>
            <span className="md:hidden">Voir</span>
            <span className="hidden md:inline">Voir les impayés</span>
          </ActionLink>
        </li>
      );
    }
    case "empty_week":
      return (
        <li className={ROW}>
          <Bullet />
          <span className={TEXT}>Rien de prévu cette semaine</span>
          <ActionLink to={`/events/new?date=${monday}&retour=${retour}`} state={state}>+ Nouvel événement</ActionLink>
        </li>
      );
    default:
      return null;
  }
}
