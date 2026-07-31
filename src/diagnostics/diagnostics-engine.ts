import type { ProcessBenchmarkSnapshot } from "../benchmark/benchmark-snapshot.js";
import type { BenchmarkAlert, BenchmarkAlertSeverity } from "./benchmark-alert.js";
import type { BenchmarkThresholds } from "./benchmark-thresholds.js";

interface ThresholdRule {
  code: string;
  metric: string;
  message: string;
  value: number | undefined;
  warning: number;
  critical: number;
}

const thresholdAlert = (
  rule: ThresholdRule,
  timestamp: string,
): BenchmarkAlert | undefined => {
  if (rule.value === undefined || !Number.isFinite(rule.value)) return undefined;
  let severity: BenchmarkAlertSeverity | undefined;
  let threshold: number | undefined;
  if (rule.value >= rule.critical) {
    severity = "critical";
    threshold = rule.critical;
  } else if (rule.value >= rule.warning) {
    severity = "warning";
    threshold = rule.warning;
  }
  if (!severity || threshold === undefined) return undefined;
  return {
    code: rule.code,
    severity,
    message: rule.message,
    metric: rule.metric,
    value: rule.value,
    threshold,
    timestamp,
  };
};

export class DiagnosticsEngine {
  readonly #heapSamples: number[] = [];

  constructor(private readonly thresholds: BenchmarkThresholds) {}

  evaluate(snapshot: ProcessBenchmarkSnapshot): BenchmarkAlert[] {
    const rules: ThresholdRule[] = [
      {
        code: "HIGH_EVENT_LOOP_DELAY",
        metric: "eventLoopDelay.p99Ms",
        message: "Event Loop delay p99 is above the configured threshold.",
        value: snapshot.eventLoopDelay.p99Ms,
        warning: this.thresholds.eventLoopDelayP99WarningMs,
        critical: this.thresholds.eventLoopDelayP99CriticalMs,
      },
      {
        code: "HIGH_EVENT_LOOP_UTILIZATION",
        metric: "eventLoopUtilization.utilizationPercent",
        message: "Event Loop utilization is above the configured threshold.",
        value: snapshot.eventLoopUtilization.utilizationPercent,
        warning: this.thresholds.eventLoopUtilizationWarningPercent,
        critical: this.thresholds.eventLoopUtilizationCriticalPercent,
      },
      {
        code: "HIGH_CPU_USAGE",
        metric: "cpu.usagePercent",
        message: "Process CPU usage is above the configured threshold.",
        value: snapshot.cpu.usagePercent,
        warning: this.thresholds.cpuWarningPercent,
        critical: this.thresholds.cpuCriticalPercent,
      },
      {
        code: "HIGH_HEAP_USAGE",
        metric: "memory.heapUsagePercent",
        message: "V8 heap usage is above the configured threshold.",
        value: snapshot.memory.heapUsagePercent,
        warning: this.thresholds.heapUsageWarningPercent,
        critical: this.thresholds.heapUsageCriticalPercent,
      },
      {
        code: "LONG_GC_PAUSE",
        metric: "garbageCollection.maxDurationMs",
        message: "A Garbage Collection pause is above the configured threshold.",
        value: snapshot.garbageCollection?.maxDurationMs,
        warning: this.thresholds.gcPauseWarningMs,
        critical: this.thresholds.gcPauseCriticalMs,
      },
      {
        code: "HIGH_THREAD_POOL_PRESSURE",
        metric: "threadPool.probeQueueWaitMs",
        message: "The libuv thread pool probe waited above the configured threshold.",
        value: snapshot.threadPool?.probeQueueWaitMs,
        warning: this.thresholds.threadPoolQueueWaitWarningMs,
        critical: this.thresholds.threadPoolQueueWaitCriticalMs,
      },
    ];

    const alerts = rules
      .map((rule) => thresholdAlert(rule, snapshot.timestamp))
      .filter((alert): alert is BenchmarkAlert => alert !== undefined);
    const growthAlert = this.memoryGrowthAlert(snapshot);
    if (growthAlert) alerts.push(growthAlert);
    return alerts;
  }

  private memoryGrowthAlert(
    snapshot: ProcessBenchmarkSnapshot,
  ): BenchmarkAlert | undefined {
    this.#heapSamples.push(snapshot.memory.heapUsedBytes);
    if (this.#heapSamples.length > this.thresholds.memoryGrowthWindowSize) {
      this.#heapSamples.shift();
    }
    if (this.#heapSamples.length < this.thresholds.memoryGrowthWindowSize) return undefined;
    const initialHeap = this.#heapSamples[0] ?? 0;
    if (initialHeap <= 0) return undefined;
    const currentHeap = snapshot.memory.heapUsedBytes;
    const growthPercent = ((currentHeap - initialHeap) / initialHeap) * 100;
    if (growthPercent < this.thresholds.memoryGrowthWarningPercent) return undefined;
    return {
      code: "MEMORY_GROWTH",
      severity: "warning",
      message: "Heap usage grew across the configured sample window; investigate the trend.",
      metric: "memory.heapUsedBytes",
      value: growthPercent,
      threshold: this.thresholds.memoryGrowthWarningPercent,
      timestamp: snapshot.timestamp,
    };
  }
}
