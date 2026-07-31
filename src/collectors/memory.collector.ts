import type { BenchmarkCollector } from "./collector.js";

export interface MemoryMetrics {
  rssBytes: number;
  heapTotalBytes: number;
  heapUsedBytes: number;
  externalBytes: number;
  arrayBuffersBytes: number;
  heapUsagePercent: number;
  deltaRssBytes?: number;
  deltaHeapUsedBytes?: number;
  peakRssBytes: number;
  peakHeapUsedBytes: number;
}

export class MemoryCollector implements BenchmarkCollector<MemoryMetrics> {
  readonly name = "memory";
  #previous?: NodeJS.MemoryUsage;
  #peakRssBytes = 0;
  #peakHeapUsedBytes = 0;

  constructor(private readonly readMemoryUsage = (): NodeJS.MemoryUsage => process.memoryUsage()) {}

  collect(): MemoryMetrics {
    const current = this.readMemoryUsage();
    this.#peakRssBytes = Math.max(this.#peakRssBytes, current.rss);
    this.#peakHeapUsedBytes = Math.max(this.#peakHeapUsedBytes, current.heapUsed);

    const metrics: MemoryMetrics = {
      rssBytes: current.rss,
      heapTotalBytes: current.heapTotal,
      heapUsedBytes: current.heapUsed,
      externalBytes: current.external,
      arrayBuffersBytes: current.arrayBuffers,
      heapUsagePercent: current.heapTotal === 0 ? 0 : (current.heapUsed / current.heapTotal) * 100,
      peakRssBytes: this.#peakRssBytes,
      peakHeapUsedBytes: this.#peakHeapUsedBytes,
    };
    if (this.#previous) {
      metrics.deltaRssBytes = current.rss - this.#previous.rss;
      metrics.deltaHeapUsedBytes = current.heapUsed - this.#previous.heapUsed;
    }
    this.#previous = current;
    return metrics;
  }
}
