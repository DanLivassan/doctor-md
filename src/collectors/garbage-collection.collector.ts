import {
  constants,
  PerformanceObserver,
  type PerformanceEntry,
  type PerformanceObserverEntryList,
} from "node:perf_hooks";
import type { BenchmarkCollector } from "./collector.js";

export interface GarbageCollectionKindMetrics {
  count: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

export interface GarbageCollectionMetrics {
  totalCount: number;
  totalDurationMs: number;
  averageDurationMs: number;
  maxDurationMs: number;
  intervalCount: number;
  intervalDurationMs: number;
  byKind: Record<string, GarbageCollectionKindMetrics>;
}

interface GarbageCollectionPerformanceEntry extends PerformanceEntry {
  detail?: { kind?: number };
  /** Present on older supported Node.js releases. */
  kind?: number;
}

const GC_KIND_NAMES = new Map<number, string>([
  [constants.NODE_PERFORMANCE_GC_MINOR, "minor"],
  [constants.NODE_PERFORMANCE_GC_MAJOR, "major"],
  [constants.NODE_PERFORMANCE_GC_INCREMENTAL, "incremental"],
  [constants.NODE_PERFORMANCE_GC_WEAKCB, "weakCallbacks"],
]);

export function normalizeGarbageCollectionKind(kind: number | undefined): string {
  if (kind === undefined) return "unknown";
  return GC_KIND_NAMES.get(kind) ?? `unknown_${kind}`;
}

export class GarbageCollectionAggregator {
  #totalCount = 0;
  #totalDurationMs = 0;
  #maxDurationMs = 0;
  #intervalCount = 0;
  #intervalDurationMs = 0;
  readonly #byKind = new Map<string, GarbageCollectionKindMetrics>();

  record(kind: string, durationMs: number): void {
    if (!Number.isFinite(durationMs) || durationMs < 0) return;
    this.#totalCount += 1;
    this.#totalDurationMs += durationMs;
    this.#maxDurationMs = Math.max(this.#maxDurationMs, durationMs);
    this.#intervalCount += 1;
    this.#intervalDurationMs += durationMs;
    const current = this.#byKind.get(kind) ?? {
      count: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    current.count += 1;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    this.#byKind.set(kind, current);
  }

  collect(): GarbageCollectionMetrics {
    const metrics: GarbageCollectionMetrics = {
      totalCount: this.#totalCount,
      totalDurationMs: this.#totalDurationMs,
      averageDurationMs: this.#totalCount === 0 ? 0 : this.#totalDurationMs / this.#totalCount,
      maxDurationMs: this.#maxDurationMs,
      intervalCount: this.#intervalCount,
      intervalDurationMs: this.#intervalDurationMs,
      byKind: Object.fromEntries(
        [...this.#byKind].map(([kind, value]) => [kind, { ...value }]),
      ),
    };
    this.#intervalCount = 0;
    this.#intervalDurationMs = 0;
    return metrics;
  }
}

type ObserverFactory = (
  callback: (list: PerformanceObserverEntryList) => void,
) => Pick<PerformanceObserver, "observe" | "disconnect">;

export class GarbageCollectionCollector
  implements BenchmarkCollector<GarbageCollectionMetrics>
{
  readonly name = "garbageCollection";
  readonly #aggregator: GarbageCollectionAggregator;
  readonly #observer: Pick<PerformanceObserver, "observe" | "disconnect">;

  constructor(
    aggregator = new GarbageCollectionAggregator(),
    observerFactory: ObserverFactory = (callback) => new PerformanceObserver(callback),
  ) {
    this.#aggregator = aggregator;
    this.#observer = observerFactory((list) => {
      for (const entry of list.getEntries() as GarbageCollectionPerformanceEntry[]) {
        const kind = entry.detail?.kind ?? entry.kind;
        this.#aggregator.record(normalizeGarbageCollectionKind(kind), entry.duration);
      }
    });
  }

  start(): void {
    this.#observer.observe({ entryTypes: ["gc"] });
  }

  collect(): GarbageCollectionMetrics {
    return this.#aggregator.collect();
  }

  stop(): void {
    this.#observer.disconnect();
  }
}
