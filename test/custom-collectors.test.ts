import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CollectorTimeoutError,
  createProcessBenchmark,
  DuplicateCollectorError,
} from "../src/index.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("custom collectors", () => {
  it("collects synchronous metrics and supports unregistering", () => {
    const benchmark = createProcessBenchmark({ diagnostics: { enabled: false } });
    const unregister = benchmark.registerCollector({
      name: "queue",
      collect: () => ({ pendingJobs: 4, activeJobs: 2 }),
    });
    expect(benchmark.snapshot().custom).toEqual({
      queue: { pendingJobs: 4, activeJobs: 2 },
    });
    unregister();
    unregister();
    expect(benchmark.snapshot().custom).toBeUndefined();
  });

  it("rejects duplicate and reserved collector names", () => {
    const benchmark = createProcessBenchmark();
    benchmark.registerCollector({ name: "queue", collect: () => 1 });
    expect(() => benchmark.registerCollector({ name: "queue", collect: () => 2 }))
      .toThrow(DuplicateCollectorError);
    expect(() => benchmark.registerCollector({ name: "cpu", collect: () => 1 }))
      .toThrow(DuplicateCollectorError);
  });

  it("isolates collector errors by default", () => {
    const logger = { error: vi.fn() };
    const benchmark = createProcessBenchmark({ logger });
    benchmark.registerCollector({
      name: "broken",
      collect: () => { throw new Error("queue unavailable"); },
    });
    const snapshot = benchmark.snapshot();
    expect(snapshot.collectionErrors).toEqual([
      expect.objectContaining({ collector: "broken", message: "queue unavailable" }),
    ]);
    expect(logger.error).toHaveBeenCalled();
  });

  it("throws collector errors in strict mode", () => {
    const benchmark = createProcessBenchmark({ errorPolicy: "throw" });
    benchmark.registerCollector({
      name: "broken",
      collect: () => { throw new Error("strict failure"); },
    });
    expect(() => benchmark.snapshot()).toThrow("strict failure");
  });

  it("collects asynchronous metrics through snapshotAsync", async () => {
    const benchmark = createProcessBenchmark();
    benchmark.registerCollector({
      name: "asyncQueue",
      async collect() {
        await Promise.resolve();
        return { depth: 7 };
      },
    });
    await expect(benchmark.snapshotAsync()).resolves.toMatchObject({
      custom: { asyncQueue: { depth: 7 } },
      collectionErrors: [],
    });
  });

  it("records asynchronous collector timeouts", async () => {
    const benchmark = createProcessBenchmark({
      customCollectorTimeoutMs: 10,
      unrefTimers: false,
    });
    benchmark.registerCollector({
      name: "slow",
      collect: () => new Promise<never>(() => undefined),
    });
    const snapshot = await benchmark.snapshotAsync();
    expect(snapshot.collectionErrors).toEqual([
      expect.objectContaining({ collector: "slow", timedOut: true }),
    ]);
    expect(snapshot.custom).toBeUndefined();
  });

  it("throws a timeout error in strict mode", async () => {
    const benchmark = createProcessBenchmark({
      customCollectorTimeoutMs: 10,
      unrefTimers: false,
      errorPolicy: "throw",
    });
    benchmark.registerCollector({
      name: "slow",
      collect: () => new Promise<never>(() => undefined),
    });
    await expect(benchmark.snapshotAsync()).rejects.toBeInstanceOf(CollectorTimeoutError);
  });

  it("runs custom lifecycle hooks once", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const benchmark = createProcessBenchmark();
    benchmark.registerCollector({ name: "lifecycle", start, stop, collect: () => true });
    benchmark.start().start();
    benchmark.stop().stop();
    expect(start).toHaveBeenCalledOnce();
    expect(stop).toHaveBeenCalledOnce();
  });

  it("serializes concurrent asynchronous snapshots", async () => {
    let active = 0;
    let maximumActive = 0;
    const benchmark = createProcessBenchmark({
      customCollectorTimeoutMs: 100,
      unrefTimers: false,
    });
    benchmark.registerCollector({
      name: "serialized",
      async collect() {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return true;
      },
    });
    await Promise.all([benchmark.snapshotAsync(), benchmark.snapshotAsync()]);
    expect(maximumActive).toBe(1);
  });

  it("skips overlapping periodic collections", async () => {
    vi.useFakeTimers();
    let finishCollection!: (value: number) => void;
    const logger = { debug: vi.fn() };
    const collect = vi.fn(() => new Promise<number>((resolve) => {
      finishCollection = resolve;
    }));
    const benchmark = createProcessBenchmark({
      intervalMs: 1_000,
      customCollectorTimeoutMs: 0,
      unrefTimers: false,
      logger,
    });
    benchmark.registerCollector({ name: "slowPeriodic", collect });
    benchmark.start();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(collect).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(collect).toHaveBeenCalledOnce();
    expect(logger.debug).toHaveBeenCalledWith(
      "Periodic snapshot skipped because collection is still running",
    );
    finishCollection(1);
    await vi.advanceTimersByTimeAsync(0);
    benchmark.stop();
  });

  it("isolates rejected asynchronous listeners", async () => {
    const logger = { error: vi.fn() };
    const benchmark = createProcessBenchmark({ logger });
    benchmark.onSnapshot(async () => { throw new Error("async listener failure"); });
    benchmark.snapshot();
    await vi.waitFor(() => expect(logger.error).toHaveBeenCalledWith(
      "Snapshot listener failed",
      { error: "async listener failure" },
    ));
  });
});
