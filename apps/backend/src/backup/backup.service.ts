import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import type { Readable } from "node:stream";
import { ConfigService, Tables } from "../config/config.service";
import { DdbService } from "../shared/ddb.service";
import { S3Service, S3ObjectSummary } from "../shared/s3.service";
import { ZipStream } from "./zip-stream";

export const BACKUP_FORMAT = "la-table-amelie-backup";
export const BACKUP_FORMAT_VERSION = 1;
export const MANIFEST_FILE = "manifest.json";
export const OBJECTS_INDEX_FILE = "s3-objects.json";
export const TABLES_DIR = "dynamodb";
export const OBJECTS_DIR = "s3";

export const LIST_DENIED = "Le serveur ne peut pas lister le bucket : ajouter s3:ListBucket au rôle de l'instance (readme, « Sauvegarde »)";

export type TableName = keyof Tables;

// The partition key of each table, written to the manifest so a restore can create the tables.
export const KEY_ATTRIBUTES: Record<TableName, string> = {
  ingredients: "ingredientId",
  recipes: "recipeId",
  settings: "settingsId",
  events: "eventId",
  groceryLists: "listId",
  clients: "clientId",
  ledger: "entryId",
  stock: "stockId",
};

export interface BackupTableEntry {
  name: TableName;
  table: string;
  keyAttribute: string;
  items: number;
  file: string;
}

export interface BackupObjectEntry {
  key: string;
  size: number;
  contentType: string;
  lastModified?: string;
  file: string;
}

export interface BackupManifest {
  format: string;
  version: number;
  exportedAt: string;
  region: string;
  dynamodb: BackupTableEntry[];
  s3: { bucket: string; objects: number; bytes: number; index: string };
}

export interface BackupPreflight {
  tables: number;
  objects: number;
  bytes: number;
}

const isAccessDenied = (err: unknown): boolean => (err as { name?: string } | null)?.name === "AccessDenied";

const sumBytes = (objects: { size: number }[]): number => objects.reduce((sum, o) => sum + o.size, 0);

@Injectable()
export class BackupService {
  constructor(private ddb: DdbService, private s3: S3Service, private config: ConfigService) {}

  // Lists the bucket before the download starts, so a missing permission is an error the page can show.
  async preflight(): Promise<BackupPreflight> {
    const objects = await this.listObjects();
    return { tables: this.configuredTables().length, objects: objects.length, bytes: sumBytes(objects) };
  }

  // The archive as a stream: one JSON file per table, every bucket object under s3/, then the index and the manifest.
  // A failure part-way destroys the stream, so the client sees a broken download rather than a short archive.
  write(): Readable {
    const out = new ZipStream();
    this.fill(out).then(
      () => out.finish(),
      (err: unknown) => {
        console.error(JSON.stringify({ action: "backupWrite", error: String(err) }));
        out.fail(err instanceof Error ? err : new Error(String(err)));
      },
    );
    return out;
  }

  private configuredTables(): [TableName, string][] {
    const names = Object.keys(KEY_ATTRIBUTES) as TableName[];
    return names.flatMap((name) => {
      const table = this.ddb.tables[name];
      return table ? [[name, table] as [TableName, string]] : [];
    });
  }

  private async listObjects(): Promise<S3ObjectSummary[]> {
    try {
      return await this.s3.listAll();
    } catch (err) {
      if (isAccessDenied(err)) throw new ServiceUnavailableException(LIST_DENIED);
      throw err;
    }
  }

  private async fill(out: ZipStream): Promise<void> {
    const exportedAt = new Date();

    const dynamodb: BackupTableEntry[] = [];
    for (const [name, table] of this.configuredTables()) {
      const items = await this.ddb.scanAll(table);
      const file = `${TABLES_DIR}/${name}.json`;
      await out.addJson(file, items, exportedAt);
      dynamodb.push({ name, table, keyAttribute: KEY_ATTRIBUTES[name], items: items.length, file });
    }

    const index: BackupObjectEntry[] = [];
    for (const object of await this.listObjects()) {
      const { body, contentType, lastModified } = await this.s3.stream(object.key);
      const modified = lastModified ?? object.lastModified;
      const file = `${OBJECTS_DIR}/${object.key}`;
      await out.addStream(file, body, modified);
      index.push({ key: object.key, size: object.size, contentType, lastModified: modified?.toISOString(), file });
    }
    await out.addJson(OBJECTS_INDEX_FILE, index, exportedAt);

    const manifest: BackupManifest = {
      format: BACKUP_FORMAT,
      version: BACKUP_FORMAT_VERSION,
      exportedAt: exportedAt.toISOString(),
      region: this.config.get("AWS_REGION"),
      dynamodb,
      s3: { bucket: this.config.get("S3_BUCKET"), objects: index.length, bytes: sumBytes(index), index: OBJECTS_INDEX_FILE },
    };
    await out.addJson(MANIFEST_FILE, manifest, exportedAt);
  }
}
