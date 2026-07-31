import { constants, type PerformanceObserverEntryList } from "node:perf_hooks";
import { describe, expect, it, vi } from "vitest";
import {
  ActiveResourcesCollector,
  GarbageCollectionAggregator,
  GarbageCollectionCollector,
  normalizeGarbageCollectionKind,
  ResourceUsageCollector,
  sendSnapshotToParentPort,
} from "../src/index.js";

describe("GarbageCollectionAggregator", () => {
  it("aggregates cumulative and interval values by normalized kind", () => {
    const aggregator = new GarbageCollectionAggregator();
    aggregator.record("minor", 2);
    aggregator.record("minor", 4);
    aggregator.record("major", 10);
    expect(aggregator.collect()).toEqual({
      totalCount: 3,
      totalDurationMs: 16,
      averageDurationMs: 16 / 3,
      maxDurationMs: 10,
      intervalCount: 3,
      intervalDurationMs: 16,
      byKind: {
        minor: { count: 2, totalDurationMs: 6, maxDurationMs: 4 },
        major: { count: 1, totalDurationMs: 10, maxDurationMs: 10 },
      },
    });
    expect(aggregator.collect()).toMatchObject({
      totalCount: 3,
      totalDurationMs: 16,
      intervalCount: 0,
      intervalDurationMs: 0,
    });
  });

  it("maps Node.js GC constants to readable names", () => {
    expect(normalizeGarbageCollectionKind(constants.NODE_PERFORMANCE_GC_MINOR)).toBe("minor");
    expect(normalizeGarbageCollectionKind(constants.NODE_PERFORMANCE_GC_MAJOR)).toBe("major");
    expect(normalizeGarbageCollectionKind(999)).toBe("unknown_999");
    expect(normalizeGarbageCollectionKind(undefined)).toBe("unknown");
  });

  it("observes GC entries during its lifecycle", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    let notify!: (list: PerformanceObserverEntryList) => void;
    const collector = new GarbageCollectionCollector(
      new GarbageCollectionAggregator(),
      (callback) => {
        notify = callback;
        return { observe, disconnect };
      },
    );
    collector.start();
    notify({
      getEntries: () => [{
        name: "gc",
        entryType: "gc",
        startTime: 0,
        duration: 12,
        detail: { kind: constants.NODE_PERFORMANCE_GC_MAJOR },
        toJSON: () => ({}),
      }],
    } as unknown as PerformanceObserverEntryList);
    expect(collector.collect()).toMatchObject({
      totalCount: 1,
      maxDurationMs: 12,
      byKind: { major: { count: 1 } },
    });
    collector.stop();
    expect(observe).toHaveBeenCalledWith({ entryTypes: ["gc"] });
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe("ResourceUsageCollector", () => {
  it("maps process.resourceUsage fields to the public contract", () => {
    const collector = new ResourceUsageCollector(() => ({
      userCPUTime: 1,
      systemCPUTime: 2,
      maxRSS: 3,
      sharedMemorySize: 4,
      unsharedDataSize: 5,
      unsharedStackSize: 6,
      minorPageFault: 7,
      majorPageFault: 8,
      swappedOut: 9,
      fsRead: 10,
      fsWrite: 11,
      ipcSent: 12,
      ipcReceived: 13,
      signalsCount: 14,
      voluntaryContextSwitches: 15,
      involuntaryContextSwitches: 16,
    }));
    expect(collector.collect()).toEqual({
      userCpuTimeMicroseconds: 1,
      systemCpuTimeMicroseconds: 2,
      maxRssKilobytes: 3,
      minorPageFaults: 7,
      majorPageFaults: 8,
      voluntaryContextSwitches: 15,
      involuntaryContextSwitches: 16,
      filesystemReads: 10,
      filesystemWrites: 11,
      ipcMessagesSent: 12,
      ipcMessagesReceived: 13,
    });
  });
});

describe("ActiveResourcesCollector", () => {
  it("uses the public API without private process APIs by default", () => {
    const collector = new ActiveResourcesCollector(
      false,
      () => ["Timeout", "Timeout", "TCPSocketWrap"],
      {
        ...process,
        _getActiveHandles: () => { throw new Error("must not be called"); },
      },
    );
    expect(collector.collect()).toEqual({
      activeResources: 3,
      resourcesByType: { Timeout: 2, TCPSocketWrap: 1 },
    });
  });

  it("collects private handles and requests only with explicit opt-in", () => {
    class Socket {}
    class Request {}
    const collector = new ActiveResourcesCollector(
      true,
      () => [],
      {
        ...process,
        _getActiveHandles: () => [new Socket(), new Socket()],
        _getActiveRequests: () => [new Request()],
      },
    );
    expect(collector.collect()).toMatchObject({
      activeHandles: 2,
      activeRequests: 1,
      handlesByType: { Socket: 2 },
      requestsByType: { Request: 1 },
    });
  });
});

describe("Worker Thread helper", () => {
  it("does not send from the main thread", () => {
    expect(sendSnapshotToParentPort({} as never)).toBe(false);
  });
});
