import { ATTACHMENT_TYPES, MAX_ATTACHMENTS, MAX_ATTACHMENT_BYTES, fileKindOf, fmtFileSize, safeExt } from "./files";

const plain = (s: string) => s.replace(/[  ]/g, " ");

describe("ATTACHMENT_TYPES", () => {
  it("maps every allowed mimetype to a dotted extension", () => {
    expect(ATTACHMENT_TYPES["application/pdf"]).toBe(".pdf");
    expect(ATTACHMENT_TYPES["image/jpeg"]).toBe(".jpg");
    expect(ATTACHMENT_TYPES["application/vnd.openxmlformats-officedocument.wordprocessingml.document"]).toBe(".docx");
    expect(ATTACHMENT_TYPES["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]).toBe(".xlsx");
    for (const ext of Object.values(ATTACHMENT_TYPES)) expect(ext).toMatch(/^\.[a-z0-9]+$/);
    expect(MAX_ATTACHMENT_BYTES).toBe(20 * 1024 * 1024);
    expect(MAX_ATTACHMENTS).toBe(20);
  });
});

describe("fmtFileSize", () => {
  it("prints 1 Ko under one kilobyte", () => {
    expect(fmtFileSize(0)).toBe("1 Ko");
    expect(fmtFileSize(512)).toBe("1 Ko");
  });
  it("prints whole kilobytes", () => {
    expect(plain(fmtFileSize(850 * 1024))).toBe("850 Ko");
  });
  it("prints megabytes with one decimal, trailing zero dropped", () => {
    expect(plain(fmtFileSize(1.25 * 1024 * 1024))).toBe("1,3 Mo");
    expect(plain(fmtFileSize(1.2 * 1024 * 1024))).toBe("1,2 Mo");
    expect(plain(fmtFileSize(12 * 1024 * 1024))).toBe("12 Mo");
  });
});

describe("fileKindOf", () => {
  it("reads the content type first", () => {
    expect(fileKindOf("application/pdf")).toBe("pdf");
    expect(fileKindOf("image/heic", "IMG_0001.HEIC")).toBe("image");
    expect(fileKindOf("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe("doc");
    expect(fileKindOf("text/plain", "notes.txt")).toBe("text");
  });
  it("falls back to the name for an unknown type", () => {
    expect(fileKindOf("application/octet-stream", "Prix.xlsx")).toBe("sheet");
    expect(fileKindOf("application/octet-stream", "archive.zip")).toBe("other");
    expect(fileKindOf("")).toBe("other");
  });
});

describe("safeExt", () => {
  it("lower-cases the extension and keeps the dot", () => {
    expect(safeExt("Plan de salle.PDF")).toBe(".pdf");
    expect(safeExt("photo.jpeg")).toBe(".jpeg");
  });
  it("gives an empty string when there is none or it is not safe", () => {
    expect(safeExt("notes")).toBe("");
    expect(safeExt("weird.tar.gz!")).toBe("");
    expect(safeExt("long.abcdefghij")).toBe("");
  });
});
