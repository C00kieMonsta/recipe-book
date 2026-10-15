import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronRight, Download, MoreHorizontal } from "lucide-react";
import type { PayrollMode, PayrollPerson, Person } from "@packages/types";
import { PAYROLL_MODE_LABELS, PAYROLL_MODE_ORDER, fmtEur, payroll, payrollCsv, payrollText } from "@packages/types";
import { dayMonthShortLabel, monthLabel } from "@/lib/dates";
import { useReportInputs } from "@/lib/use-report-inputs";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { PersonChip } from "@/components/admin/PersonChips";
import {
  Button,
  Callout,
  DateNav,
  IconButton,
  ListRow,
  Menu,
  MenuItem,
  MenuRadio,
  MenuSection,
  MenuSeparator,
  MoneyTile,
  Section,
  SelectPill,
  Tag,
  Toolbar,
  useMenu,
} from "@/components/ui";

const CAPTION = "Événements du mois d'après leur date. Les tarifs figés à la clôture d'un événement priment sur les tarifs actuels ; les autres suivent Paramètres › Équipe.";
const MODE_OPTIONS = [{ value: "", label: "Tous" }, ...PAYROLL_MODE_ORDER.map((m) => ({ value: m, label: PAYROLL_MODE_LABELS[m] }))];

const num = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 2 });
const monthName = new Intl.DateTimeFormat("fr-BE", { month: "long", timeZone: "UTC" });

const fmtH = (h: number) => `${num.format(h)} h`;
const fmtKm = (km: number) => `${num.format(km)} km`;

function currentYm(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function shiftYm(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7)) - 1 + delta;
  const d = new Date(Date.UTC(y, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function lastDayOf(ym: string): string {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0));
  return `${ym}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function useYmParam(): [string, (ym: string) => void] {
  const [params, setParams] = useSearchParams();
  const raw = params.get("ym") ?? "";
  const ym = /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : currentYm();
  const setYm = (next: string) => {
    const p = new URLSearchParams(params);
    p.set("ym", next);
    setParams(p);
  };
  return [ym, setYm];
}

function downloadCsv(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const MISSING_TAG = <Tag colour="gray">tarif à préciser</Tag>;

// « 18 h · 24 km · 280,56 € » under the name on phones, trailing from md.
function Figures({ hours, km, amount }: { hours: number; km: number; amount: number }) {
  return <>{`${fmtH(hours)} · ${fmtKm(km)} · ${fmtEur(amount)}`}</>;
}

// One person: the summary row toggles the event lines under it.
function PersonRow({ person, people, open, onToggle }: { person: PayrollPerson; people: Person[]; open: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-border last:border-b-0">
      <div className="flex items-center gap-2">
        <ListRow
          className="min-w-0 flex-1"
          onClick={onToggle}
          leading={
            <span className="flex items-center gap-1">
              <ChevronRight className={`h-4 w-4 shrink-0 text-icon transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
              <PersonChip personId={person.personId} people={people} />
            </span>
          }
          title={person.name}
          subtitle={<span className="md:hidden"><Figures {...person} /></span>}
          trailing={<span className="hidden text-foreground md:inline"><Figures {...person} /></span>}
        />
        {person.missingRate && (
          <Link to="/settings#equipe" className="inline-flex shrink-0 items-center rounded hover:underline focus-visible:outline-none focus-visible:shadow-ring touch:min-h-11" title="Renseigner le tarif dans Paramètres › Équipe">
            {MISSING_TAG}
          </Link>
        )}
      </div>
      {open && (
        <div className="pb-1 pl-7">
          {person.events.map((ev) => (
            <ListRow
              key={ev.eventId}
              to={`/events/${ev.eventId}`}
              title={<span className="font-normal">{`${dayMonthShortLabel(ev.date).toLowerCase()} · ${ev.label}`}</span>}
              subtitle={<span className="md:hidden"><Figures {...ev} /></span>}
              trailing={
                <>
                  <span className="hidden md:inline"><Figures {...ev} /></span>
                  {ev.missingRate && MISSING_TAG}
                </>
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Equipe() {
  const [ym, setYm] = useYmParam();
  const year = Number(ym.slice(0, 4));
  const { toast } = useToast();
  const touch = useTouchScreen();
  const more = useMenu();
  const { events, settings, clients, loading, error } = useReportInputs(year);
  const [mode, setMode] = useState<PayrollMode | "">("");
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set());

  const people = useMemo(() => settings?.people ?? [], [settings]);
  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);
  const table = useMemo(
    () => payroll(events, people, clientById, `${ym}-01`, lastDayOf(ym), mode || undefined),
    [events, people, clientById, ym, mode],
  );
  const personCount = table.groups.reduce((n, g) => n + g.people.length, 0);
  const empty = table.groups.length === 0;

  const toggle = (personId: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(personId)) next.delete(personId);
      else next.add(personId);
      return next;
    });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(payrollText(table));
      toast({ title: "Tableau copié" });
    } catch {
      toast({ title: "Copie impossible dans ce navigateur", variant: "destructive" });
    }
  };

  const exportCsv = () => downloadCsv(`equipe-${ym}.csv`, payrollCsv(table));

  const nowYm = currentYm();
  const copyButton = (
    <Button variant="default" size="sm" disabled={empty} onClick={() => void copy()}>
      Copier le tableau
    </Button>
  );
  const menu = (
    <div ref={more.ref} className="relative inline-flex">
      <IconButton size="sm" aria-label="Plus d'actions" aria-haspopup="menu" aria-expanded={more.open} onClick={more.toggle} icon={<MoreHorizontal />} />
      <Menu {...more.props} align="right" title="Actions" aria-label="Plus d'actions">
        {touch && (
          <>
            <MenuSection label="Paiement">
              {MODE_OPTIONS.map((o) => (
                <MenuRadio key={o.value} checked={mode === o.value} onSelect={() => setMode(o.value as PayrollMode | "")}>{o.label}</MenuRadio>
              ))}
            </MenuSection>
            <MenuSeparator />
          </>
        )}
        <MenuItem icon={<Download />} disabled={empty} onSelect={exportCsv}>Exporter en CSV</MenuItem>
      </Menu>
    </div>
  );

  return (
    <div className="max-w-doc">
      <Toolbar
        center={
          <DateNav
            label={monthLabel(ym)}
            value={ym}
            pickerType="month"
            onPrev={() => setYm(shiftYm(ym, -1))}
            onNext={() => setYm(shiftYm(ym, 1))}
            onPick={(v) => setYm(v)}
            isToday={ym === nowYm}
            onToday={() => setYm(nowYm)}
            todayLabel="Ce mois"
          />
        }
        right={
          <>
            <span className="ml-1 inline-flex items-center gap-1 touch:hidden">
              <span className="text-sm text-muted-foreground max-md:hidden">Paiement :</span>
              <SelectPill value={mode} options={MODE_OPTIONS} colour="gray" align="right" aria-label="Paiement" title="Mode de paiement" onChange={(v) => setMode(v as PayrollMode | "")} />
            </span>
            {menu}
            {copyButton}
          </>
        }
      />

      {error && <div className="mt-4"><Callout tone="danger">{error}</Callout></div>}
      {loading && <p className="mt-4 text-sm text-muted-foreground">Chargement…</p>}

      {!loading && empty && (
        <p className="mt-4 text-sm text-muted-foreground">
          {mode
            ? `Aucune heure notée en ${monthName.format(new Date(`${ym}-01T00:00:00Z`))} pour ce mode de paiement.`
            : `Aucune heure notée en ${monthName.format(new Date(`${ym}-01T00:00:00Z`))}. Sur un événement, section Heures et frais, notez les heures de chacun.`}
        </p>
      )}

      {!loading && !empty && (
        <>
          <div className="mt-3 grid grid-cols-2 divide-y divide-border rounded-lg bg-surface md:grid-cols-4 md:divide-x md:divide-y-0">
            <MoneyTile
              flat
              label="Total"
              value={fmtEur(table.amount)}
              sub={table.missingRate > 0 ? <span className="text-danger">{`${table.missingRate} ${table.missingRate > 1 ? "personnes" : "personne"} sans tarif`}</span> : undefined}
            />
            <MoneyTile flat label="Heures" value={fmtH(table.hours)} />
            <MoneyTile flat label="Km" value={fmtKm(table.km)} />
            <MoneyTile flat label="Personnes" value={personCount} />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{CAPTION}</p>

          {table.groups.map((g) => (
            <Section key={g.mode} title={g.label} meta={`${fmtEur(g.amount)} · ${fmtH(g.hours)}`}>
              <div>
                {g.people.map((p) => (
                  <PersonRow key={p.personId} person={p} people={people} open={openIds.has(p.personId)} onToggle={() => toggle(p.personId)} />
                ))}
              </div>
            </Section>
          ))}
        </>
      )}
    </div>
  );
}
