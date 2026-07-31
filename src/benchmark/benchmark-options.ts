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
  const resolved = { ...DEFAULT_OPTIONS, ...options, diagnostics };
  assertInteger("intervalMs", resolved.intervalMs, resolved.allowUnsafeInterval ? 1 : 1_000);
  assertInteger("eventLoopDelayResolutionMs", resolved.eventLoopDelayResolutionMs, 1);
  assertInteger("historySize", resolved.historySize, 0);
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
  ];
  for (const [warning, critical] of thresholdPairs) {
    if (resolved.diagnostics.thresholds[critical] < resolved.diagnostics.thresholds[warning]) {
      throw new TypeError(`diagnostics.thresholds.${critical} must be greater than or equal to ${warning}`);
    }
  }
  return resolved;
}
