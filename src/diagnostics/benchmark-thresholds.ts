export interface BenchmarkThresholds {
  eventLoopDelayP99WarningMs: number;
  eventLoopDelayP99CriticalMs: number;
  eventLoopUtilizationWarningPercent: number;
  eventLoopUtilizationCriticalPercent: number;
  cpuWarningPercent: number;
  cpuCriticalPercent: number;
  heapUsageWarningPercent: number;
  heapUsageCriticalPercent: number;
  gcPauseWarningMs: number;
  gcPauseCriticalMs: number;
  threadPoolQueueWaitModerateMs: number;
  threadPoolQueueWaitWarningMs: number;
  threadPoolQueueWaitCriticalMs: number;
  memoryGrowthWindowSize: number;
  memoryGrowthWarningPercent: number;
}

export const DEFAULT_THRESHOLDS: Readonly<BenchmarkThresholds> = Object.freeze({
  eventLoopDelayP99WarningMs: 50,
  eventLoopDelayP99CriticalMs: 200,
  eventLoopUtilizationWarningPercent: 70,
  eventLoopUtilizationCriticalPercent: 90,
  cpuWarningPercent: 80,
  cpuCriticalPercent: 150,
  heapUsageWarningPercent: 80,
  heapUsageCriticalPercent: 90,
  gcPauseWarningMs: 50,
  gcPauseCriticalMs: 200,
  threadPoolQueueWaitModerateMs: 5,
  threadPoolQueueWaitWarningMs: 20,
  threadPoolQueueWaitCriticalMs: 100,
  memoryGrowthWindowSize: 12,
  memoryGrowthWarningPercent: 20,
});
