export type FileKind = "pdf" | "image" | "doc" | "sheet" | "text" | "other";

// Allowed upload types: mimetype to canonical extension.
export const ATTACHMENT_TYPES: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/gif": ".gif",
  "text/plain": ".txt",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_ATTACHMENTS = 20;

const KIND_BY_TYPE: Record<string, FileKind> = {
  "application/pdf": "pdf",
  "text/plain": "text",
  "text/csv": "sheet",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "doc",
  "application/vnd.ms-excel": "sheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "sheet",
};

const KIND_BY_EXT: Record<string, FileKind> = {
  ".pdf": "pdf",
  ".jpg": "image",
  ".jpeg": "image",
  ".png": "image",
  ".webp": "image",
  ".heic": "image",
  ".heif": "image",
  ".gif": "image",
  ".doc": "doc",
  ".docx": "doc",
  ".xls": "sheet",
  ".xlsx": "sheet",
  ".csv": "sheet",
  ".txt": "text",
  ".md": "text",
};

// Lower-case extension with the dot, letters and digits only, at most 8 characters, "" when none.
export function safeExt(name: string): string {
  const m = /\.([a-z0-9]{1,8})$/i.exec(name.trim());
  return m ? `.${m[1].toLowerCase()}` : "";
}

export function fileKindOf(contentType: string, name?: string): FileKind {
  const type = contentType.trim().toLowerCase().split(";")[0];
  if (type.startsWith("image/")) return "image";
  const byType = KIND_BY_TYPE[type];
  if (byType) return byType;
  return KIND_BY_EXT[safeExt(name ?? "")] ?? "other";
}

const KO = 1024;
const MO = KO * 1024;
const fmtKo = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });
const fmtMo = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 });

// fr-BE: "850 Ko", "1,2 Mo", "12 Mo"; bytes under 1 Ko print "1 Ko".
export function fmtFileSize(bytes: number): string {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0;
  if (b < KO) return "1 Ko";
  if (b < MO) return `${fmtKo.format(b / KO)} Ko`;
  return `${fmtMo.format(b / MO)} Mo`;
}
