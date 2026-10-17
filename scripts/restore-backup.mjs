// Restores an extracted backup (Paramètres › Société › Sauvegarde) into the tables and bucket named in the environment.
// Dry run by default, --apply writes. Node 20+; the AWS SDK comes from apps/backend, so run after pnpm install.
// Reads the same variables as the API: the *_TABLE names, S3_BUCKET, AWS_REGION (defaults to the manifest's) and DDB_ENDPOINT,
// so the new account's apps/backend/.env works as is (`set -a; . apps/backend/.env; set +a`). Credentials from the AWS default chain.
// Refuses a table or bucket that already holds data unless FORCE=1. Exits 1 when some data was skipped.
// Usage: node scripts/restore-backup.mjs <extracted backup dir> [--apply]

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const require = createRequire(new URL("../apps/backend/package.json", import.meta.url));
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, BatchWriteCommand, ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { S3Client, PutObjectCommand, ListObjectsV2Command } = require("@aws-sdk/client-s3");

const FORMAT = "la-table-amelie-backup";
const VERSION = 1;
const BATCH_SIZE = 25;
const BATCH_TRIES = 5;
const PROGRESS_EVERY = 50;

const TABLE_VARS = {
  ingredients: "INGREDIENTS_TABLE",
  recipes: "RECIPES_TABLE",
  settings: "SETTINGS_TABLE",
  events: "EVENTS_TABLE",
  groceryLists: "GROCERY_LISTS_TABLE",
  clients: "CLIENTS_TABLE",
  ledger: "LEDGER_TABLE",
};

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const force = process.env.FORCE === "1";
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) {
  console.error("usage: node scripts/restore-backup.mjs <extracted backup dir> [--apply]");
  process.exit(2);
}

const readJson = async (file) => JSON.parse(await readFile(join(dir, file), "utf8"));

const manifest = await readJson("manifest.json");
if (manifest.format !== FORMAT || manifest.version !== VERSION) {
  console.error(`unknown archive format ${manifest.format} v${manifest.version}; this script reads ${FORMAT} v${VERSION}`);
  process.exit(2);
}
console.log(`archive exported ${manifest.exportedAt} from ${manifest.region}, bucket ${manifest.s3.bucket}${apply ? "" : " (dry run)"}`);

const region = process.env.AWS_REGION ?? manifest.region;
const endpoint = process.env.DDB_ENDPOINT;
const bucket = process.env.S3_BUCKET;
const raw = new DynamoDBClient({ region, ...(endpoint && { endpoint }) });
const ddb = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
const s3 = new S3Client({ region });

let skipped = 0;

// Retries UnprocessedItems with exponential backoff, then throws with the count left.
async function batchWrite(table, items) {
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    let pending = items.slice(i, i + BATCH_SIZE).map((Item) => ({ PutRequest: { Item } }));
    for (let attempt = 0; pending.length > 0; attempt++) {
      if (attempt >= BATCH_TRIES) throw new Error(`${table}: ${pending.length} item(s) unprocessed after ${BATCH_TRIES} tries`);
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** (attempt - 1)));
      const res = await ddb.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
      pending = res.UnprocessedItems?.[table] ?? [];
    }
  }
}

async function tableHasRows(table) {
  const res = await ddb.send(new ScanCommand({ TableName: table, Limit: 1, Select: "COUNT" }));
  return (res.Count ?? 0) > 0;
}

async function bucketHasObjects(name) {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: name, MaxKeys: 1 }));
  return (res.KeyCount ?? 0) > 0;
}

for (const entry of manifest.dynamodb) {
  const envVar = TABLE_VARS[entry.name] ?? `${entry.name.toUpperCase()}_TABLE`;
  const table = process.env[envVar];
  const items = await readJson(entry.file);
  if (!table) {
    console.log(`${entry.name}: ${items.length} item(s), skipped (${envVar} not set)`);
    if (items.length > 0) skipped++;
    continue;
  }
  if (!force && (await tableHasRows(table))) {
    console.log(`${entry.name}: ${table} already has rows, skipped (FORCE=1 writes anyway)`);
    skipped++;
    continue;
  }
  if (!apply) {
    console.log(`${entry.name}: would write ${items.length} item(s) to ${table}`);
    continue;
  }
  await batchWrite(table, items);
  console.log(`${entry.name}: wrote ${items.length} item(s) to ${table}`);
}

const index = await readJson(manifest.s3.index);
if (!bucket) {
  console.log(`s3: ${index.length} object(s), skipped (S3_BUCKET not set)`);
  if (index.length > 0) skipped++;
} else if (!force && (await bucketHasObjects(bucket))) {
  console.log(`s3: ${bucket} already has objects, skipped (FORCE=1 writes anyway)`);
  skipped++;
} else if (!apply) {
  console.log(`s3: would write ${index.length} object(s) to ${bucket}`);
} else {
  let done = 0;
  for (const object of index) {
    const body = await readFile(join(dir, object.file));
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: object.key, Body: body, ContentType: object.contentType }));
    done++;
    if (done % PROGRESS_EVERY === 0) console.log(`s3: ${done}/${index.length}`);
  }
  console.log(`s3: wrote ${index.length} object(s) to ${bucket}`);
}

if (skipped > 0) {
  console.log(`${skipped} part(s) skipped; nothing else to do${apply ? "" : " (dry run)"}`);
  process.exit(1);
}
console.log(apply ? "done" : "dry run complete; add --apply to write");
