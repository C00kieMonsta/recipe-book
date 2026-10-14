import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Plus, Search, ArrowUpDown, X } from "lucide-react";
import type { AppEvent, Client } from "@packages/types";
import { fmtEur, signedRevenue } from "@packages/types";
import { api, ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { useToast } from "@/hooks/use-toast";
import { PAGE_ICONS } from "@/lib/page-icons";
import {
  PageHeader,
  Button,
  IconButton,
  Toolbar,
  ViewTabs,
  Table,
  Tag,
  EmptyState,
  ActionMenu,
  Callout,
  Menu,
  MenuRadio,
  useMenu,
} from "@/components/ui";

const KIND_LABEL: Record<NonNullable<Client["kind"]>, string> = {
  entreprise: "Entreprise",
  particulier: "Particulier",
};

const INVOICING_LABEL: Record<NonNullable<Client["invoicing"]>, string> = {
  par_evenement: "Par événement",
  mensuelle: "Mensuelle",
};

type View = "all" | "entreprise" | "particulier";
type SortKey = "name" | "signed";

interface ClientStats {
  nextDate?: string;
  signedThisYear: number;
  count: number;
}

function statsFor(events: AppEvent[], today: string): Map<string, ClientStats> {
  const year = today.slice(0, 4);
  const out = new Map<string, ClientStats>();
  for (const ev of events) {
    if (!ev.clientId) continue;
    const s = out.get(ev.clientId) ?? { signedThisYear: 0, count: 0 };
    s.count += 1;
    if (ev.date >= today && (!s.nextDate || ev.date < s.nextDate)) s.nextDate = ev.date;
    if (ev.date.startsWith(year)) s.signedThisYear += signedRevenue(ev);
    out.set(ev.clientId, s);
  }
  return out;
}

export default function Clients() {
  const { toast } = useToast();
  const [clients, setClients] = useState<Client[]>([]);
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [view, setView] = useState<View>("all");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notConfigured, setNotConfigured] = useState(false);
  const sortMenu = useMenu();

  useEffect(() => {
    // The clients table may not be provisioned yet; show a notice instead of an error.
    const clientsOrEmpty = api.clients.list().catch((e: unknown) => {
      if (e instanceof ApiError && e.status === 503) { setNotConfigured(true); return [] as Client[]; }
      return Promise.reject(e);
    });
    Promise.all([clientsOrEmpty, api.events.list()])
      .then(([c, e]) => { setClients(c); setEvents(e); })
      .catch(() => toast({ title: "Erreur de chargement", variant: "destructive" }))
      .finally(() => setLoading(false));
  }, [toast]);

  const today = todayIso();
  const year = today.slice(0, 4);
  const stats = useMemo(() => statsFor(events, today), [events, today]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = q ? clients.filter((c) => c.name.toLowerCase().includes(q) || c.contactName?.toLowerCase().includes(q)) : clients;
    if (view !== "all") list = list.filter((c) => c.kind === view);
    if (!showArchived) list = list.filter((c) => c.active !== false);
    return [...list].sort((a, b) => {
      if (sortKey === "signed") return (stats.get(b.clientId)?.signedThisYear ?? 0) - (stats.get(a.clientId)?.signedThisYear ?? 0);
      return a.name.localeCompare(b.name, "fr");
    }).sort((a, b) => Number(a.active === false) - Number(b.active === false));
  }, [clients, search, view, showArchived, sortKey, stats]);

  const archivedCount = clients.filter((c) => c.active === false).length;

  const searchField = (
    <input
      className="input-field input-compact w-[220px] touch:w-full"
      placeholder="Rechercher un client…"
      value={search}
      autoFocus
      onChange={(e) => setSearch(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
      onBlur={() => { if (!search) setSearchOpen(false); }}
    />
  );

  const more = (
    <ActionMenu
      title="Clients"
      items={[{ kind: "check", label: `Afficher les archivés${archivedCount ? ` (${archivedCount})` : ""}`, checked: showArchived, onClick: () => setShowArchived((v) => !v) }]}
    />
  );

  return (
    <div className="mx-auto max-w-wide">
      <PageHeader
        iconKey="clients"
        title="Clients"
        meta={`${clients.length} client${clients.length > 1 ? "s" : ""}`}
        actions={
          <Button as={Link} to="/clients/new" variant="primary" size="lg" icon={<Plus />}>
            <span className="hidden sm:inline">Nouveau client</span><span className="sm:hidden">Nouveau</span>
          </Button>
        }
      />

      <Toolbar
        left={
          <ViewTabs
            items={[{ key: "all", label: "Tous" }, { key: "entreprise", label: "Entreprises" }, { key: "particulier", label: "Particuliers" }]}
            value={view}
            onChange={(k) => setView(k as View)}
            aria-label="Type"
          />
        }
        right={
          <>
            {searchOpen ? searchField : <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen(true)} />}
            <div ref={sortMenu.ref} className="relative inline-flex">
              <Button variant="subtle" size="sm" icon={<ArrowUpDown />} onClick={sortMenu.toggle} aria-haspopup="menu" aria-expanded={sortMenu.open}>Trier</Button>
              <Menu {...sortMenu.props} align="right" title="Trier">
                <MenuRadio checked={sortKey === "name"} onSelect={() => setSortKey("name")}>Nom</MenuRadio>
                <MenuRadio checked={sortKey === "signed"} onSelect={() => setSortKey("signed")}>Signé {year}</MenuRadio>
              </Menu>
            </div>
            {more}
          </>
        }
        rightTouch={
          <>
            <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen((o) => !o)} className={searchOpen ? "bg-active" : ""} />
            {more}
          </>
        }
      />
      {searchOpen && (
        <div className="hidden items-center gap-1 py-2 touch:flex">
          {searchField}
          <IconButton size="sm" aria-label="Fermer la recherche" icon={<X />} onClick={() => { setSearch(""); setSearchOpen(false); }} />
        </div>
      )}

      {notConfigured && (
        <div className="mt-4">
          <Callout emoji="⚠️" tone="warning" title="Clients non configurés">
            La table ta-clients n'existe pas encore sur le serveur. <Link to="/settings#apropos" className="font-medium underline">Paramètres</Link>
          </Callout>
        </div>
      )}

      <div className="mt-2">
        {loading ? (
          <p className="py-6 text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <Table<Client>
            rows={filtered}
            rowKey={(c) => c.clientId}
            rowHref={(c) => `/clients/${c.clientId}`}
            groupBy={showArchived && archivedCount > 0 ? (c) => (c.active === false ? "Archivés" : "Actifs") : undefined}
            empty={<EmptyState message={clients.length === 0 ? "Aucun client pour l'instant." : "Aucun client ne correspond."} action={{ label: "+ Nouveau client", to: "/clients/new" }} />}
            columns={[
              {
                key: "name",
                label: "Nom",
                render: (c) => (
                  <span className="inline-flex items-center gap-2 font-medium">
                    <span aria-hidden="true" className="text-base leading-none">{c.kind === "particulier" ? PAGE_ICONS.particulier : PAGE_ICONS.client}</span>
                    {c.name}
                  </span>
                ),
              },
              { key: "kind", label: "Type", width: "130px", render: (c) => (c.kind ? <Tag colour={c.kind === "particulier" ? "purple" : "blue"}>{KIND_LABEL[c.kind]}</Tag> : "") },
              { key: "contact", label: "Contact", render: (c) => c.contactName ?? "" },
              { key: "invoicing", label: "Facturation", width: "150px", render: (c) => (c.invoicing ? <Tag colour="gray">{INVOICING_LABEL[c.invoicing]}</Tag> : "") },
              { key: "events", label: "Événements", width: "110px", align: "right", render: (c) => `${stats.get(c.clientId)?.count ?? 0}` },
              { key: "signed", label: `Signé ${year}`, width: "120px", align: "right", trailing: true, render: (c) => <span className="text-foreground">{fmtEur(stats.get(c.clientId)?.signedThisYear ?? 0)}</span> },
            ]}
          />
        )}
      </div>
    </div>
  );
}
