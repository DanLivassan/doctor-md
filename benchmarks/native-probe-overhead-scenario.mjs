import { monitorEventLoopDelay } from "node:perf_hooks";
import { createProcessBenchmark } from "../dist/index.js";

const enabled = process.argv[2] === "probe";
const durationMs = Number(process.argv[3] ?? 20_000);
const delay = monitorEventLoopDelay({ resolution: 10 });
const benchmark = createProcessBenchmark({
  intervalMs: 10_000,
  historySize: 0,
  collectGarbageCollection: false,
  collectResourceUsage: false,
  collectActiveResources: false,
  diagnostics: { enabled: false },
  threadPool: { enabled, intervalMs: 1_000 },
}).start();

// Exclude one-time module loading, JIT, and collector initialization from steady-state cost.
await new Promise((resolve) => setTimeout(resolve, 2_000));
const cpuBefore = process.cpuUsage();
const rssBefore = process.memoryUsage().rss;
delay.enable();
await new Promise((resolve) => setTimeout(resolve, durationMs));
const cpu = process.cpuUsage(cpuBefore);
delay.disable();
benchmark.stop();

process.stdout.write(`${JSON.stringify({
  scenario: enabled ? "library + native probe every 1s" : "library without native probe",
  durationMs,
  cpuPercent: ((cpu.user + cpu.system) / 1_000 / durationMs) * 100,
  rssDeltaMb: (process.memoryUsage().rss - rssBefore) / 1024 / 1024,
  eventLoopDelayP99Ms: delay.percentile(99) / 1e6,
})}\n`);
