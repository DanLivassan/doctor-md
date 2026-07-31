import { spawnSync } from "node:child_process";

const durationMs = Number(process.argv[2] ?? 12_000);
const scenarios = ["baseline", "1000", "5000", "10000"];
const results = scenarios.map((scenario) => {
  const child = spawnSync(process.execPath, [
    new URL("./scenario.mjs", import.meta.url).pathname,
    scenario,
    String(durationMs),
  ], { encoding: "utf8" });
  if (child.error) throw child.error;
  if (child.status !== 0 || !child.stdout.trim()) {
    throw new Error(child.stderr || `Scenario ${scenario} failed with status ${child.status}`);
  }
  return JSON.parse(child.stdout);
});

const baseline = results[0];
const report = results.map((result) => ({
  ...result,
  throughputDeltaPercent: ((result.operationsPerSecond / baseline.operationsPerSecond) - 1) * 100,
}));
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
