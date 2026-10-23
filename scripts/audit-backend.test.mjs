import assert from "node:assert/strict";
import test from "node:test";
import { backendAdvisories } from "./audit-backend.mjs";

const advisory = (...paths) => ({ findings: [{ paths }] });
const importers = ["apps__backend", "packages__types"];

test("reports direct, transitive, and shared backend dependencies", () => {
  const advisories = {
    direct: advisory("apps__backend>zod"),
    transitive: advisory("apps__backend>@nestjs/platform-express>multer"),
    shared: advisory("packages__types>zod"),
    frontend: advisory("apps__frontend>xlsx"),
    infrastructure: advisory("infrastructure>aws-cdk-lib"),
  };
  assert.deepEqual(backendAdvisories({ metadata: {}, advisories }, importers), [
    advisories.direct, advisories.transitive, advisories.shared,
  ]);
});

test("accepts a completed audit with no findings", () => {
  assert.deepEqual(backendAdvisories({ metadata: {}, advisories: {} }, importers), []);
});

test("rejects unavailable or malformed audit results", () => {
  for (const report of [
    {},
    { error: { message: "registry unavailable" } },
    { metadata: {}, advisories: { broken: {} } },
    { metadata: {}, advisories: { broken: { findings: [{}] } } },
  ]) assert.throws(() => backendAdvisories(report, importers));
});
