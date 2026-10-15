import { useEffect, useRef, useState } from "react";
import { useTouchScreen } from "@/hooks/use-touch-screen";
import { Button, Dialog } from "@/components/ui";

export interface DocumentPreviewDialogProps {
  open: boolean;
  onClose: () => void;
  // Blob URL of the generated PDF; the caller revokes it after closing.
  url: string | null;
  // Sheet and tab title: « Offre buffets automne hiver 2026 ».
  title?: string;
}

// The PDF in an iframe; on touch the blob URL opens in a new tab instead and nothing is rendered.
export default function DocumentPreviewDialog({ open, onClose, url, title }: DocumentPreviewDialogProps) {
  const touch = useTouchScreen();
  const [blocked, setBlocked] = useState(false);
  // The URL already sent to a tab, so a re-run of the effect does not open it twice.
  const opened = useRef<string | null>(null);

  useEffect(() => {
    if (!open || !touch || !url || opened.current === url) return;
    opened.current = url;
    // No « noopener » feature: Chromium then returns null even when the tab opened.
    const win = window.open(url, "_blank");
    if (win) { setBlocked(false); onClose(); return; }
    // A popup blocker swallowed the tab: offer a link the user can tap.
    setBlocked(true);
  }, [open, touch, url, onClose]);

  if (!open || !url) return null;

  if (touch) {
    if (!blocked) return null;
    return (
      <Dialog
        open
        onClose={() => { setBlocked(false); onClose(); }}
        title={title ?? "Aperçu du PDF"}
        size="sm"
        footer={<Button variant="default" onClick={() => { setBlocked(false); onClose(); }}>Fermer</Button>}
      >
        <p className="text-muted-foreground">Le navigateur a bloqué l'ouverture du PDF.</p>
        <Button as="a" href={url} target="_blank" rel="noreferrer" variant="primary" className="mt-3">
          Ouvrir le PDF
        </Button>
      </Dialog>
    );
  }

  return (
    <Dialog open onClose={onClose} title={title ?? "Aperçu du PDF"} size="lg">
      <iframe title="Aperçu du PDF" src={url} className="h-[75dvh] w-full rounded bg-callout" />
    </Dialog>
  );
}
