import { spawnSync } from "node:child_process";
import { relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));

export function backendAdvisories(report, importers) {
  if (report.error || !report.metadata || !report.advisories || typeof report.advisories !== "object") {
    throw new Error(`Dependency audit failed: ${report.error?.message ?? "invalid registry response"}`);
  }
  return Object.values(report.advisories).filter((advisory) => {
    if (!Array.isArray(advisory.findings)) throw new Error("Dependency audit returned invalid findings");
    return advisory.findings.some((finding) => {
      if (!Array.isArray(finding.paths)) throw new Error("Dependency audit returned invalid dependency paths");
      return finding.paths.some((path) => importers.includes(path.split(">")[0]));
    });
  });
}

function run() {
  const workspaces = spawnSync("pnpm", ["--filter", "@apps/backend...", "list", "--depth", "-1", "--json"], {
    cwd: root, encoding: "utf8", timeout: 30_000,
  });
  if (workspaces.error || workspaces.status !== 0) throw new Error("Could not identify backend workspaces");
  const packages = JSON.parse(workspaces.stdout);
  if (!packages.some((pkg) => pkg.name === "@apps/backend")) throw new Error("Backend workspace was not found");
  const importers = packages.map((pkg) => relative(root, pkg.path).split(sep).join("__"));
  const audit = spawnSync("pnpm", ["audit", "--prod", "--json"], {
    cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (audit.error || ![0, 1].includes(audit.status)) throw new Error("Could not complete the dependency audit");
  const findings = backendAdvisories(JSON.parse(audit.stdout), importers);
  for (const finding of findings) {
    console.error(`${finding.severity}: ${finding.module_name}: ${finding.title}\n${finding.url}`);
  }
  console.log(`Backend production dependency advisories: ${findings.length}`);
  process.exitCode = findings.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    run();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
