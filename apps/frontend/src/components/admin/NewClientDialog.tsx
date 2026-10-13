import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Client, ClientKind } from "@packages/types";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button, Dialog, FieldLabel, TAG_BASE, TAG_COLOUR_CLASS } from "@/components/ui";

export interface NewClientInitial { name?: string; kind?: ClientKind; contactName?: string; phone?: string; email?: string }

export interface NewClientDialogProps {
  open: boolean;
  onClose: () => void;
  initial: NewClientInitial;
  existing: Pick<Client, "clientId" | "name">[];
  onCreated: (client: Client) => void | Promise<void>;
  // Shown as "Le lier" when the name matches an existing client.
  onLinkExisting?: (clientId: string) => void | Promise<void>;
}

const KINDS: { value: ClientKind; label: string }[] = [
  { value: "particulier", label: "Particulier" },
  { value: "entreprise", label: "Entreprise" },
];

const KIND_TAG = `${TAG_BASE} h-7 cursor-pointer px-2.5 touch:h-11 touch:px-3.5 touch:text-base`;

export default function NewClientDialog({ open, onClose, initial, existing, onCreated, onLinkExisting }: NewClientDialogProps) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<ClientKind>("particulier");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);

  // Fields reset when the dialog opens; a new initial object while open must not wipe typing.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  useEffect(() => {
    if (!open) return;
    const init = initialRef.current;
    setName(init.name ?? "");
    setKind(init.kind ?? "particulier");
    setPhone(init.phone ?? "");
    setEmail(init.email ?? "");
    setBusy(false);
  }, [open]);

  const trimmed = name.trim();
  const duplicate = trimmed ? existing.find((c) => c.name.trim().toLowerCase() === trimmed.toLowerCase()) : undefined;
  const contactName = initial.contactName?.trim() ?? "";
  const sendContact = contactName !== "" && contactName.toLowerCase() !== trimmed.toLowerCase();

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const client = await api.clients.create({
        name: trimmed,
        kind,
        ...(sendContact ? { contactName } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim() } : {}),
        templates: [],
        active: true,
      });
      await onCreated(client);
      onClose();
    } catch {
      toast({ title: "Erreur lors de la création du client", variant: "destructive" });
      setBusy(false);
    }
  };

  const link = async () => {
    if (!duplicate || !onLinkExisting) return;
    await onLinkExisting(duplicate.clientId);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title="Nouveau client"
      footer={
        <>
          <Button variant="default" onClick={onClose}>Annuler</Button>
          <Button variant="primary" type="submit" form="new-client-form" disabled={!trimmed || busy}>
            {duplicate ? "Créer quand même" : "Créer et lier"}
          </Button>
        </>
      }
    >
      <form id="new-client-form" onSubmit={submit} className="flex flex-col gap-3">
        <div>
          <FieldLabel htmlFor="new-client-name">Nom du client</FieldLabel>
          <input id="new-client-name" className="input-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <FieldLabel>Type</FieldLabel>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Type">
            {KINDS.map((k) => {
              const on = kind === k.value;
              return (
                <button
                  key={k.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setKind(k.value)}
                  className={cn(KIND_TAG, on ? TAG_COLOUR_CLASS.blue : `${TAG_COLOUR_CLASS.gray} hover:bg-hover`)}
                >
                  {k.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="new-client-phone">Téléphone</FieldLabel>
          <input id="new-client-phone" type="tel" className="input-field" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div>
          <FieldLabel htmlFor="new-client-email">E-mail</FieldLabel>
          <input id="new-client-email" type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <p className="text-caption text-muted-foreground">Le contact de l'événement est copié sur la fiche client. L'événement garde le sien.</p>
        {duplicate && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm">
            <span>Un client « {duplicate.name} » existe déjà</span>
            {onLinkExisting && (
              <button type="button" onClick={link} className="text-primary hover:underline touch:min-h-11">Le lier</button>
            )}
          </p>
        )}
      </form>
    </Dialog>
  );
}
