import { describe, expect, it, vi } from "vitest";
import {
  calculateCpuUsagePercent,
  CpuCollector,
  EventLoopDelayCollector,
  EventLoopUtilizationCollector,
  MemoryCollector,
  nanosecondsToMilliseconds,
} from "../src/index.js";

describe("MemoryCollector", () => {
  it("calculates percentages, deltas and peaks", () => {
    const reads = [
      { rss: 100, heapTotal: 100, heapUsed: 40, external: 5, arrayBuffers: 2 },
      { rss: 90, heapTotal: 200, heapUsed: 100, external: 7, arrayBuffers: 3 },
    ];
    const collector = new MemoryCollector(() => reads.shift()!);
    expect(collector.collect()).toMatchObject({
      heapUsagePercent: 40,
      peakRssBytes: 100,
      peakHeapUsedBytes: 40,
    });
    expect(collector.collect()).toMatchObject({
      heapUsagePercent: 50,
      deltaRssBytes: -10,
      deltaHeapUsedBytes: 60,
      peakRssBytes: 100,
      peakHeapUsedBytes: 100,
    });
  });
});

describe("CpuCollector", () => {
  it("calculates interval usage and a peak", () => {
    const usages = [
      { user: 10, system: 5 },
      { user: 400_010, system: 100_005 },
      { user: 500_010, system: 100_005 },
    ];
    const times = [0n, 1_000_000_000n, 2_000_000_000n];
    const collector = new CpuCollector(() => usages.shift()!, () => times.shift()!);
    collector.start();
    expect(collector.collect()).toMatchObject({ intervalTotalMicroseconds: 500_000, usagePercent: 50 });
    expect(collector.collect()).toMatchObject({ usagePercent: 10, peakUsagePercent: 50 });
  });

  it("supports CPU values above 100 percent", () => {
    expect(calculateCpuUsagePercent(2_000_000, 1_000_000_000n)).toBe(200);
  });
});

describe("EventLoopDelayCollector", () => {
  it("converts native nanoseconds and resets after collection", () => {
    const histogram = {
      min: 1_000_000,
      max: 9_000_000,
      mean: 3_000_000,
      stddev: 2_000_000,
      percentile: vi.fn((percentile: number) => percentile * 1_000_000),
      enable: vi.fn(() => true),
      disable: vi.fn(() => true),
      reset: vi.fn(),
    };
    const collector = new EventLoopDelayCollector(20, true, histogram);
    collector.start();
    expect(collector.collect()).toMatchObject({ minMs: 1, maxMs: 9, p99Ms: 99, p999Ms: 99.9 });
    expect(histogram.reset).toHaveBeenCalledTimes(2);
    collector.stop();
    expect(histogram.enable).toHaveBeenCalledOnce();
    expect(histogram.disable).toHaveBeenCalledOnce();
  });

  it("normalizes missing samples", () => {
    expect(nanosecondsToMilliseconds(Number.NaN)).toBe(0);
    expect(nanosecondsToMilliseconds(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it("returns zero for an empty native histogram", () => {
    const histogram = {
      count: 0n,
      min: Number.MAX_SAFE_INTEGER,
      max: 0,
      mean: Number.NaN,
      stddev: Number.NaN,
      percentile: vi.fn(() => 0),
      enable: vi.fn(() => true),
      disable: vi.fn(() => true),
      reset: vi.fn(),
    };
    const metrics = new EventLoopDelayCollector(20, false, histogram).collect();
    expect(metrics).toMatchObject({ minMs: 0, maxMs: 0, meanMs: 0, p99Ms: 0 });
  });
});

describe("EventLoopUtilizationCollector", () => {
  it("returns interval values instead of cumulative values", () => {
    const readings = [
      { active: 100, idle: 300, utilization: 0.25 },
      { active: 150, idle: 350, utilization: 0.3 },
    ];
    const collector = new EventLoopUtilizationCollector(() => readings.shift()!);
    collector.start();
    expect(collector.collect()).toEqual({
      activeMilliseconds: 50,
      idleMilliseconds: 50,
      utilization: 0.5,
      utilizationPercent: 50,
    });
  });
});
