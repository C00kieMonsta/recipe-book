import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import type { AppEvent, Client, PrestationTypeSetting } from "@packages/types";
import { DEFAULT_PRESTATION_TYPES, fmtEur } from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { dayLabel, todayIso } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { ListRow, PageHeader, SectionToggle } from "@/components/ui";

const KIND_LABEL: Record<NonNullable<Client["kind"]>, string> = {
  entreprise: "Entreprise",
  particulier: "Particulier",
};

interface ClientStats {
  nextDate?: string;
  signedThisYear: number;
}

function statsFor(events: AppEvent[], today: string): Map<string, ClientStats> {
  const year = today.slice(0, 4);
  const out = new Map<string, ClientStats>();
  for (const ev of events) {
    if (!ev.clientId) continue;
    const s = out.get(ev.clientId) ?? { signedThisYear: 0 };
    if (ev.date >= today && (!s.nextDate || ev.date < s.nextDate)) s.nextDate = ev.date;
    if (ev.date.startsWith(year)) s.signedThisYear += (ev.sellingPricePerGuest || 0) * (ev.guestCount || 0);
    out.set(ev.clientId, s);
  }
  return out;
}

export default function Clients() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [prestationTypes, setPrestationTypes] = useState<PrestationTypeSetting[]>(DEFAULT_PRESTATION_TYPES);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);

  useEffect(() => {
    // The clients table may not be provisioned yet; show a notice instead of an error.
    const clientsOrEmpty = api.clients.list().catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 503) { setNotConfigured(true); return [] as Client[]; }
      return Promise.reject(e);
    });
    Promise.all([clientsOrEmpty, api.events.list(), api.settings.get()])
      .then(([c, e, s]) => {
        setClients(c);
        setEvents(e);
        if (s.prestationTypes?.length) setPrestationTypes(s.prestationTypes);
      })
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const today = todayIso();
  const stats = useMemo(() => statsFor(events, today), [events, today]);
  const prestationLabel = (key?: string) => (key ? prestationTypes.find((p) => p.key === key)?.label ?? key : undefined);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.contactName?.toLowerCase().includes(q)) : clients;
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "fr"));
  }, [clients, search]);

  const active = filtered.filter((c) => c.active !== false);
  const archived = filtered.filter((c) => c.active === false);

  const row = (c: Client) => {
    const s = stats.get(c.clientId);
    const subtitle = [
      c.kind ? KIND_LABEL[c.kind] : undefined,
      prestationLabel(c.defaultPrestationType),
      c.defaultVatRate !== undefined ? `${c.defaultVatRate} %` : undefined,
    ].filter(Boolean).join(" · ");
    return (
      <ListRow
        key={c.clientId}
        to={`/clients/${c.clientId}`}
        title={c.name}
        subtitle={subtitle || undefined}
        trailing={
          <div className="text-right text-sm text-muted-foreground tabular-nums">
            {s?.nextDate && <div>Prochain : {dayLabel(s.nextDate)}</div>}
            <div>{fmtEur(s?.signedThisYear ?? 0)} signés cette année</div>
          </div>
        }
      />
    );
  };

  return (
    <div className="max-w-doc">
      <PageHeader
        title="Clients"
        actions={
          <button
            type="button"
            onClick={() => navigate("/clients/new")}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-5 w-5" />
            Client
          </button>
        }
      />

      <div className="flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-3">
        <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
        <input
          className="min-h-11 flex-1 bg-transparent text-base outline-none"
          placeholder="Rechercher un client…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {notConfigured && (
        <div className="mt-4 rounded-lg bg-warning-soft px-4 py-3 text-base text-warning">
          <p>Clients non configurés : la table ta-clients n'existe pas encore sur le serveur.</p>
          <Link to="/settings#apropos" className="mt-1 inline-flex min-h-11 items-center font-medium hover:underline">Paramètres ›</Link>
        </div>
      )}
      {loading ? (
        <p className="mt-6 text-base text-muted-foreground">Chargement…</p>
      ) : active.length === 0 ? (
        <p className="mt-6 text-base text-muted-foreground">
          {clients.length === 0 ? "Aucun client pour l'instant." : "Aucun client ne correspond."}
        </p>
      ) : (
        <div className="mt-4 divide-y divide-border">{active.map(row)}</div>
      )}

      {archived.length > 0 && (
        <SectionToggle title={`Archivés (${archived.length})`} storageKey="clients-archived">
          <div className="divide-y divide-border">{archived.map(row)}</div>
        </SectionToggle>
      )}
    </div>
  );
}
