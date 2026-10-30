import type { CreateLedgerEntryRequest, InboxBatchProposal } from "@packages/types";
import { api } from "@/lib/api";
import {
  clearInboxQueue,
  confirmInboxItems,
  enqueueInboxFiles,
  getInboxQueue,
  retryInboxItem,
} from "./inbox-queue";

jest.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {
    status: number;
    body: unknown;
    constructor(message: string, status: number, body: unknown) { super(message); this.status = status; this.body = body; }
  },
  api: {
    ledger: { inbox: { upload: jest.fn(), extractBatch: jest.fn(), remove: jest.fn(), confirm: jest.fn() } },
    settings: { get: jest.fn() },
  },
  errorReason: (error: unknown) => error instanceof Error ? error.message : "",
}));

const inboxApi = api.ledger.inbox as jest.Mocked<typeof api.ledger.inbox>;
const invoiceEntry: CreateLedgerEntryRequest = {
  book: "achats", kind: "mp", date: "2026-10-05", label: "Vds Food", supplier: "Vds",
  number: "VDS-1", totalTvac: 121, htva: 100, vatRate: 21, vatAmount: 21,
};

function proposal(inboxId: string, index: number): InboxBatchProposal["invoices"][number] {
  return {
    inboxId,
    name: `facture-${index}.pdf`,
    size: 100 + index,
    pageStart: index,
    pageEnd: index,
    entry: { ...invoiceEntry, number: `VDS-${index}` },
    extracted: {
      issuerName: "Vds Food", issuerVat: "BE0123456789", recipientName: "Table d'Amélie", recipientVat: null,
      number: `VDS-${index}`, date: "2026-10-05", dueDate: null, currency: "EUR", totalTvac: 121,
      htva: 100, vatAmount: 21, vatLines: [{ rate: 21, base: 100, amount: 21 }], kindGuess: "facture",
      paid: null, confidence: 0.9, remarks: null,
    },
    flags: [],
  };
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
async function waitForQueue(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate()) return;
    await tick();
  }
  throw new Error("Timed out waiting for inbox queue");
}

function file(name = "batch.pdf"): File {
  return new File(["pdf"], name, { type: "application/pdf" });
}

beforeEach(() => {
  clearInboxQueue();
  jest.clearAllMocks();
  let nextId = 0;
  Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: () => `test-id-${++nextId}` });
  inboxApi.remove.mockResolvedValue({ ok: true });
});

describe("invoice inbox queue", () => {
  it("keeps the original upload when extraction fails and removes it only after a successful retry", async () => {
    inboxApi.upload.mockResolvedValue({ inboxId: "source.pdf", name: "batch.pdf", contentType: "application/pdf", size: 3 });
    inboxApi.extractBatch
      .mockRejectedValueOnce(new Error("network lost"))
      .mockResolvedValueOnce({ invoices: [proposal("child.pdf", 1)] });
    enqueueInboxFiles([file()]);
    await waitForQueue(() => getInboxQueue().items[0]?.state === "error");
    expect(inboxApi.upload).toHaveBeenCalledTimes(1);
    expect(inboxApi.remove).not.toHaveBeenCalled();

    const rowId = getInboxQueue().items[0].id;
    retryInboxItem(rowId);
    await waitForQueue(() => getInboxQueue().items[0]?.inboxId === "child.pdf" && getInboxQueue().items[0]?.state === "ready");
    expect(inboxApi.upload).toHaveBeenCalledTimes(1);
    expect(inboxApi.extractBatch).toHaveBeenCalledTimes(2);
    expect(inboxApi.extractBatch).toHaveBeenLastCalledWith("source.pdf");
    expect(inboxApi.remove).toHaveBeenCalledTimes(1);
    expect(inboxApi.remove).toHaveBeenCalledWith("source.pdf");
  });

  it("expands 51 invoices and confirms in batches of 50 and one", async () => {
    const invoices = Array.from({ length: 51 }, (_, index) => proposal(`child-${index + 1}.pdf`, index + 1));
    inboxApi.upload.mockResolvedValue({ inboxId: "source.pdf", name: "batch.pdf", contentType: "application/pdf", size: 3 });
    inboxApi.extractBatch.mockResolvedValue({ invoices });
    inboxApi.confirm.mockImplementation(async (items) => ({
      results: items.map((item) => ({ inboxId: item.inboxId, ok: true, entryId: `entry-${item.inboxId}` })),
    }));
    enqueueInboxFiles([file()]);
    await waitForQueue(() => getInboxQueue().items.length === 51 && getInboxQueue().items.every((item) => item.state === "ready"));
    expect(inboxApi.remove).toHaveBeenCalledWith("source.pdf");

    const rows = getInboxQueue().items;
    const summary = await confirmInboxItems(rows.map((row) => row.id));
    expect(inboxApi.confirm).toHaveBeenCalledTimes(2);
    expect(inboxApi.confirm.mock.calls.map(([items]) => items.length)).toEqual([50, 1]);
    expect(summary).toEqual({ added: 51, duplicates: 0, locked: 0, errors: 0 });
    expect(getInboxQueue().items.every((item) => item.state === "added" && item.entryId?.startsWith("entry-child-") === true)).toBe(true);
  });
});

it("uploads identical PDF bytes only once even when filenames differ", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis.crypto, "subtle");
  Object.defineProperty(globalThis.crypto, "subtle", { configurable: true, value: { digest: async () => new Uint8Array([1, 2, 3]).buffer } });
  const first = file("factures.pdf"), second = file("factures-copie.pdf");
  for (const upload of [first, second]) Object.defineProperty(upload, "arrayBuffer", { value: async () => new Uint8Array([7, 8, 9]).buffer });
  inboxApi.upload.mockResolvedValue({ inboxId: "source.pdf", name: first.name, contentType: "application/pdf", size: 3 });
  inboxApi.extractBatch.mockResolvedValue({ invoices: [proposal("child.pdf", 1)] });
  try {
    enqueueInboxFiles([first, second]);
    await waitForQueue(() => getInboxQueue().items.some(item => item.state === "excluded"));
    expect(inboxApi.upload).toHaveBeenCalledTimes(1);
    expect(getInboxQueue().items.find(item => item.state === "excluded")?.flags[0].code).toBe("duplicate_file");
  } finally {
    if (previous) Object.defineProperty(globalThis.crypto, "subtle", previous);
    else Reflect.deleteProperty(globalThis.crypto, "subtle");
  }
});
