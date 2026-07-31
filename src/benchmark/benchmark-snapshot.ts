import type { CpuMetrics } from "../collectors/cpu.collector.js";
import type { EventLoopDelayMetrics } from "../collectors/event-loop-delay.collector.js";
import type { EventLoopUtilizationMetrics } from "../collectors/event-loop-utilization.collector.js";
import type { MemoryMetrics } from "../collectors/memory.collector.js";
import type { ActiveResourcesMetrics } from "../collectors/active-resources.collector.js";
import type { GarbageCollectionMetrics } from "../collectors/garbage-collection.collector.js";
import type { ResourceUsageMetrics } from "../collectors/resource-usage.collector.js";
import type { ThreadPoolMetrics } from "../collectors/thread-pool-pressure.collector.js";
import type { BenchmarkAlert } from "../diagnostics/benchmark-alert.js";

export interface ProcessInfo {
  pid: number;
  ppid?: number;
  nodeVersion: string;
  v8Version: string;
  platform: NodeJS.Platform;
  architecture: string;
  processUptimeSeconds: number;
  systemUptimeSeconds: number;
  timestamp: string;
  hostname: string;
  processTitle: string;
  availableParallelism: number;
}

export interface ThreadInfo {
  isMainThread: boolean;
  threadId: number;
  name?: string;
}

export interface CollectionError {
  collector: string;
  message: string;
  timestamp: string;
  timedOut?: boolean;
}

export interface ProcessBenchmarkSnapshot {
  id: string;
  timestamp: string;
  intervalMs?: number;
  process?: ProcessInfo;
  thread: ThreadInfo;
  memory: MemoryMetrics;
  cpu: CpuMetrics;
  eventLoopDelay: EventLoopDelayMetrics;
  eventLoopUtilization: EventLoopUtilizationMetrics;
  garbageCollection?: GarbageCollectionMetrics;
  activeResources?: ActiveResourcesMetrics;
  resourceUsage?: ResourceUsageMetrics;
  threadPool?: ThreadPoolMetrics;
  custom?: Record<string, unknown>;
  alerts: BenchmarkAlert[];
  collectionErrors: CollectionError[];
}
