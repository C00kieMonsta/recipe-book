import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import { File, FileSpreadsheet, FileText, Image, Plus } from "lucide-react";
import type { AppEvent, EventAttachment, FileKind } from "@packages/types";
import { ATTACHMENT_TYPES, MAX_ATTACHMENTS, fileKindOf, fmtFileSize } from "@packages/types";
import { api, ApiError, errorReason } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { ActionMenu, Button, Dialog, ListRow, Section } from "@/components/ui";

export interface AttachmentsSectionProps {
  event: AppEvent;
  onChange: (event: AppEvent) => void;
}

const ACCEPT = ".pdf,image/*,.docx,.xlsx,.txt";
const ICON_CLASS = "h-4 w-4 text-icon touch:h-5 touch:w-5";
const EDIT_INPUT = "-mx-1.5 w-full min-w-0 rounded border-0 bg-input-bg px-1.5 text-sm font-medium shadow-ring outline-none touch:text-base";

const dayMonth = new Intl.DateTimeFormat("fr-BE", { day: "numeric", month: "short", timeZone: "Europe/Brussels" });

function kindIcon(kind: FileKind) {
  if (kind === "pdf" || kind === "doc" || kind === "text") return <FileText className={ICON_CLASS} />;
  if (kind === "image") return <Image className={ICON_CLASS} />;
  if (kind === "sheet") return <FileSpreadsheet className={ICON_CLASS} />;
  return <File className={ICON_CLASS} />;
}

function attachmentMeta(a: EventAttachment): string {
  const date = new Date(a.addedAt);
  const day = Number.isNaN(date.getTime()) ? "" : dayMonth.format(date);
  return day ? `${fmtFileSize(a.size)} · ${day}` : fmtFileSize(a.size);
}

function uploadErrorTitle(e: unknown): string {
  if (e instanceof ApiError && e.status === 413) return "Fichier trop volumineux (max 20 Mo)";
  return errorReason(e) || "Envoi impossible";
}

export default function AttachmentsSection({ event, onChange }: AttachmentsSectionProps) {
  const { toast } = useToast();
  const touch = useTouchScreen();
  const attachments = event.attachments ?? [];
  const inputRef = useRef<HTMLInputElement>(null);
  const [queue, setQueue] = useState<File[]>([]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [deleting, setDeleting] = useState<EventAttachment | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const renameRef = useRef<HTMLInputElement>(null);
  const uploading = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Focus after the menu (a Sheet on touch) has given focus back to its trigger.
  useEffect(() => {
    if (!renamingId) return;
    renameRef.current?.focus();
    renameRef.current?.select();
  }, [renamingId]);

  // One upload at a time; the first queued file goes next.
  useEffect(() => {
    if (uploading.current || queue.length === 0) return;
    const file = queue[0];
    uploading.current = true;
    api.events.attachments
      .add(event.eventId, file)
      .then((next) => onChangeRef.current(next))
      .catch((e: unknown) => toast({ title: uploadErrorTitle(e), description: file.name, variant: "destructive" }))
      .finally(() => {
        uploading.current = false;
        setQueue((q) => q.slice(1));
      });
  }, [queue, event.eventId, toast]);

  const enqueue = (files: FileList | File[]) => {
    const accepted: File[] = [];
    let total = attachments.length + queue.length;
    let tooMany = false;
    for (const file of Array.from(files)) {
      if (!(file.type in ATTACHMENT_TYPES)) {
        toast({ title: "Format non pris en charge", description: file.name, variant: "destructive" });
        continue;
      }
      if (total >= MAX_ATTACHMENTS) { tooMany = true; continue; }
      total += 1;
      accepted.push(file);
    }
    if (tooMany) toast({ title: "20 pièces jointes maximum", variant: "destructive" });
    if (accepted.length) setQueue((q) => [...q, ...accepted]);
  };

  const pick = () => inputRef.current?.click();

  const open = async (a: EventAttachment) => {
    try {
      const { url } = await api.events.attachments.url(event.eventId, a.attachmentId);
      window.open(url, "_blank", "noopener");
    } catch {
      toast({ title: "Impossible d'ouvrir le fichier", variant: "destructive" });
    }
  };

  const startRename = (a: EventAttachment) => {
    setDraft(a.name);
    setRenamingId(a.attachmentId);
  };

  const commitRename = async (a: EventAttachment) => {
    if (renamingId !== a.attachmentId) return;
    setRenamingId(null);
    const name = draft.trim();
    if (!name || name === a.name) return;
    try {
      onChange(await api.events.attachments.rename(event.eventId, a.attachmentId, name));
    } catch (e) {
      toast({ title: errorReason(e) || "Renommage impossible", variant: "destructive" });
    }
  };

  const onRenameKey = (e: KeyboardEvent<HTMLInputElement>, a: EventAttachment) => {
    if (e.key === "Enter") { e.preventDefault(); void commitRename(a); }
    if (e.key === "Escape") { e.preventDefault(); setRenamingId(null); }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      onChange(await api.events.attachments.remove(event.eventId, deleting.attachmentId));
      setDeleting(null);
    } catch (e) {
      toast({ title: errorReason(e) || "Suppression impossible", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");
  const dropHandlers = touch
    ? {}
    : {
        onDragEnter: (e: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          setDragOver(true);
        },
        onDragOver: (e: DragEvent<HTMLDivElement>) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
          if (!dragOver) setDragOver(true);
        },
        onDragLeave: () => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragOver(false);
        },
        onDrop: (e: DragEvent<HTMLDivElement>) => {
          e.preventDefault();
          dragDepth.current = 0;
          setDragOver(false);
          if (e.dataTransfer.files.length) enqueue(e.dataTransfer.files);
        },
      };

  const totalBytes = attachments.reduce((sum, a) => sum + (a.size || 0), 0);
  const meta = attachments.length > 0
    ? `${attachments.length} ${attachments.length === 1 ? "fichier" : "fichiers"} · ${fmtFileSize(totalBytes)}`
    : undefined;

  const renderRow = (a: EventAttachment) => {
    const renaming = renamingId === a.attachmentId;
    const title = renaming ? (
      <input
        ref={renameRef}
        aria-label="Nom du fichier"
        className={EDIT_INPUT}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => onRenameKey(e, a)}
        onBlur={() => void commitRename(a)}
      />
    ) : (
      <button type="button" className="max-w-full truncate rounded text-left hover:underline focus-visible:outline-none focus-visible:shadow-ring" onClick={() => void open(a)}>
        {a.name}
      </button>
    );
    const meta = attachmentMeta(a);
    return (
      <ListRow
        key={a.attachmentId}
        className="touch:py-0"
        icon={kindIcon(fileKindOf(a.contentType, a.name))}
        title={title}
        subtitle={touch ? meta : undefined}
        trailing={
          <>
            {!touch && <span className="whitespace-nowrap">{meta}</span>}
            <ActionMenu
              className="reveal"
              title={a.name}
              items={[
                { label: "Ouvrir", onClick: () => void open(a) },
                { label: "Renommer", onClick: () => startRename(a) },
                { kind: "separator" },
                { label: "Supprimer", onClick: () => setDeleting(a), variant: "danger" },
              ]}
            />
          </>
        }
      />
    );
  };

  return (
    <Section
      title="Pièces jointes"
      meta={meta}
      action={<Button variant="ghost" size="sm" icon={<Plus />} onClick={pick}>Ajouter</Button>}
    >
      <input ref={inputRef} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { if (e.target.files) enqueue(e.target.files); e.target.value = ""; }} />
      <div className={`relative min-h-9 rounded transition-colors ${dragOver ? "bg-selected" : ""}`} {...dropHandlers}>
        {attachments.length === 0 && queue.length === 0 ? (
          <p className={`px-2 py-1.5 text-sm text-muted-foreground ${dragOver ? "invisible" : ""}`}>Aucune pièce jointe. Devis signé, plan de salle, photo du lieu…</p>
        ) : (
          <div className={dragOver ? "invisible" : undefined}>
            {attachments.map(renderRow)}
            {queue.map((file, i) => (
              <ListRow
                key={`${file.name}-${i}`}
                className="touch:py-0"
                icon={kindIcon(fileKindOf(file.type, file.name))}
                title={<span className="font-normal text-muted-foreground">{file.name}</span>}
                trailing={<span>Envoi…</span>}
              />
            ))}
          </div>
        )}
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded bg-selected text-sm font-medium text-primary">
            Déposer les fichiers ici
          </div>
        )}
      </div>

      <Dialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        size="sm"
        title={`Supprimer « ${deleting?.name ?? ""} » ?`}
        footer={
          <>
            <Button variant="default" onClick={() => setDeleting(null)}>Annuler</Button>
            <Button variant="danger" onClick={() => void confirmDelete()} disabled={busy}>Supprimer</Button>
          </>
        }
      >
        <p className="text-muted-foreground">Le fichier est effacé définitivement.</p>
      </Dialog>
    </Section>
  );
}
