import { describe, expect, it } from "vitest";
import {
  createProcessBenchmark,
  DEFAULT_THRESHOLDS,
  DiagnosticsEngine,
  type ProcessBenchmarkSnapshot,
} from "../src/index.js";

const makeSnapshot = (): ProcessBenchmarkSnapshot =>
  createProcessBenchmark({
    historySize: 0,
    collectGarbageCollection: false,
    collectResourceUsage: false,
    collectActiveResources: false,
    diagnostics: { enabled: false },
  }).snapshot();

describe("DiagnosticsEngine", () => {
  it("emits warning and critical threshold alerts", () => {
    const snapshot = makeSnapshot();
    snapshot.cpu.usagePercent = 100;
    snapshot.memory.heapUsagePercent = 95;
    snapshot.eventLoopDelay.p99Ms = 75;
    snapshot.eventLoopUtilization.utilizationPercent = 75;
    snapshot.garbageCollection = {
      totalCount: 1,
      totalDurationMs: 250,
      averageDurationMs: 250,
      maxDurationMs: 250,
      intervalCount: 1,
      intervalDurationMs: 250,
      byKind: {},
    };
    snapshot.threadPool = {
      configuredSize: 4,
      probeQueueWaitMs: 125,
      probeExecutionMs: 0.01,
      pressure: "critical",
      exactUtilizationAvailable: false,
      collectedAt: Date.now(),
    };
    const alerts = new DiagnosticsEngine(DEFAULT_THRESHOLDS).evaluate(snapshot);
    expect(alerts.map(({ code, severity }) => ({ code, severity }))).toEqual([
      { code: "HIGH_EVENT_LOOP_DELAY", severity: "warning" },
      { code: "HIGH_EVENT_LOOP_UTILIZATION", severity: "warning" },
      { code: "HIGH_CPU_USAGE", severity: "warning" },
      { code: "HIGH_HEAP_USAGE", severity: "critical" },
      { code: "LONG_GC_PAUSE", severity: "critical" },
      { code: "HIGH_THREAD_POOL_PRESSURE", severity: "critical" },
    ]);
  });

  it("requires a complete sample window before reporting memory growth", () => {
    const thresholds = { ...DEFAULT_THRESHOLDS, memoryGrowthWindowSize: 3 };
    const snapshots = [makeSnapshot(), makeSnapshot(), makeSnapshot()];
    snapshots[0]!.memory.heapUsedBytes = 100;
    snapshots[1]!.memory.heapUsedBytes = 110;
    snapshots[2]!.memory.heapUsedBytes = 125;
    const engine = new DiagnosticsEngine(thresholds);
    expect(
      engine.evaluate(snapshots[0]!)
        .filter(({ code }) => code === "MEMORY_GROWTH"),
    ).toHaveLength(0);
    expect(
      engine.evaluate(snapshots[1]!)
        .filter(({ code }) => code === "MEMORY_GROWTH"),
    ).toHaveLength(0);
    expect(engine.evaluate(snapshots[2]!)).toContainEqual(
      expect.objectContaining({ code: "MEMORY_GROWTH", value: 25 }),
    );
  });
});
