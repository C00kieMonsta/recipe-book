import { Injectable } from "@nestjs/common";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import { ConfigService } from "../config/config.service";

@Injectable()
export class DdbService {
  readonly client: DynamoDBDocumentClient;
  readonly tables: { ingredients: string; recipes: string; settings: string; events: string; groceryLists: string };

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

  async get(table: string, key: Record<string, string>) {
    const { Item } = await this.client.send(new GetCommand({ TableName: table, Key: key }));
    return Item ?? null;
  }

  async put(table: string, item: Record<string, unknown>) {
    await this.client.send(new PutCommand({ TableName: table, Item: item }));
  }

  async update(table: string, key: Record<string, string>, fields: Record<string, unknown>) {
    const setEntries = Object.entries(fields).filter(([, v]) => v !== undefined && v !== null);
    const removeKeys = Object.entries(fields).filter(([, v]) => v === null).map(([k]) => k);

    if (setEntries.length === 0 && removeKeys.length === 0) return;

    const parts: string[] = [];
    if (setEntries.length > 0) parts.push("SET " + setEntries.map((_, i) => `#k${i} = :v${i}`).join(", "));
    if (removeKeys.length > 0) parts.push("REMOVE " + removeKeys.map((k) => `#r_${k}`).join(", "));

    const names: Record<string, string> = {
      ...Object.fromEntries(setEntries.map(([k], i) => [`#k${i}`, k])),
      ...Object.fromEntries(removeKeys.map((k) => [`#r_${k}`, k])),
    };

    await this.client.send(new UpdateCommand({
      TableName: table,
      Key: key,
      UpdateExpression: parts.join(" "),
      ExpressionAttributeNames: names,
      ...(setEntries.length > 0 && {
        ExpressionAttributeValues: Object.fromEntries(setEntries.map(([, v], i) => [`:v${i}`, v])),
      }),
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
    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      await this.client.send(new BatchWriteCommand({
        RequestItems: { [table]: batch.map((item) => ({ PutRequest: { Item: item } })) },
      }));
    }
  }

  async batchDelete(table: string, keys: Record<string, string>[]) {
    for (let i = 0; i < keys.length; i += 25) {
      const batch = keys.slice(i, i + 25);
      await this.client.send(new BatchWriteCommand({
        RequestItems: { [table]: batch.map((key) => ({ DeleteRequest: { Key: key } })) },
      }));
    }
  }
}
