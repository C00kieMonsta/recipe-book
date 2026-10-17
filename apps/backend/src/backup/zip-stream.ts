import { Readable } from "node:stream";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

const HIGH_WATER_MARK = 1024 * 1024;
const JSON_LEVEL = 6;

export const ARCHIVE_CLOSED = "Archive fermée avant la fin";

// A zip archive as a Readable. Entries go in one after the other; the writer waits for the reader between chunks.
export class ZipStream extends Readable {
  private readonly zip: Zip;
  private wantMore = true;
  private wake?: () => void;

  constructor() {
    super({ highWaterMark: HIGH_WATER_MARK });
    this.zip = new Zip((err, chunk, final) => {
      if (err) {
        this.destroy(err);
        return;
      }
      // Copied because fflate may hand back the very buffer the writer pushed.
      this.wantMore = this.push(Buffer.from(chunk));
      if (final) this.push(null);
    });
  }

  _read(): void {
    this.wantMore = true;
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
  }

  _destroy(err: Error | null, cb: (err: Error | null) => void): void {
    const wake = this.wake;
    this.wake = undefined;
    wake?.();
    cb(err);
  }

  // A text entry, deflated.
  async addJson(name: string, value: unknown, mtime: Date): Promise<void> {
    const file = new ZipDeflate(name, { level: JSON_LEVEL });
    file.mtime = mtime;
    this.zip.add(file);
    file.push(new TextEncoder().encode(JSON.stringify(value, null, 2)), true);
    await this.drain();
  }

  // A binary entry stored as is: photos and PDFs are already compressed.
  async addStream(name: string, chunks: AsyncIterable<Uint8Array>, mtime?: Date): Promise<void> {
    const file = new ZipPassThrough(name);
    if (mtime) file.mtime = mtime;
    this.zip.add(file);
    for await (const chunk of chunks) {
      file.push(chunk, false);
      await this.drain();
    }
    file.push(new Uint8Array(0), true);
    await this.drain();
  }

  // Writes the central directory; the stream ends once the reader has taken it.
  finish(): void {
    this.zip.end();
  }

  fail(err: Error): void {
    if (this.destroyed) return;
    this.zip.terminate();
    this.destroy(err);
  }

  // Resolves once the reader wants more; rejects when the reader went away.
  private async drain(): Promise<void> {
    if (!this.wantMore && !this.destroyed) {
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
    if (this.destroyed) throw new Error(ARCHIVE_CLOSED);
  }
}
