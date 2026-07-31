import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const fixture = (name: string): string =>
  fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));

const execute = (
  arguments_: string[],
  timeout = 5_000,
  environment: NodeJS.ProcessEnv = {},
): string => {
  const result = spawnSync(process.execPath, arguments_, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout,
    env: { ...process.env, ...environment },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Child exited with ${result.status}: ${result.stderr}`);
  }
  return result.stdout;
};

describe("runtime integration", () => {
  it("does not keep a process alive with its default timer", () => {
    const startedAt = performance.now();
    execute([fixture("unref-timer.mjs")], 3_000);
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });

  it("observes intentional Event Loop blocking", () => {
    const stdout = execute([fixture("blocked-event-loop.mjs")]);
    const delay = JSON.parse(stdout) as { maxMs: number };
    expect(delay.maxMs).toBeGreaterThan(100);
  });

  it("collects GC entries when explicit GC is available", () => {
    const stdout = execute(["--expose-gc", fixture("garbage-collection.mjs")]);
    const garbageCollection = JSON.parse(stdout) as { totalCount: number };
    expect(garbageCollection.totalCount).toBeGreaterThan(0);
  });

  it("identifies and sends snapshots from a Worker Thread", () => {
    const stdout = execute([fixture("worker-parent.mjs")]);
    expect(JSON.parse(stdout)).toMatchObject({ isMainThread: false });
  });

  it("loads the published entry points through ESM and CommonJS", () => {
    const esm = execute([
      "--input-type=module",
      "--eval",
      "import { createProcessBenchmark } from './dist/index.js'; process.stdout.write(typeof createProcessBenchmark)",
    ]);
    const commonJs = execute([
      "--eval",
      "const { createProcessBenchmark } = require('./dist/index.cjs'); process.stdout.write(typeof createProcessBenchmark)",
    ]);
    expect(esm).toBe("function");
    expect(commonJs).toBe("function");
  });

  it("measures queue wait when the libuv thread pool is saturated", () => {
    const stdout = execute(
      [fixture("thread-pool-pressure.mjs")],
      10_000,
      { UV_THREADPOOL_SIZE: "4" },
    );
    const metrics = JSON.parse(stdout) as {
      probeQueueWaitMs: number;
      probeExecutionMs: number;
      pressure: string;
      exactUtilizationAvailable: boolean;
    };
    expect(metrics.probeQueueWaitMs).toBeGreaterThan(20);
    expect(metrics.probeExecutionMs).toBeLessThan(0.1);
    expect(["high", "critical"]).toContain(metrics.pressure);
    expect(metrics.exactUtilizationAvailable).toBe(false);
  });
});
