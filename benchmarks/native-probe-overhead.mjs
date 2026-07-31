import { spawnSync } from "node:child_process";

const durationMs = Number(process.argv[2] ?? 20_000);
const run = (scenario) => {
  const child = spawnSync(process.execPath, [
    new URL("./native-probe-overhead-scenario.mjs", import.meta.url).pathname,
    scenario,
    String(durationMs),
  ], { encoding: "utf8" });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(child.stderr || `Scenario ${scenario} failed`);
  return JSON.parse(child.stdout);
};

const baseline = run("baseline");
const probe = run("probe");
process.stdout.write(`${JSON.stringify({
  node: process.version,
  baseline,
  probe,
  cpuDeltaPercentagePoints: probe.cpuPercent - baseline.cpuPercent,
}, null, 2)}\n`);
