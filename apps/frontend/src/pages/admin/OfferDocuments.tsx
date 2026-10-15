import { useEffect, useMemo, useState, type MouseEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { jsPDF } from "jspdf";
import { ArrowUpDown, Plus, Search, X } from "lucide-react";
import type { AppSettings, DocSeason, OfferDocument } from "@packages/types";
import {
  DEFAULT_BRAND_ACCENT,
  DEFAULT_DOC_CONDITIONS,
  DEFAULT_DOC_SERVICES,
  DEFAULT_DOC_VAT_LINES,
  dayMonthLabel,
  documentBlocks,
  documentFileName,
} from "@packages/types";
import { api, ApiError, errorReason, invalidate } from "@/lib/api";
import { brandImage, type PdfImage } from "@/lib/pdf-images";
import { exportOfferDocumentPdf } from "@/lib/offer-document-pdf";
import { plural } from "@/lib/use-planning-data";
import { useToast } from "@/hooks/use-toast";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useTopTitle } from "@/components/admin/AdminLayout";
import OffersTabs from "@/components/admin/OffersTabs";
import {
  ActionMenu,
  Button,
  Checkbox,
  Dialog,
  EmptyState,
  FieldLabel,
  IconButton,
  Menu,
  MenuRadio,
  NumericInput,
  PageHeader,
  Table,
  Tag,
  Toolbar,
  useMenu,
} from "@/components/ui";

type Sort = "year" | "title" | "updated";

export const SEASON_LABELS: Record<DocSeason, string> = {
  printemps_ete: "Printemps-été",
  automne_hiver: "Automne-hiver",
  toute_annee: "Toute l'année",
};

const EMPTY_SENTENCE = "Aucun document. Un document est l'offre que vous envoyez : formules, prix, conditions, en PDF à votre image.";
const IMPORT_CAPTION =
  "Brunch à emporter, chef à domicile, walking dinner, buffets printemps-été et automne-hiver, baptême, carte à emporter. Les plats et les prix sont repris tels quels ; vous pourrez tout modifier. Les documents déjà présents (même titre et même année) ne sont pas touchés.";
const PRESTATION_MAX = 28;

// « 12 octobre » from the ISO stamp, on the local calendar day.
export function modifiedLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return dayMonthLabel(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

// « Offre buffets automne hiver 2026 »
export function documentLabel(d: Pick<OfferDocument, "title" | "year">): string {
  return `${d.title} ${d.year}`;
}

export interface DocumentPdf {
  doc: jsPDF;
  fileName: string;
  // Neither the logo nor the banner is set: the band prints the company name and the banner is skipped.
  missingAssets: boolean;
}

// The brand images for the PDF; a missing image (404) or a failed stack answers null.
export async function loadBrandImages(settings: AppSettings | null): Promise<{ logo: PdfImage | null; banner: PdfImage | null }> {
  const version = settings?.updatedAt ?? "";
  const [logo, banner] = await Promise.all([
    settings?.brandLogoKey ? brandImage("logo", version).catch(() => null) : null,
    settings?.brandBannerKey ? brandImage("banner", version, { cropRatio: 4 }).catch(() => null) : null,
  ]);
  return { logo, banner };
}

// Builds the brochure in memory; callers save it or open it in the preview.
export async function buildDocumentPdf(document: OfferDocument, settings: AppSettings | null): Promise<DocumentPdf> {
  const company = settings?.company;
  const { logo, banner } = await loadBrandImages(settings);
  const footer = [company?.name, company?.phone, company?.email, company?.website].filter(Boolean).join(" · ");
  const fileName = documentFileName(document);
  const doc = exportOfferDocumentPdf({
    blocks: documentBlocks(document, company),
    accent: company?.accent ?? DEFAULT_BRAND_ACCENT,
    logo: logo ?? undefined,
    banner: banner ?? undefined,
    footer,
    fileName,
  });
  return { doc, fileName, missingAssets: !logo && !banner };
}

export interface DuplicateDocumentDialogProps {
  document: OfferDocument | null;
  onClose: () => void;
  onDuplicated: (copy: OfferDocument, archivedSource: boolean) => void;
}

// « Dupliquer pour 2027… »: the next year prefilled, the source archived unless unticked.
export function DuplicateDocumentDialog({ document, onClose, onDuplicated }: DuplicateDocumentDialogProps) {
  const { toast } = useToast();
  const [year, setYear] = useState(0);
  const [archiveSource, setArchiveSource] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!document) return;
    setYear(document.year + 1);
    setArchiveSource(!document.archived);
    setBusy(false);
  }, [document]);

  const confirm = async () => {
    if (!document || busy) return;
    setBusy(true);
    try {
      const copy = await api.offerDocuments.duplicate(document.documentId, { year, archiveSource });
      toast({ title: `« ${documentLabel(copy)} » créé` });
      onDuplicated(copy, archiveSource);
      onClose();
    } catch (e) {
      toast({ title: "Erreur lors de la duplication", description: errorReason(e) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={document !== null}
      onClose={onClose}
      size="sm"
      title={<span className="whitespace-normal">Dupliquer « {document?.title ?? ""} »</span>}
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button variant="primary" onClick={confirm} disabled={busy || year < 2020}>Dupliquer</Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div>
          <FieldLabel htmlFor="duplicate-document-year">Année</FieldLabel>
          <NumericInput id="duplicate-document-year" value={year} min={2020} className="input-field w-28 tabular-nums" onChange={(v) => setYear(Math.round(v))} />
        </div>
        {document && !document.archived && (
          <Checkbox checked={archiveSource} onChange={setArchiveSource} label={`Archiver la version ${document.year}`} />
        )}
      </div>
    </Dialog>
  );
}

export interface DeleteDocumentDialogProps {
  document: OfferDocument | null;
  onClose: () => void;
  onDeleted: (document: OfferDocument) => void;
}

export function DeleteDocumentDialog({ document, onClose, onDeleted }: DeleteDocumentDialogProps) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (document) setBusy(false); }, [document]);

  const confirm = async () => {
    if (!document || busy) return;
    setBusy(true);
    try {
      await api.offerDocuments.delete(document.documentId);
      toast({ title: "Document supprimé" });
      onDeleted(document);
      onClose();
    } catch (e) {
      toast({ title: "Erreur lors de la suppression", description: errorReason(e) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={document !== null}
      onClose={onClose}
      size="sm"
      title={<span className="whitespace-normal">Supprimer « {document ? documentLabel(document) : ""} » ?</span>}
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button variant="danger" onClick={confirm} disabled={busy}>Supprimer</Button>
        </>
      }
    >
      <p className="text-caption text-muted-foreground">Les formules et les événements créés depuis ce document ne changent pas.</p>
    </Dialog>
  );
}

// Rendered once per toolbar slot, so each copy owns its menu state.
function SortMenu({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  const menu = useMenu();
  return (
    <div ref={menu.ref} className="relative inline-flex">
      <Button variant="subtle" size="sm" icon={<ArrowUpDown />} onClick={menu.toggle} aria-haspopup="menu" aria-expanded={menu.open}>
        Trier
      </Button>
      <Menu {...menu.props} align="right" title="Trier">
        <MenuRadio checked={value === "year"} onSelect={() => onChange("year")}>Année</MenuRadio>
        <MenuRadio checked={value === "title"} onSelect={() => onChange("title")}>Titre</MenuRadio>
        <MenuRadio checked={value === "updated"} onSelect={() => onChange("updated")}>Modifié</MenuRadio>
      </Menu>
    </div>
  );
}

// The phone list row is one link: the default navigation must go too, not only the bubbling.
const stop = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); };

export default function OfferDocuments() {
  useTopTitle("Offres");
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const archivedView = params.get("vue") === "archivees";

  const [documents, setDocuments] = useState<OfferDocument[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<Sort>("year");
  const [importOpen, setImportOpen] = useState(false);
  const [duplicating, setDuplicating] = useState<OfferDocument | null>(null);
  const [deleting, setDeleting] = useState<OfferDocument | null>(null);
  const [busy, setBusy] = useState(false);
  // Under md the « Devis » button leaves the header for the ⋯ menu.
  const narrow = useMediaQuery("(max-width: 767px)");

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.offerDocuments.list(), api.settings.get()])
      .then(([docs, se]) => {
        if (cancelled) return;
        setDocuments(docs);
        setSettings(se);
      })
      .catch(() => { if (!cancelled) { setLoadError(true); toast({ title: "Erreur de chargement", variant: "destructive" }); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const reload = async () => {
    invalidate("offerDocuments");
    const docs = await api.offerDocuments.list();
    setDocuments(docs);
    return docs;
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = documents
      .filter((d) => (archivedView ? d.archived === true : !d.archived))
      .filter((d) => !q || d.titleLower.includes(q) || String(d.year).includes(q));
    const byTitle = (a: OfferDocument, b: OfferDocument) => a.titleLower.localeCompare(b.titleLower, "fr");
    list.sort((a, b) => {
      if (sort === "title") return byTitle(a, b) || b.year - a.year;
      if (sort === "updated") return b.updatedAt.localeCompare(a.updatedAt) || byTitle(a, b);
      return b.year - a.year || byTitle(a, b);
    });
    return list;
  }, [documents, archivedView, search, sort]);

  const archivedCount = documents.filter((d) => d.archived).length;
  const activeCount = documents.length - archivedCount;

  const createNew = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const created = await api.offerDocuments.create({
        title: "Nouveau document",
        year: new Date().getFullYear(),
        prestationLabel: "À emporter",
        sections: [],
        services: DEFAULT_DOC_SERVICES,
        conditions: DEFAULT_DOC_CONDITIONS,
        vatLines: DEFAULT_DOC_VAT_LINES,
      });
      navigate(`/offres/documents/${created.documentId}`);
    } catch (e) {
      toast({ title: "Erreur lors de la création du document", description: errorReason(e) || undefined, variant: "destructive" });
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await api.offerDocuments.import2026();
      const docs = await reload();
      const first = result.created[0];
      const opened = first ? docs.filter((d) => d.title === first).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] : undefined;
      const title = result.skipped.length
        ? `${plural(result.created.length, "document importé", "documents importés")} · ${result.skipped.length} déjà ${result.skipped.length > 1 ? "présents" : "présent"}`
        : plural(result.created.length, "document importé", "documents importés");
      toast({ title, action: opened ? { label: "Ouvrir", onClick: () => navigate(`/offres/documents/${opened.documentId}`) } : undefined });
      setImportOpen(false);
    } catch (e) {
      reload().catch(() => undefined);
      toast({ title: "Erreur lors de l'import", description: errorReason(e) || undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const setArchived = async (document: OfferDocument, archived: boolean) => {
    try {
      const updated = await api.offerDocuments.update(document.documentId, { archived, updatedAt: document.updatedAt });
      setDocuments((prev) => prev.map((d) => (d.documentId === updated.documentId ? updated : d)));
      toast({ title: archived ? "Document archivé" : "Document réactivé" });
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) toast({ title: "Le document a changé ailleurs, il a été rechargé", variant: "destructive" });
      else toast({ title: "Erreur lors de la sauvegarde", description: errorReason(e) || undefined, variant: "destructive" });
      reload().catch(() => undefined);
    }
  };

  const download = async (document: OfferDocument) => {
    try {
      const { doc, fileName } = await buildDocumentPdf(document, settings);
      doc.save(fileName);
      toast({ title: "PDF téléchargé" });
    } catch (e) {
      toast({ title: "Erreur lors de la génération du PDF", description: errorReason(e) || undefined, variant: "destructive" });
    }
  };

  if (loading) return <div className="p-8 text-muted-foreground">Chargement…</div>;
  if (loadError) return <div className="p-8 text-muted-foreground">Erreur de chargement.</div>;

  const searchField = (
    <input
      className="input-field input-compact w-[220px] touch:w-full"
      placeholder="Rechercher un document…"
      value={search}
      autoFocus
      onChange={(e) => setSearch(e.target.value)}
      onKeyDown={(e) => { if (e.key === "Escape") { setSearch(""); setSearchOpen(false); } }}
      onBlur={() => { if (!search) setSearchOpen(false); }}
    />
  );

  const rowMenu = (document: OfferDocument) => (
    <span onClick={stop} className="inline-flex pointer:opacity-0 pointer:focus-within:opacity-100 pointer:[tr:hover_&]:opacity-100">
      <ActionMenu
        title={documentLabel(document)}
        items={[
          { label: "Télécharger le PDF", onClick: () => { void download(document); } },
          { label: `Dupliquer pour ${document.year + 1}…`, onClick: () => setDuplicating(document) },
          document.archived
            ? { label: "Réactiver", onClick: () => { void setArchived(document, false); } }
            : { label: "Archiver", onClick: () => { void setArchived(document, true); } },
          { kind: "separator" },
          { label: "Supprimer", variant: "danger", onClick: () => setDeleting(document) },
        ]}
      />
    </span>
  );

  const tableEmpty = search.trim() ? "Aucun résultat" : archivedView ? "Aucun document archivé." : "Aucun document actif.";
  const meta = archivedView ? plural(archivedCount, "document archivé", "documents archivés") : plural(activeCount, "document");

  return (
    <div className="mx-auto max-w-wide">
      <PageHeader
        iconKey="documents"
        title="Offres"
        meta={meta}
        actions={
          <>
            <Button as={Link} to="/devis" variant="default" size="md" className="hidden md:inline-flex">Devis</Button>
            <ActionMenu
              title="Offres"
              items={[
                ...(narrow ? [{ label: "Devis", onClick: () => navigate("/devis") }, { kind: "separator" as const }] : []),
                { label: "Importer les offres 2026", onClick: () => setImportOpen(true) },
              ]}
            />
            <Button variant="primary" size="lg" icon={<Plus />} onClick={createNew} disabled={busy}>
              <span className="hidden sm:inline">Nouveau document</span><span className="sm:hidden">Nouveau</span>
            </Button>
          </>
        }
      />

      {documents.length === 0 ? (
        <div data-tour="documents-list" className="flex flex-col items-center gap-3 py-10 text-center">
          <p className="max-w-md text-sm text-muted-foreground touch:text-base">{EMPTY_SENTENCE}</p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button variant="link" size="sm" onClick={createNew} disabled={busy}>+ Nouveau document</Button>
            <Button variant="default" size="md" onClick={() => setImportOpen(true)} disabled={busy}>Importer les offres 2026</Button>
          </div>
        </div>
      ) : (
        <div data-tour="documents-list">
          <Toolbar
            left={<OffersTabs current={archivedView ? "archivees" : "documents"} base="/offres/documents" />}
            right={
              <>
                {searchOpen ? searchField : <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen(true)} />}
                <SortMenu value={sort} onChange={setSort} />
              </>
            }
            rightTouch={
              <>
                <IconButton size="sm" aria-label="Rechercher" icon={<Search />} onClick={() => setSearchOpen((o) => !o)} className={searchOpen ? "bg-active" : ""} />
                <SortMenu value={sort} onChange={setSort} />
              </>
            }
          />
          {searchOpen && (
            <div className="hidden items-center gap-1 py-2 touch:flex">
              {searchField}
              <IconButton size="sm" aria-label="Fermer la recherche" icon={<X />} onClick={() => { setSearch(""); setSearchOpen(false); }} />
            </div>
          )}

          <div className="mt-2">
            <Table<OfferDocument>
              rows={rows}
              rowKey={(d) => d.documentId}
              rowHref={(d) => `/offres/documents/${d.documentId}`}
              empty={<EmptyState message={tableEmpty} />}
              columns={[
                { key: "title", label: "Titre", width: "260px", render: (d) => <span className="font-medium">{d.title}</span> },
                { key: "season", label: "Saison", width: "1%", className: "whitespace-nowrap", render: (d) => (d.season ? <Tag colour="gray">{SEASON_LABELS[d.season]}</Tag> : "") },
                { key: "year", label: "Année", width: "80px", align: "right", trailing: true, render: (d) => <span className="text-foreground">{d.year}</span> },
                {
                  key: "prestation",
                  label: "Prestation",
                  render: (d) => (d.prestationLabel ? <span title={d.prestationLabel}>{truncate(d.prestationLabel, PRESTATION_MAX)}</span> : ""),
                },
                {
                  key: "sections",
                  label: "Sections",
                  width: "90px",
                  align: "right",
                  render: (d) => d.sections.length,
                },
                { key: "updated", label: "Modifié", width: "120px", className: "whitespace-nowrap", render: (d) => modifiedLabel(d.updatedAt) },
                { key: "actions", label: "", width: "40px", align: "right", trailing: true, render: (d) => rowMenu(d) },
              ]}
            />
          </div>
        </div>
      )}

      <Dialog
        open={importOpen}
        onClose={() => { if (!busy) setImportOpen(false); }}
        size="sm"
        title="Importer les sept offres de 2026 ?"
        footer={
          <>
            <Button variant="default" onClick={() => setImportOpen(false)} disabled={busy}>Annuler</Button>
            <Button variant="primary" onClick={runImport} disabled={busy}>Importer</Button>
          </>
        }
      >
        <p className="text-caption text-muted-foreground">{IMPORT_CAPTION}</p>
      </Dialog>

      <DuplicateDocumentDialog
        document={duplicating}
        onClose={() => setDuplicating(null)}
        onDuplicated={(copy) => navigate(`/offres/documents/${copy.documentId}`)}
      />
      <DeleteDocumentDialog
        document={deleting}
        onClose={() => setDeleting(null)}
        onDeleted={(d) => setDocuments((prev) => prev.filter((x) => x.documentId !== d.documentId))}
      />
    </div>
  );
}
