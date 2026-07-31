import { afterEach, describe, expect, it, vi } from "vitest";
import { createProcessBenchmark } from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("ProcessBenchmark", () => {
  it("creates a JSON-serializable snapshot and bounded safe history", () => {
    const benchmark = createProcessBenchmark({
      historySize: 1,
      diagnostics: { enabled: false },
    });
    const first = benchmark.snapshot();
    const second = benchmark.snapshot();
    expect(() => JSON.stringify(second)).not.toThrow();
    expect(first.process).toBeDefined();
    expect(second.process).toBeUndefined();
    expect(second).toMatchObject({
      id: expect.any(String),
      timestamp: expect.any(String),
      thread: { isMainThread: expect.any(Boolean), threadId: expect.any(Number) },
      memory: { rssBytes: expect.any(Number) },
      cpu: { totalMicroseconds: expect.any(Number) },
      eventLoopDelay: { resolutionMs: 20 },
      eventLoopUtilization: { utilizationPercent: expect.any(Number) },
      alerts: [],
    });
    const history = benchmark.getHistory();
    expect(history).toHaveLength(1);
    expect(history[0]?.id).toBe(second.id);
    second.memory.rssBytes = -2;
    expect(benchmark.getHistory()[0]!.memory.rssBytes).not.toBe(-2);
    history[0]!.memory.rssBytes = -1;
    expect(benchmark.getHistory()[0]!.memory.rssBytes).not.toBe(-1);
  });

  it("starts and stops idempotently and emits periodic snapshots", () => {
    vi.useFakeTimers();
    const benchmark = createProcessBenchmark({ intervalMs: 1_000, unrefTimers: false });
    const listener = vi.fn();
    benchmark.onSnapshot(listener);
    expect(benchmark.start()).toBe(benchmark);
    benchmark.start();
    vi.advanceTimersByTime(2_100);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(benchmark.stop()).toBe(benchmark);
    benchmark.stop();
    vi.advanceTimersByTime(2_000);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("isolates listener failures and supports unsubscribe", () => {
    const logger = { error: vi.fn() };
    const benchmark = createProcessBenchmark({ logger });
    const healthy = vi.fn();
    benchmark.onSnapshot(() => { throw new Error("consumer failed"); });
    const unsubscribe = benchmark.onSnapshot(healthy);
    benchmark.snapshot();
    expect(healthy).toHaveBeenCalledOnce();
    expect(logger.error).toHaveBeenCalledOnce();
    unsubscribe();
    benchmark.snapshot();
    expect(healthy).toHaveBeenCalledOnce();
  });

  it("can include process information in every snapshot", () => {
    const benchmark = createProcessBenchmark({ includeProcessInfoInEverySnapshot: true });
    expect(benchmark.snapshot().process).toBeDefined();
    expect(benchmark.snapshot().process).toBeDefined();
  });

  it("can disable every advanced collector", () => {
    const snapshot = createProcessBenchmark({
      collectGarbageCollection: false,
      collectResourceUsage: false,
      collectActiveResources: false,
    }).snapshot();
    expect(snapshot.garbageCollection).toBeUndefined();
    expect(snapshot.resourceUsage).toBeUndefined();
    expect(snapshot.activeResources).toBeUndefined();
  });
});
