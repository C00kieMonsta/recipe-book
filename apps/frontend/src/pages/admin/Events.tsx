import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, ArrowUpDown, Printer, X } from "lucide-react";
import type { AppEvent, Client, PrestationTypeSetting } from "@packages/types";
import { fmtEur, signedRevenue } from "@packages/types";
import { api } from "@/lib/api";
import { dayMonthShortLabel } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { usePagination } from "@/hooks/use-pagination";
import {
  PageHeader,
  StatusTag,
  Pagination,
  Button,
  IconButton,
  Toolbar,
  ViewTabs,
  FilterButton,
  FilterGroup,
  FilterChip,
  Table,
  Tag,
  EmptyState,
  ActionMenu,
  Menu,
  MenuRadio,
  useMenu,
} from "@/components/ui";

type Filter = "upcoming" | "completed" | "all";
type SortDir = "asc" | "desc";

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
  const [searchOpen, setSearchOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [clientFilter, setClientFilter] = useState("");
  const [prestationFilter, setPrestationFilter] = useState("");
  const [sortDir, setSortDir] = useState<SortDir | null>(null);
  const sortMenu = useMenu();
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
    if (prestationFilter) arr = arr.filter((e) => e.prestationType === prestationFilter);
    const dir = sortDir ? (sortDir === "asc" ? 1 : -1) : filter === "upcoming" ? 1 : -1;
    arr.sort((a, b) => dir * a.date.localeCompare(b.date));
    return arr;
  }, [events, search, filter, clientFilter, prestationFilter, sortDir]);

  const { page, totalPages, paginatedItems, setPage, next, prev, total } = usePagination(filtered, 20);

  const filterCount = (clientFilter ? 1 : 0) + (prestationFilter ? 1 : 0);
  const clearFilters = () => { setClientFilter(""); setPrestationFilter(""); setPage(1); };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;

  const searchField = (
    <input
      className="input-field input-compact w-[220px] touch:w-full"
      placeholder="Rechercher un événement…"
      value={search}
      autoFocus
      onChange={(e) => { setSearch(e.target.value); setPage(1); }}
      onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
      onBlur={() => { if (!search) setSearchOpen(false); }}
    />
  );

  const filters = (
    <FilterButton count={filterCount} onClear={clearFilters}>
      <FilterGroup
        label="Client"
        name="client"
        kind="radio"
        value={clientFilter}
        onChange={(v) => { setClientFilter(v); setPage(1); }}
        options={[{ value: "", label: "Tous les clients" }, ...clients.map((c) => ({ value: c.clientId, label: c.name }))]}
      />
      <FilterGroup
        label="Prestation"
        name="prestation"
        kind="radio"
        value={prestationFilter}
        onChange={(v) => { setPrestationFilter(v); setPage(1); }}
        options={[{ value: "", label: "Toutes les prestations" }, ...prestationTypes.map((p) => ({ value: p.key, label: p.label }))]}
      />
    </FilterButton>
  );

  const sort = (
    <div ref={sortMenu.ref} className="relative inline-flex">
      <Button variant="subtle" size="sm" icon={<ArrowUpDown />} onClick={sortMenu.toggle} aria-haspopup="menu" aria-expanded={sortMenu.open} className={sortDir ? "bg-selected text-primary hover:text-primary" : ""}>
        Trier
      </Button>
      <Menu {...sortMenu.props} align="right" title="Trier">
        <MenuRadio checked={sortDir === null} onSelect={() => setSortDir(null)}>Par défaut</MenuRadio>
        <MenuRadio checked={sortDir === "asc"} onSelect={() => setSortDir("asc")}>Date croissante</MenuRadio>
        <MenuRadio checked={sortDir === "desc"} onSelect={() => setSortDir("desc")}>Date décroissante</MenuRadio>
      </Menu>
    </div>
  );

  const more = <ActionMenu title="Événements" items={[{ label: "Imprimer la liste", icon: <Printer />, onClick: () => window.print() }]} />;

  const chips = filterCount > 0 ? (
    <>
      {clientFilter && <FilterChip onRemove={() => setClientFilter("")}>{clientById.get(clientFilter)?.name ?? "Client"}</FilterChip>}
      {prestationFilter && <FilterChip onRemove={() => setPrestationFilter("")}>{prestationLabel.get(prestationFilter) ?? prestationFilter}</FilterChip>}
    </>
  ) : undefined;

  return (
    <div className="mx-auto max-w-wide">
      <PageHeader
        iconKey="evenements"
        title="Événements"
        meta={`${events.length} événement${events.length > 1 ? "s" : ""}`}
        actions={
          <Button as={Link} to="/events/new" variant="primary" size="lg" icon={<Plus />}>
            <span className="hidden sm:inline">Nouvel événement</span><span className="sm:hidden">Nouveau</span>
          </Button>
        }
      />

      <div data-tour="events-list">
        <Toolbar
          left={<ViewTabs items={FILTERS} value={filter} onChange={(k) => { setFilter(k as Filter); setPage(1); }} aria-label="Statut" />}
          right={
            <>
              {searchOpen ? searchField : <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen(true)} />}
              {filters}
              {sort}
              {more}
            </>
          }
          rightTouch={
            <>
              <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen((o) => !o)} className={searchOpen ? "bg-active" : ""} />
              {filters}
              {more}
            </>
          }
          filters={chips}
        />
        {searchOpen && (
          <div className="hidden items-center gap-1 py-2 touch:flex">
            {searchField}
            <IconButton size="sm" aria-label="Fermer la recherche" icon={<X />} onClick={() => { setSearch(""); setSearchOpen(false); }} />
          </div>
        )}

        <div className="mt-2">
          <Table<AppEvent>
            rows={paginatedItems}
            rowKey={(ev) => ev.eventId}
            rowHref={(ev) => `/events/${ev.eventId}`}
            empty={<EmptyState message="Aucun événement" action={{ label: "+ Nouvel événement", to: "/events/new" }} />}
            columns={[
              { key: "name", label: "Nom", render: (ev) => <span className="font-medium">{ev.name}</span> },
              { key: "date", label: "Date", width: "110px", render: (ev) => dayMonthShortLabel(ev.date) },
              { key: "client", label: "Client", render: (ev) => (ev.clientId ? clientById.get(ev.clientId)?.name : undefined) ?? ev.contactName ?? "" },
              { key: "guests", label: "Conv.", width: "70px", align: "right", render: (ev) => `${ev.guestCount}` },
              { key: "prestation", label: "Prestation", render: (ev) => (ev.prestationType ? <Tag colour="gray">{prestationLabel.get(ev.prestationType) ?? ev.prestationType}</Tag> : "") },
              { key: "amount", label: "Montant", width: "110px", align: "right", trailing: true, render: (ev) => <span className="text-foreground">{fmtEur(signedRevenue(ev))}</span> },
              { key: "status", label: "Statut", width: "110px", trailing: true, render: (ev) => <StatusTag status={ev.status} /> },
            ]}
          />
        </div>
      </div>

      <Pagination page={page} totalPages={totalPages} total={total} onPage={setPage} onPrev={prev} onNext={next} />
    </div>
  );
}
