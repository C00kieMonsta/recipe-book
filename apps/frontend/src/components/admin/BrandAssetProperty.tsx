import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppSettings, BrandKind } from "@packages/types";
import { BRAND_IMAGE_TYPES, MAX_BRAND_IMAGE_BYTES } from "@packages/types";
import { api, ApiError, errorReason } from "@/lib/api";
import { brandImage } from "@/lib/pdf-images";
import { useToast } from "@/hooks/use-toast";
import { Button, Property } from "@/components/ui";

export interface BrandAssetPropertyProps {
  kind: BrandKind;
  // « Logo » or « Bannière ».
  label: string;
  // The stored S3 key (brandLogoKey or brandBannerKey); no thumbnail without one.
  value: string | undefined;
  // settings.updatedAt; a replaced image is refetched under a new version.
  version: string;
  // The settings returned by the upload or the removal.
  onChange: (settings: AppSettings) => void;
  sub?: ReactNode;
  readOnly?: boolean;
}

export const BRAND_TOO_LARGE = "Image trop volumineuse (max 5 Mo)";
export const BRAND_BAD_FORMAT = "Format non pris en charge (JPEG ou PNG)";

const ACCEPT = "image/jpeg,image/png";

const NOUN: Record<BrandKind, { saved: string; removed: string }> = {
  logo: { saved: "Logo enregistré", removed: "Logo retiré" },
  banner: { saved: "Bannière enregistrée", removed: "Bannière retirée" },
};

// The client-side refusal for a file, undefined when it can go up.
export function brandFileProblem(file: Pick<File, "size" | "type">): string | undefined {
  if (file.size > MAX_BRAND_IMAGE_BYTES) return BRAND_TOO_LARGE;
  if (!(file.type in BRAND_IMAGE_TYPES)) return BRAND_BAD_FORMAT;
  return undefined;
}

// The brand route sits behind the admin guard, so the thumbnail comes from brandImage (fetched with the token, cached by kind and version).
function useBrandThumbnail(kind: BrandKind, key: string | undefined, version: string): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!key) { setUrl(null); return; }
    let cancelled = false;
    brandImage(kind, version)
      .then((image) => { if (!cancelled) setUrl(image?.dataUrl ?? null); })
      .catch(() => { if (!cancelled) setUrl(null); });
    return () => { cancelled = true; };
  }, [kind, key, version]);
  return url;
}

export default function BrandAssetProperty({ kind, label, value, version, onChange, sub, readOnly }: BrandAssetPropertyProps) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const thumbnail = useBrandThumbnail(kind, value, version);
  const inputId = `brand-${kind}-file`;

  const upload = async (file: File) => {
    const problem = brandFileProblem(file);
    if (problem) { toast({ title: problem, variant: "destructive" }); return; }
    setBusy(true);
    try {
      onChange(await api.settings.brand.upload(kind, file));
      toast({ title: NOUN[kind].saved });
    } catch (e) {
      const reason = e instanceof ApiError && e.status === 400 ? BRAND_BAD_FORMAT : errorReason(e);
      toast({ title: reason || "Image non enregistrée", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      onChange(await api.settings.brand.remove(kind));
      toast({ title: NOUN[kind].removed });
    } catch (e) {
      toast({ title: errorReason(e) || "Image non retirée", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const pick = () => inputRef.current?.click();

  return (
    <Property label={label} kind="custom" sub={sub}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {thumbnail ? (
          <img src={thumbnail} alt={label} className="h-10 max-w-40 rounded bg-callout object-contain" />
        ) : (
          <span aria-hidden="true" className="flex h-10 w-16 items-center justify-center rounded border border-dashed border-divider text-caption text-placeholder">
            {value ? "" : "Aucune"}
          </span>
        )}
        {!readOnly && (
          <>
            <Button variant="default" size="sm" onClick={pick} disabled={busy}>{value ? "Remplacer" : "Ajouter"}</Button>
            {value && (
              <button type="button" onClick={remove} disabled={busy} className="rounded px-1 text-sm text-danger hover:underline disabled:pointer-events-none disabled:opacity-50 touch:min-h-11 touch:text-base">
                Retirer
              </button>
            )}
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={ACCEPT}
              className="sr-only"
              aria-label={`${label} : choisir une image`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </>
        )}
      </div>
    </Property>
  );
}
