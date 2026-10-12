import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import type { AppEvent, Client, PrestationTypeSetting } from "@packages/types";
import { api } from "@/lib/api";
import { dayMonthShortLabel } from "@/lib/dates";
import { fmt } from "@/lib/recipe-helpers";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import { PageHeader, ListRow, StatusTag, Pagination } from "@/components/ui";

type Filter = "upcoming" | "completed" | "all";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "upcoming", label: "À venir" },
  { key: "completed", label: "Terminés" },
  { key: "all", label: "Tous" },
];

export default function Events() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [prestationTypes, setPrestationTypes] = useState<PrestationTypeSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [clientFilter, setClientFilter] = useState("");
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    api.events.list()
      .then(setEvents)
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));
    api.clients.list().then(setClients).catch(() => setClients([]));
    api.settings.get().then((s) => setPrestationTypes(s.prestationTypes ?? [])).catch(() => setPrestationTypes([]));
  }, []);

  const clientById = useMemo(() => new Map(clients.map((c) => [c.clientId, c])), [clients]);
  const prestationLabel = useMemo(() => new Map(prestationTypes.map((p) => [p.key, p.label])), [prestationTypes]);

  const filtered = useMemo(() => {
    let arr = [...events];
    if (search) arr = arr.filter((e) => e.name.toLowerCase().includes(search.toLowerCase()));
    if (filter !== "all") arr = arr.filter((e) => e.status === filter);
    if (clientFilter) arr = arr.filter((e) => e.clientId === clientFilter);
    const dir = filter === "upcoming" ? 1 : -1;
    arr.sort((a, b) => dir * a.date.localeCompare(b.date));
    return arr;
  }, [events, search, filter, clientFilter]);

  const { page, totalPages, paginatedItems, setPage, next, prev, total } = usePagination(filtered, 20);

  const subtitleFor = (ev: AppEvent) => {
    const client = ev.clientId ? clientById.get(ev.clientId)?.name : undefined;
    const prestation = ev.prestationType ? prestationLabel.get(ev.prestationType) ?? ev.prestationType : undefined;
    return [dayMonthShortLabel(ev.date), `${ev.guestCount} conv.`, client ?? ev.contactName, prestation]
      .filter(Boolean)
      .join(" · ");
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  return (
    <div className="max-w-doc mx-auto">
      <PageHeader
        title="Événements"
        meta={`${events.length} événement${events.length > 1 ? "s" : ""}`}
        actions={
          <button
            type="button"
            onClick={() => navigate("/events/new")}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-5 w-5" /> Nouvel événement
          </button>
        }
      />

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => { setFilter(f.key); setPage(1); }}
              aria-pressed={filter === f.key}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors ${filter === f.key ? "border-foreground bg-foreground text-background" : "border-border bg-card hover:bg-hover"}`}
            >
              {f.label}
            </button>
          ))}
          <select
            value={clientFilter}
            onChange={(e) => { setClientFilter(e.target.value); setPage(1); }}
            aria-label="Client"
            className="input-field min-h-11 w-auto max-w-full"
          >
            <option value="">Tous les clients</option>
            {clients.map((c) => <option key={c.clientId} value={c.clientId}>{c.name}</option>)}
          </select>
        </div>
        <label className="input-field flex min-h-11 items-center gap-2">
          <Search className="h-5 w-5 shrink-0 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-base outline-none"
            placeholder="Rechercher un événement…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </label>
      </div>

      {paginatedItems.length === 0 ? (
        <p className="py-12 text-center text-base text-muted-foreground">Aucun événement</p>
      ) : (
        <div className="divide-y divide-border/60">
          {paginatedItems.map((ev) => (
            <ListRow
              key={ev.eventId}
              to={`/events/${ev.eventId}`}
              title={ev.name}
              subtitle={subtitleFor(ev)}
              className="rounded-none"
              trailing={
                <>
                  <span className="text-base font-medium tabular-nums">{fmt(ev.sellingPricePerGuest * ev.guestCount)}</span>
                  <StatusTag status={ev.status} />
                </>
              }
            />
          ))}
        </div>
      )}

      <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} onPrev={prev} onNext={next} />
    </div>
  );
}
