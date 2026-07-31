import type { BenchmarkLogger } from "../benchmark/benchmark-options.js";
import { loadThreadPoolAddon } from "../native/thread-pool-addon.js";
import type { BenchmarkCollector } from "./collector.js";

export type ThreadPoolPressure = "low" | "moderate" | "high" | "critical";

export interface ThreadPoolPressureThresholds {
  moderateMs: number;
  highMs: number;
  criticalMs: number;
}

export interface ThreadPoolMetrics {
  configuredSize: number;
  probeQueueWaitMs: number;
  probeExecutionMs: number;
  pressure: ThreadPoolPressure;
  exactUtilizationAvailable: false;
  collectedAt: number;
}

export interface ThreadPoolPressureCollectorOptions {
  intervalMs: number;
  thresholds: ThreadPoolPressureThresholds;
  unrefTimer: boolean;
  logger?: BenchmarkLogger;
}

const configuredThreadPoolSize = (): number => {
  const value = Number.parseInt(process.env.UV_THREADPOOL_SIZE ?? "", 10);
  return Number.isInteger(value) && value > 0 ? Math.min(value, 1_024) : 4;
};

export const classifyThreadPoolPressure = (
  queueWaitMs: number,
  thresholds: ThreadPoolPressureThresholds,
): ThreadPoolPressure => {
  if (queueWaitMs >= thresholds.criticalMs) return "critical";
  if (queueWaitMs >= thresholds.highMs) return "high";
  if (queueWaitMs >= thresholds.moderateMs) return "moderate";
  return "low";
};

export class ThreadPoolPressureCollector
implements BenchmarkCollector<ThreadPoolMetrics | undefined> {
  readonly name = "threadPool";
  readonly #configuredSize = configuredThreadPoolSize();
  #timer?: NodeJS.Timeout;
  #latest?: ThreadPoolMetrics;
  #intervalPeak?: ThreadPoolMetrics;
  #running = false;
  #probeInProgress = false;
  #previousPressure?: ThreadPoolPressure;

  constructor(private readonly options: ThreadPoolPressureCollectorOptions) {}

  start(): void {
    if (this.#running) return;
    this.#running = true;
    void this.#runProbe();
    this.#timer = setInterval(() => void this.#runProbe(), this.options.intervalMs);
    if (this.options.unrefTimer) this.#timer.unref();
  }

  stop(): void {
    if (!this.#running) return;
    this.#running = false;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
  }

  collect(): ThreadPoolMetrics | undefined {
    const metrics = this.#intervalPeak ?? this.#latest;
    this.#intervalPeak = undefined;
    return metrics ? { ...metrics } : undefined;
  }

  async #runProbe(): Promise<void> {
    if (!this.#running || this.#probeInProgress) return;
    this.#probeInProgress = true;
    try {
      const result = await loadThreadPoolAddon().probe();
      if (!this.#running) return;
      const pressure = classifyThreadPoolPressure(result.queueWaitMs, this.options.thresholds);
      this.#latest = {
        configuredSize: this.#configuredSize,
        probeQueueWaitMs: result.queueWaitMs,
        probeExecutionMs: result.executionMs,
        pressure,
        exactUtilizationAvailable: false,
        collectedAt: Date.now(),
      };
      if (
        this.#intervalPeak === undefined
        || this.#latest.probeQueueWaitMs > this.#intervalPeak.probeQueueWaitMs
      ) {
        this.#intervalPeak = this.#latest;
      }
      if (this.#previousPressure !== undefined && this.#previousPressure !== pressure) {
        this.options.logger?.info?.("Thread pool pressure changed", {
          component: "threadpool",
          previousPressure: this.#previousPressure,
          pressure,
          queueWaitMs: result.queueWaitMs,
        });
      }
      this.#previousPressure = pressure;
    } catch (error) {
      this.options.logger?.error?.("Native thread pool probe failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.#probeInProgress = false;
    }
  }
}
