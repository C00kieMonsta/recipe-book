import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import OpenAI from "openai";

// The one place the OpenAI key is read. Nothing in this file logs the value.

export const OPENAI_KEY_TTL_MS = 15 * 60_000;

export class OpenAiNotConfiguredError extends Error {
  constructor() {
    super("Ni OPENAI_API_KEY ni OPENAI_API_KEY_PARAMETER n'est configuré");
    this.name = "OpenAiNotConfiguredError";
  }
}

export type OpenAiKeySource = {
  apiKey?: string;
  parameter?: string;
  region: string;
};

// The slice of ConfigService this module reads; a plain object with get() satisfies it in tests.
export type OpenAiConfig = {
  get(key: "AWS_REGION"): string;
  get(key: "OPENAI_API_KEY" | "OPENAI_API_KEY_PARAMETER"): string | undefined;
};

type SsmSender = {
  send(command: GetParameterCommand): Promise<{ Parameter?: { Value?: string } }>;
};

export type KeyReaderOptions = {
  ssm?: SsmSender;
  now?: () => number;
  ttlMs?: number;
};

export type KeyReader = {
  read(): Promise<string>;
  invalidate(): void;
};

export function keySourceFrom(config: OpenAiConfig): OpenAiKeySource {
  return {
    apiKey: config.get("OPENAI_API_KEY"),
    parameter: config.get("OPENAI_API_KEY_PARAMETER"),
    region: config.get("AWS_REGION"),
  };
}

export function isAssistantConfigured(config: OpenAiConfig): boolean {
  const source = keySourceFrom(config);
  return Boolean(source.apiKey || source.parameter);
}

async function fetchKey(source: OpenAiKeySource, ssm: SsmSender): Promise<string> {
  if (source.apiKey) return source.apiKey;
  if (!source.parameter) throw new OpenAiNotConfiguredError();

  let value: string | undefined;
  try {
    const result = await ssm.send(new GetParameterCommand({ Name: source.parameter, WithDecryption: true }));
    value = result.Parameter?.Value;
  } catch (err) {
    const name = err instanceof Error ? err.name : "Error";
    // A missing parameter is the normal state before the key is created; AccessDenied is an IAM mistake.
    if (name === "ParameterNotFound") throw new OpenAiNotConfiguredError();
    console.error(JSON.stringify({ level: "error", action: "openai:readKey", parameter: source.parameter, error: name }));
    throw err;
  }

  if (!value) throw new Error(`Le paramètre SSM ${source.parameter} est vide`);
  return value;
}

// The key is cached as a promise so concurrent callers share one SSM read, and re-read after the TTL.
export function createKeyReader(source: OpenAiKeySource, options: KeyReaderOptions = {}): KeyReader {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? OPENAI_KEY_TTL_MS;
  let ssm: SsmSender | undefined = options.ssm;
  let pending: Promise<string> | undefined;
  let readAt = 0;

  return {
    read() {
      if (pending && now() - readAt > ttlMs) pending = undefined;
      if (!pending) {
        readAt = now();
        ssm ??= new SSMClient({ region: source.region });
        const attempt = fetchKey(source, ssm).catch((err: unknown) => {
          // Forget a failed read so a parameter created later is picked up without a restart.
          if (pending === attempt) pending = undefined;
          throw err;
        });
        pending = attempt;
      }
      return pending;
    },
    invalidate() {
      pending = undefined;
      readAt = 0;
    },
  };
}

let reader: KeyReader | undefined;
let readerSource: OpenAiKeySource | undefined;
let client: { apiKey: string; instance: OpenAI } | undefined;

function sameSource(a: OpenAiKeySource, b: OpenAiKeySource): boolean {
  return a.apiKey === b.apiKey && a.parameter === b.parameter && a.region === b.region;
}

function readerFor(config: OpenAiConfig): KeyReader {
  const source = keySourceFrom(config);
  if (!reader || !readerSource || !sameSource(readerSource, source)) {
    reader = createKeyReader(source);
    readerSource = source;
    client = undefined;
  }
  return reader;
}

export function readKey(config: OpenAiConfig): Promise<string> {
  return readerFor(config).read();
}

// One SDK instance per key value, so a rotation yields a fresh client at the next read.
export async function getOpenAiClient(config: OpenAiConfig): Promise<OpenAI> {
  const apiKey = await readerFor(config).read();
  if (!client || client.apiKey !== apiKey) client = { apiKey, instance: new OpenAI({ apiKey }) };
  return client.instance;
}

// Called when OpenAI rejects the credential, so a key already rotated in SSM is used before the TTL ends.
export function invalidateOpenAiClient(): void {
  reader?.invalidate();
  client = undefined;
}

export function resetOpenAiClientForTests(): void {
  reader = undefined;
  readerSource = undefined;
  client = undefined;
}
