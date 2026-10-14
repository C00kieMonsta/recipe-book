import { GetParameterCommand } from "@aws-sdk/client-ssm";
import {
  OPENAI_KEY_TTL_MS,
  OpenAiNotConfiguredError,
  createKeyReader,
  getOpenAiClient,
  isAssistantConfigured,
  readKey,
  resetOpenAiClientForTests,
  type OpenAiConfig,
} from "./openai.client";

type SsmResult = { Parameter?: { Value?: string } };
type FakeSsm = { send: jest.Mock<Promise<SsmResult>, [GetParameterCommand]> };

const mockSend = (impl: () => Promise<SsmResult>): FakeSsm => ({
  send: jest.fn<Promise<SsmResult>, [GetParameterCommand]>(impl),
});

const fakeSsm = (values: string[]): FakeSsm => {
  const queue = [...values];
  return mockSend(async () => ({ Parameter: { Value: queue.shift() } }));
};

const fakeConfig = (env: Record<string, string | undefined>): OpenAiConfig => ({
  get: ((key: string) => (key === "AWS_REGION" ? env.AWS_REGION ?? "eu-north-1" : env[key])) as OpenAiConfig["get"],
});

const parameter = "/la-table-amelie/production/OPENAI_API_KEY";

describe("openai.client key reader", () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    resetOpenAiClientForTests();
    errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it("rejects with OpenAiNotConfiguredError when neither source is set", async () => {
    const ssm = fakeSsm([]);
    const reader = createKeyReader({ region: "eu-north-1" }, { ssm });
    await expect(reader.read()).rejects.toBeInstanceOf(OpenAiNotConfiguredError);
    expect(ssm.send).not.toHaveBeenCalled();
  });

  it("maps ParameterNotFound to OpenAiNotConfiguredError without logging", async () => {
    const err = Object.assign(new Error("missing"), { name: "ParameterNotFound" });
    const ssm = mockSend(() => Promise.reject(err));
    const reader = createKeyReader({ parameter, region: "eu-north-1" }, { ssm });
    await expect(reader.read()).rejects.toBeInstanceOf(OpenAiNotConfiguredError);
    expect(errorSpy).not.toHaveBeenCalled();
    // The failed read is forgotten so the next call asks SSM again.
    await expect(reader.read()).rejects.toBeInstanceOf(OpenAiNotConfiguredError);
    expect(ssm.send).toHaveBeenCalledTimes(2);
  });

  it("logs AccessDenied with the parameter name only and rethrows", async () => {
    const err = Object.assign(new Error("denied"), { name: "AccessDeniedException" });
    const ssm = mockSend(() => Promise.reject(err));
    const reader = createKeyReader({ parameter, region: "eu-north-1" }, { ssm });
    await expect(reader.read()).rejects.toBe(err);
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const line = String(errorSpy.mock.calls[0][0]);
    expect(line).toContain(parameter);
    expect(line).toContain("AccessDeniedException");
  });

  it("prefers the local env key and never calls SSM", async () => {
    const ssm = fakeSsm(["from-ssm"]);
    const reader = createKeyReader({ apiKey: "from-env", parameter, region: "eu-north-1" }, { ssm });
    await expect(reader.read()).resolves.toBe("from-env");
    expect(ssm.send).not.toHaveBeenCalled();
  });

  it("reads the parameter with decryption and shares one read between concurrent callers", async () => {
    const ssm = fakeSsm(["key-one", "key-two"]);
    const reader = createKeyReader({ parameter, region: "eu-north-1" }, { ssm });
    const [a, b] = await Promise.all([reader.read(), reader.read()]);
    expect(a).toBe("key-one");
    expect(b).toBe("key-one");
    expect(ssm.send).toHaveBeenCalledTimes(1);
    const command = ssm.send.mock.calls[0][0];
    expect(command).toBeInstanceOf(GetParameterCommand);
    expect(command.input).toEqual({ Name: parameter, WithDecryption: true });
  });

  it("re-reads the parameter after the TTL and keeps the cached value before it", async () => {
    let clock = 1_000;
    const ssm = fakeSsm(["key-one", "key-two"]);
    const reader = createKeyReader({ parameter, region: "eu-north-1" }, { ssm, now: () => clock });
    await expect(reader.read()).resolves.toBe("key-one");
    clock += OPENAI_KEY_TTL_MS;
    await expect(reader.read()).resolves.toBe("key-one");
    clock += 1;
    await expect(reader.read()).resolves.toBe("key-two");
    expect(ssm.send).toHaveBeenCalledTimes(2);
  });

  it("re-reads at once after invalidate", async () => {
    const ssm = fakeSsm(["key-one", "key-two"]);
    const reader = createKeyReader({ parameter, region: "eu-north-1" }, { ssm });
    await expect(reader.read()).resolves.toBe("key-one");
    reader.invalidate();
    await expect(reader.read()).resolves.toBe("key-two");
  });

  it("fails on an empty parameter value", async () => {
    const ssm = fakeSsm([""]);
    const reader = createKeyReader({ parameter, region: "eu-north-1" }, { ssm });
    await expect(reader.read()).rejects.toThrow(/vide/);
  });
});

describe("openai.client module helpers", () => {
  beforeEach(() => resetOpenAiClientForTests());

  it("isAssistantConfigured is true with a key or a parameter and false otherwise", () => {
    expect(isAssistantConfigured(fakeConfig({}))).toBe(false);
    expect(isAssistantConfigured(fakeConfig({ OPENAI_API_KEY: "local" }))).toBe(true);
    expect(isAssistantConfigured(fakeConfig({ OPENAI_API_KEY_PARAMETER: parameter }))).toBe(true);
  });

  it("readKey rejects with OpenAiNotConfiguredError when nothing is configured", async () => {
    await expect(readKey(fakeConfig({}))).rejects.toBeInstanceOf(OpenAiNotConfiguredError);
  });

  it("getOpenAiClient builds one client from the local key and reuses it", async () => {
    const config = fakeConfig({ OPENAI_API_KEY: "local-key" });
    const first = await getOpenAiClient(config);
    const second = await getOpenAiClient(config);
    expect(first).toBe(second);
    expect(first.apiKey).toBe("local-key");
  });
});
