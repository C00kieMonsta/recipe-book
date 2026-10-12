import { Injectable, ServiceUnavailableException } from "@nestjs/common";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  ScanCommand,
  BatchWriteCommand,
  BatchWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { ConfigService, Tables } from "../config/config.service";

type WriteRequest = NonNullable<BatchWriteCommandInput["RequestItems"]>[string][number];

export type UpdateOptions = {
  condition?: string;
  names?: Record<string, string>;
  values?: Record<string, unknown>;
};

const BATCH_SIZE = 25;
const BATCH_TRIES = 5;
const BATCH_BACKOFF_MS = 100;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

@Injectable()
export class DdbService {
  readonly client: DynamoDBDocumentClient;
  readonly tables: Tables;

  constructor(private config: ConfigService) {
    const endpoint = config.get("DDB_ENDPOINT");
    const raw = new DynamoDBClient({
      region: config.get("AWS_REGION"),
      ...(endpoint && { endpoint }),
    });
    this.client = DynamoDBDocumentClient.from(raw, {
      marshallOptions: { removeUndefinedValues: true },
    });
    this.tables = config.tables;
  }

  // Optional tables may be missing until their SSM parameter exists; fail the request, not the boot.
  requireTable(name: "clients" | "ledger"): string {
    const table = this.tables[name];
    if (!table) throw new ServiceUnavailableException(`Table ${name} non configurée`);
    return table;
  }

  async get(table: string, key: Record<string, string>) {
    const { Item } = await this.client.send(new GetCommand({ TableName: table, Key: key }));
    return Item ?? null;
  }

  async put(table: string, item: Record<string, unknown>) {
    await this.client.send(new PutCommand({ TableName: table, Item: item }));
  }

  async update(
    table: string,
    key: Record<string, string>,
    fields: Record<string, unknown>,
    options: UpdateOptions = {},
  ) {
    const setEntries = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null);
    const removeKeys = Object.entries(fields).filter(([, v]) => v === null).map(([k]) => k);

    if (setEntries.length === 0 && removeKeys.length === 0) return;

    const parts: string[] = [];
    if (setEntries.length > 0) parts.push("SET " + setEntries.map((_, i) => `#k${i} = :v${i}`).join(", "));
    if (removeKeys.length > 0) parts.push("REMOVE " + removeKeys.map((k) => `#r_${k}`).join(", "));

    // Guard the key attribute so an update can never resurrect a concurrently deleted row.
    const [keyAttr] = Object.keys(key);
    const names: Record<string, string> = {
      ...options.names,
      "#pk": keyAttr,
      ...Object.fromEntries(setEntries.map(([k], i) => [`#k${i}`, k])),
      ...Object.fromEntries(removeKeys.map((k) => [`#r_${k}`, k])),
    };
    const values: Record<string, unknown> = {
      ...options.values,
      ...Object.fromEntries(setEntries.map(([, v], i) => [`:v${i}`, v])),
    };
    const condition = options.condition
      ? `attribute_exists(#pk) AND (${options.condition})`
      : "attribute_exists(#pk)";

    await this.client.send(new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: parts.join(" "),
      ConditionExpression: condition,
      ExpressionAttributeNames: names,
      ...(Object.keys(values).length > 0 && { ExpressionAttributeValues: values }),
    }));
  }

  async scanAll(table: string) {
    const items: Record<string, unknown>[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const result = await this.client.send(new ScanCommand({ TableName: table, ExclusiveStartKey: cursor }));
      items.push(...(result.Items || []));
      cursor = result.LastEvaluatedKey;
    } while (cursor);
    return items;
  }

  async delete(table: string, key: Record<string, string>) {
    await this.client.send(new DeleteCommand({ TableName: table, Key: key }));
  }

  async batchWrite(table: string, items: Record<string, unknown>[]) {
    await this.sendBatches(table, items.map((item) => ({ PutRequest: { Item: item } })));
  }

  async batchDelete(table: string, keys: Record<string, string>[]) {
    await this.sendBatches(table, keys.map((key) => ({ DeleteRequest: { Key: key } })));
  }

  // Retries UnprocessedItems with exponential backoff, then throws with the count left.
  private async sendBatches(table: string, requests: WriteRequest[]) {
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      let pending = requests.slice(i, i + BATCH_SIZE);
      for (let attempt = 0; pending.length > 0; attempt++) {
        if (attempt >= BATCH_TRIES) {
          throw new Error(`Batch write on ${table}: ${pending.length} item(s) unprocessed after ${BATCH_TRIES} tries`);
        }
        if (attempt > 0) await sleep(BATCH_BACKOFF_MS * 2 ** (attempt - 1));
        const result = await this.client.send(new BatchWriteCommand({ RequestItems: { [table]: pending } }));
        pending = result.UnprocessedItems?.[table] ?? [];
      }
    }
  }
}
