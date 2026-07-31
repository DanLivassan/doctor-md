import {
  DEFAULT_THRESHOLDS,
  type BenchmarkThresholds,
} from "../diagnostics/benchmark-thresholds.js";

export interface BenchmarkLogger {
  debug?(message: string, context?: Record<string, unknown>): void;
  info?(message: string, context?: Record<string, unknown>): void;
  warn?(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
}

export interface ProcessBenchmarkOptions {
  intervalMs?: number;
  eventLoopDelayResolutionMs?: number;
  resetEventLoopDelayOnSnapshot?: boolean;
  includeProcessInfoInEverySnapshot?: boolean;
  historySize?: number;
  unrefTimers?: boolean;
  collectGarbageCollection?: boolean;
  collectResourceUsage?: boolean;
  collectActiveResources?: boolean;
  /** Enables Node.js private active handle/request APIs. These APIs may change without notice. */
  collectInternalActiveResources?: boolean;
  threadPool?: {
    /** Enables the native libuv queue-wait probe. */
    enabled?: boolean;
    /** Time between probes. Must be at least 100 ms. */
    intervalMs?: number;
  };
  /** Timeout applied to asynchronous custom collectors. Use 0 to disable it. */
  customCollectorTimeoutMs?: number;
  errorPolicy?: "continue" | "throw";
  overlappingCollectionPolicy?: "skip";
  diagnostics?: {
    enabled?: boolean;
    thresholds?: Partial<BenchmarkThresholds>;
  };
  /** Allows intervals below 1 second. Such intervals may add noticeable overhead. */
  allowUnsafeInterval?: boolean;
  logger?: BenchmarkLogger;
}

export interface ResolvedProcessBenchmarkOptions {
  intervalMs: number;
  eventLoopDelayResolutionMs: number;
  resetEventLoopDelayOnSnapshot: boolean;
  includeProcessInfoInEverySnapshot: boolean;
  historySize: number;
  unrefTimers: boolean;
  collectGarbageCollection: boolean;
  collectResourceUsage: boolean;
  collectActiveResources: boolean;
  collectInternalActiveResources: boolean;
  threadPool: {
    enabled: boolean;
    intervalMs: number;
  };
  customCollectorTimeoutMs: number;
  errorPolicy: "continue" | "throw";
  overlappingCollectionPolicy: "skip";
  diagnostics: {
    enabled: boolean;
    thresholds: BenchmarkThresholds;
  };
  allowUnsafeInterval: boolean;
  logger?: BenchmarkLogger;
}

export const DEFAULT_OPTIONS: Readonly<Omit<ResolvedProcessBenchmarkOptions, "logger">> =
  Object.freeze({
    intervalMs: 5_000,
    eventLoopDelayResolutionMs: 20,
    resetEventLoopDelayOnSnapshot: true,
    includeProcessInfoInEverySnapshot: false,
    historySize: 60,
    unrefTimers: true,
    collectGarbageCollection: true,
    collectResourceUsage: true,
    collectActiveResources: true,
    collectInternalActiveResources: false,
    threadPool: {
      enabled: false,
      intervalMs: 1_000,
    },
    customCollectorTimeoutMs: 1_000,
    errorPolicy: "continue",
    overlappingCollectionPolicy: "skip",
    diagnostics: {
      enabled: true,
      thresholds: DEFAULT_THRESHOLDS,
    },
    allowUnsafeInterval: false,
  });

const assertInteger = (name: string, value: number, minimum: number): void => {
  if (!Number.isInteger(value) || value < minimum) {
    throw new TypeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
};

export function resolveOptions(
  options: ProcessBenchmarkOptions = {},
): ResolvedProcessBenchmarkOptions {
  const diagnostics = {
    enabled: options.diagnostics?.enabled ?? true,
    thresholds: {
      ...DEFAULT_THRESHOLDS,
      ...options.diagnostics?.thresholds,
    },
  };
  const threadPool = {
    ...DEFAULT_OPTIONS.threadPool,
    ...options.threadPool,
  };
  const resolved = { ...DEFAULT_OPTIONS, ...options, threadPool, diagnostics };
  assertInteger("intervalMs", resolved.intervalMs, resolved.allowUnsafeInterval ? 1 : 1_000);
  assertInteger("eventLoopDelayResolutionMs", resolved.eventLoopDelayResolutionMs, 1);
  assertInteger("historySize", resolved.historySize, 0);
  assertInteger("customCollectorTimeoutMs", resolved.customCollectorTimeoutMs, 0);
  assertInteger("threadPool.intervalMs", resolved.threadPool.intervalMs, 100);
  if (resolved.errorPolicy !== "continue" && resolved.errorPolicy !== "throw") {
    throw new TypeError('errorPolicy must be either "continue" or "throw"');
  }
  if (resolved.overlappingCollectionPolicy !== "skip") {
    throw new TypeError('overlappingCollectionPolicy must be "skip"');
  }
  assertInteger(
    "diagnostics.thresholds.memoryGrowthWindowSize",
    resolved.diagnostics.thresholds.memoryGrowthWindowSize,
    2,
  );
  for (const [name, value] of Object.entries(resolved.diagnostics.thresholds)) {
    if (name === "memoryGrowthWindowSize") continue;
    if (!Number.isFinite(value) || value < 0) {
      throw new TypeError(`diagnostics.thresholds.${name} must be a non-negative number`);
    }
  }
  const thresholdPairs: Array<[keyof BenchmarkThresholds, keyof BenchmarkThresholds]> = [
    ["eventLoopDelayP99WarningMs", "eventLoopDelayP99CriticalMs"],
    ["eventLoopUtilizationWarningPercent", "eventLoopUtilizationCriticalPercent"],
    ["cpuWarningPercent", "cpuCriticalPercent"],
    ["heapUsageWarningPercent", "heapUsageCriticalPercent"],
    ["gcPauseWarningMs", "gcPauseCriticalMs"],
    ["threadPoolQueueWaitWarningMs", "threadPoolQueueWaitCriticalMs"],
  ];
  for (const [warning, critical] of thresholdPairs) {
    if (resolved.diagnostics.thresholds[critical] < resolved.diagnostics.thresholds[warning]) {
      throw new TypeError(`diagnostics.thresholds.${critical} must be greater than or equal to ${warning}`);
    }
  }
  if (
    resolved.diagnostics.thresholds.threadPoolQueueWaitWarningMs
    < resolved.diagnostics.thresholds.threadPoolQueueWaitModerateMs
  ) {
    throw new TypeError(
      "diagnostics.thresholds.threadPoolQueueWaitWarningMs must be greater than or equal to threadPoolQueueWaitModerateMs",
    );
  }
  return resolved;
}
