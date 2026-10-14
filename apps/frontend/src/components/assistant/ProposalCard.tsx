import { Fragment, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, Loader2 } from "lucide-react";
import type { ProposedAction, ProposedActionKind } from "@packages/types";
import Button from "@/components/ui/Button";
import Tag, { type TagColour } from "@/components/ui/Tag";
import type { ProposalState } from "@/hooks/use-assistant-chat";
import { cn } from "@/lib/utils";

export const PROPOSAL_KIND_LABEL: Record<ProposedActionKind, string> = {
  create_recipe: "Nouvelle recette",
  create_ingredient: "Nouvel ingrédient",
  create_event: "Nouvel événement",
  update_event: "Modification d'événement",
  add_event_line: "Nouvelle ligne",
  update_event_line: "Ligne modifiée",
  remove_event_line: "Ligne retirée",
  add_task: "Tâche",
};

const KIND_COLOUR: Record<ProposedActionKind, TagColour> = {
  create_recipe: "green",
  create_ingredient: "green",
  create_event: "blue",
  update_event: "blue",
  add_event_line: "blue",
  update_event_line: "yellow",
  remove_event_line: "red",
  add_task: "purple",
};

export interface ProposalCardProps {
  action: ProposedAction;
  state: ProposalState;
  // Absent while the turn streams: the card is read-only until the answer is complete.
  onApply?: () => void;
  onIgnore?: () => void;
  className?: string;
}

export default function ProposalCard({ action, state, onApply, onIgnore, className }: ProposalCardProps) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const rows = proposalRows(action);
  // The buttons unmount once the card resolves, so focus moves to the card first.
  const act = (fn?: () => void) => () => {
    cardRef.current?.focus();
    fn?.();
  };
  const applying = state.status === "applying";
  const actionable = onApply !== undefined && (state.status === "pending" || state.status === "applying" || state.status === "failed");

  return (
    <div
      ref={cardRef}
      tabIndex={-1}
      className={cn("rounded-lg bg-background p-3 shadow-card outline-none focus-visible:shadow-ring", state.status === "ignored" && "opacity-60", className)}
    >
      <div className="flex items-center gap-2">
        <Tag colour={KIND_COLOUR[action.kind]}>{PROPOSAL_KIND_LABEL[action.kind]}</Tag>
        {state.status === "ignored" && <Tag colour="gray">Ignoré</Tag>}
      </div>
      <p className="mt-1.5 break-words text-sm touch:text-base">{action.summary}</p>

      {rows.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className="-ml-1 mt-1 inline-flex h-7 items-center gap-1 rounded px-1 text-sm text-muted-foreground hover:bg-hover hover:text-foreground touch:h-11"
          >
            <ChevronRight className={cn("h-4 w-4 shrink-0 text-icon transition-transform", open && "rotate-90")} aria-hidden="true" />
            Détails
          </button>
          {open && (
            <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-sm">
              {rows.map(([label, value]) => (
                <Fragment key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 whitespace-pre-line break-words">{value}</dd>
                </Fragment>
              ))}
            </dl>
          )}
        </>
      )}

      {state.status === "applied" && (
        <p className="mt-2 text-sm text-success">
          Appliqué · <Link to={state.href} className="text-primary hover:underline">Ouvrir</Link>
        </p>
      )}
      {state.status === "failed" && <p className="mt-2 text-sm text-danger">{state.error}</p>}

      {actionable && (
        <div className="mt-2 flex items-center gap-1">
          <Button
            variant="primary"
            size="sm"
            disabled={applying}
            icon={applying ? <Loader2 className="animate-spin" /> : undefined}
            onClick={act(onApply)}
          >
            {applying ? "Application…" : state.status === "failed" ? "Réessayer" : "Appliquer"}
          </Button>
          <Button variant="subtle" size="sm" disabled={applying} onClick={act(onIgnore)}>
            Ignorer
          </Button>
        </div>
      )}
    </div>
  );
}

// The payload as French name and value pairs for the « Détails » block.

const FIELD_LABEL: Record<string, string> = {
  name: "Nom",
  category: "Catégorie",
  type: "Type",
  portions: "Portions",
  portionWeight: "Poids par portion",
  defaultCourse: "Service",
  description: "Description",
  techniques: "Techniques",
  ingredients: "Ingrédients",
  photos: "Photos",
  pricing: "Tarification",
  price: "Prix HTVA",
  unit: "Unité",
  supplier: "Fournisseur",
  comment: "Commentaire",
  date: "Date",
  guestCount: "Convives",
  recipes: "Lignes",
  tasks: "Tâches",
  extraCosts: "Coûts annexes",
  sellingPricePerGuest: "Prix par convive HTVA",
  notes: "Notes",
  contactName: "Contact",
  contactPhone: "Téléphone",
  contactEmail: "E-mail",
  actualCost: "Coût réel",
  status: "Statut",
  clientId: "Client",
  templateId: "Modèle",
  prestationType: "Prestation",
  vatRate: "TVA",
  hoursSpent: "Heures",
  assignedTo: "Équipe",
  pricingMode: "Mode de prix",
  sellingTotal: "Prix total HTVA",
  revenueLines: "Lignes de revenu",
  deliveryAddress: "Adresse de livraison",
  deliveryTime: "Heure de livraison",
  billingDetails: "Facturation",
  offerId: "Offre",
  costSnapshot: "Coût figé",
  recipeId: "Recette",
  course: "Service",
  prepStatus: "Statut",
  prepDate: "Date de préparation",
  label: "Intitulé",
  amount: "Montant",
  kind: "Nature",
  qty: "Quantité",
  lossPct: "Perte",
  eventId: "Événement",
  lineId: "Ligne",
  surPlace: "Sur place",
  takeAway: "À emporter",
  chosenPrice: "Prix choisi",
  coef: "Coefficient",
  tva: "TVA",
};

const ENUM_LABEL: Record<string, string> = {
  todo: "À faire",
  doing: "En cours",
  done: "Fait",
  upcoming: "À venir",
  completed: "Terminé",
  par_convive: "Par convive",
  total: "Total",
  matiere: "Matière",
  personnel: "Personnel",
  location: "Location",
  transport: "Transport",
  autre: "Autre",
};

const MONEY_KEYS = new Set(["price", "sellingPricePerGuest", "sellingTotal", "amount", "actualCost", "surPlace", "takeAway", "rawMaterial", "extrasTotal", "unitCost"]);
const PERCENT_KEYS = new Set(["lossPct", "vatRate", "tva"]);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const money = new Intl.NumberFormat("fr-BE", { style: "currency", currency: "EUR" });
const number = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 });
const longDate = new Intl.DateTimeFormat("fr-BE", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export function fieldLabel(key: string): string {
  return FIELD_LABEL[key] ?? key;
}

export function proposalRows(action: ProposedAction): [string, string][] {
  const rows: [string, string][] = [];
  if ("payload" in action) {
    // An empty list on a creation is noise; on an update it clears the field and must show.
    const creation = action.kind.startsWith("create_") || action.kind.startsWith("add_");
    for (const [key, value] of Object.entries(action.payload as Record<string, unknown>)) {
      if (value === undefined) continue;
      // The summary already names the recipe; the id means nothing to the owner.
      if (key === "recipeId") continue;
      if (creation && Array.isArray(value) && value.length === 0) continue;
      rows.push([fieldLabel(key), formatValue(key, value)]);
    }
  }
  // The summary already names the event and the line; the raw ids mean nothing to the owner.
  return rows;
}

function formatValue(key: string, value: unknown): string {
  if (value === null) return "(vide)";
  if (typeof value === "boolean") return value ? "Oui" : "Non";
  if (typeof value === "number") {
    if (MONEY_KEYS.has(key)) return money.format(value);
    if (PERCENT_KEYS.has(key)) return `${number.format(value)} %`;
    if (key === "portionWeight") return `${number.format(value)} g`;
    return number.format(value);
  }
  if (typeof value === "string") {
    if (ISO_DATE.test(value) && (key === "date" || key === "prepDate")) return formatDate(value);
    return ENUM_LABEL[value] ?? value;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "(vide)";
    return value.map((item) => formatItem(key, item)).join("\n");
  }
  if (typeof value === "object") return formatObject(value as Record<string, unknown>);
  return String(value);
}

function formatItem(key: string, item: unknown): string {
  if (item === null || typeof item !== "object") return formatValue(key, item);
  const o = item as Record<string, unknown>;
  switch (key) {
    case "ingredients":
      return [
        [formatValue("qty", o.qty), typeof o.unit === "string" ? o.unit : "", typeof o.name === "string" ? o.name : ""].filter(Boolean).join(" "),
        typeof o.lossPct === "number" && o.lossPct > 0 ? ` (perte ${number.format(o.lossPct)} %)` : "",
      ].join("");
    case "recipes":
      return [`${formatValue("portions", o.portions)} port.`, o.course].filter(Boolean).join(" · ");
    case "tasks":
      return [o.label, typeof o.date === "string" ? formatDate(o.date) : undefined].filter(Boolean).join(" · ");
    case "extraCosts":
      return [o.label, typeof o.amount === "number" ? money.format(o.amount) : undefined, typeof o.kind === "string" ? ENUM_LABEL[o.kind] ?? o.kind : undefined].filter(Boolean).join(" · ");
    case "revenueLines":
      return [o.label, typeof o.amount === "number" ? money.format(o.amount) : undefined, typeof o.vatRate === "number" ? `TVA ${number.format(o.vatRate)} %` : undefined].filter(Boolean).join(" · ");
    default:
      return formatObject(o);
  }
}

// « Sur place (Coefficient 4, TVA 12 %) · À emporter (…) »: one level of parentheses for nested objects.
function formatObject(o: Record<string, unknown>, nested = false): string {
  const parts = Object.entries(o)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => {
      const value = v !== null && typeof v === "object" && !Array.isArray(v) ? formatObject(v as Record<string, unknown>, true) : formatValue(k, v);
      return `${fieldLabel(k)} ${value}`;
    });
  return nested ? `(${parts.join(", ")})` : parts.join(" · ");
}

function formatDate(iso: string): string {
  const parsed = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? iso : longDate.format(parsed);
}
