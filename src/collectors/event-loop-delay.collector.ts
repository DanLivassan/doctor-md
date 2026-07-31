import { monitorEventLoopDelay, type IntervalHistogram } from "node:perf_hooks";
import type { BenchmarkCollector } from "./collector.js";

export interface EventLoopDelayMetrics {
  minMs: number;
  maxMs: number;
  meanMs: number;
  stddevMs: number;
  p50Ms: number;
  p75Ms: number;
  p90Ms: number;
  p95Ms: number;
  p99Ms: number;
  p999Ms: number;
  resolutionMs: number;
}

export interface EventLoopDelayHistogram {
  count?: number | bigint;
  min: number;
  max: number;
  mean: number;
  stddev: number;
  percentile(percentile: number): number;
  enable(): boolean;
  disable(): boolean;
  reset(): void;
}

export const nanosecondsToMilliseconds = (value: number): number =>
  Number.isFinite(value) && value >= 0 ? value / 1_000_000 : 0;

export class EventLoopDelayCollector implements BenchmarkCollector<EventLoopDelayMetrics> {
  readonly name = "eventLoopDelay";
  readonly #histogram: EventLoopDelayHistogram;

  constructor(
    private readonly resolutionMs: number,
    private readonly resetOnCollect: boolean,
    histogram?: EventLoopDelayHistogram,
  ) {
    this.#histogram = histogram ?? (monitorEventLoopDelay({ resolution: resolutionMs }) as IntervalHistogram);
  }

  start(): void {
    this.#histogram.reset();
    this.#histogram.enable();
  }

  collect(): EventLoopDelayMetrics {
    const hasSamples = this.#histogram.count === undefined || Number(this.#histogram.count) > 0;
    const milliseconds = (value: number): number =>
      hasSamples ? nanosecondsToMilliseconds(value) : 0;
    const metrics: EventLoopDelayMetrics = {
      minMs: milliseconds(this.#histogram.min),
      maxMs: milliseconds(this.#histogram.max),
      meanMs: milliseconds(this.#histogram.mean),
      stddevMs: milliseconds(this.#histogram.stddev),
      p50Ms: milliseconds(this.#histogram.percentile(50)),
      p75Ms: milliseconds(this.#histogram.percentile(75)),
      p90Ms: milliseconds(this.#histogram.percentile(90)),
      p95Ms: milliseconds(this.#histogram.percentile(95)),
      p99Ms: milliseconds(this.#histogram.percentile(99)),
      p999Ms: milliseconds(this.#histogram.percentile(99.9)),
      resolutionMs: this.resolutionMs,
    };
    if (this.resetOnCollect) this.#histogram.reset();
    return metrics;
  }

  reset(): void {
    this.#histogram.reset();
  }

  stop(): void {
    this.#histogram.disable();
  }
}
