import type { CpuMetrics } from "../collectors/cpu.collector.js";
import type { EventLoopDelayMetrics } from "../collectors/event-loop-delay.collector.js";
import type { EventLoopUtilizationMetrics } from "../collectors/event-loop-utilization.collector.js";
import type { MemoryMetrics } from "../collectors/memory.collector.js";

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
  alerts: [];
}
