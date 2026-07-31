import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { createProcessBenchmark } from "../dist/index.js";

const intervalMs = Number(process.argv[2]);
const durationMs = Number(process.argv[3] ?? 12_000);
const enabled = Number.isFinite(intervalMs) && intervalMs > 0;
const delay = monitorEventLoopDelay({ resolution: 10 });
const cpuBefore = process.cpuUsage();
const rssBefore = process.memoryUsage().rss;
let operations = 0;
let benchmark;

if (enabled) benchmark = createProcessBenchmark({ intervalMs }).start();
delay.enable();
const startedAt = performance.now();

await new Promise((resolve) => {
  const work = () => {
    operations += 1;
    if (performance.now() - startedAt >= durationMs) {
      resolve();
      return;
    }
    setImmediate(work);
  };
  setImmediate(work);
});

const elapsedMs = performance.now() - startedAt;
const cpu = process.cpuUsage(cpuBefore);
benchmark?.stop();
delay.disable();

process.stdout.write(JSON.stringify({
  scenario: enabled ? `${intervalMs / 1_000}s` : "baseline",
  durationMs: elapsedMs,
  operationsPerSecond: operations / (elapsedMs / 1_000),
  cpuPercent: ((cpu.user + cpu.system) / 1_000 / elapsedMs) * 100,
  rssDeltaMb: (process.memoryUsage().rss - rssBefore) / 1024 / 1024,
  eventLoopDelayMeanMs: Number(delay.mean) / 1e6,
  eventLoopDelayP99Ms: Number(delay.percentile(99)) / 1e6,
}));
