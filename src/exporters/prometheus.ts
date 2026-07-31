import type { ProcessBenchmarkSnapshot } from "../benchmark/benchmark-snapshot.js";

export interface PrometheusExporterOptions {
  prefix?: string;
}

export interface PrometheusExporter {
  consume(snapshot: ProcessBenchmarkSnapshot): void;
  metrics(): string;
}

const PROMETHEUS_NAME = /^[a-zA-Z_:][a-zA-Z0-9_:]*$/;

const metric = (
  lines: string[],
  name: string,
  type: "counter" | "gauge",
  help: string,
  value: number | undefined,
): void => {
  if (value === undefined || !Number.isFinite(value)) return;
  lines.push(`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, `${name} ${value}`);
};

export function createPrometheusExporter(
  options: PrometheusExporterOptions = {},
): PrometheusExporter {
  const prefix = options.prefix ?? "node_process_benchmark";
  if (!PROMETHEUS_NAME.test(prefix)) {
    throw new TypeError("prefix must be a valid Prometheus metric name");
  }

  let latest: ProcessBenchmarkSnapshot | undefined;
  let processUptimeSeconds: number | undefined;

  return {
    consume(snapshot) {
      latest = snapshot;
      processUptimeSeconds = snapshot.process?.processUptimeSeconds ?? process.uptime();
    },
    metrics() {
      if (!latest) return "";
      const lines: string[] = [];
      metric(lines, `${prefix}_cpu_usage_percent`, "gauge", "Process CPU usage percent.", latest.cpu.usagePercent);
      metric(lines, `${prefix}_memory_rss_bytes`, "gauge", "Resident set size in bytes.", latest.memory.rssBytes);
      metric(lines, `${prefix}_memory_heap_used_bytes`, "gauge", "Used V8 heap in bytes.", latest.memory.heapUsedBytes);
      metric(lines, `${prefix}_memory_heap_total_bytes`, "gauge", "Allocated V8 heap in bytes.", latest.memory.heapTotalBytes);
      metric(lines, `${prefix}_event_loop_delay_p99_milliseconds`, "gauge", "Event Loop Delay p99 in milliseconds.", latest.eventLoopDelay.p99Ms);
      metric(lines, `${prefix}_event_loop_delay_max_milliseconds`, "gauge", "Maximum Event Loop Delay in milliseconds.", latest.eventLoopDelay.maxMs);
      metric(lines, `${prefix}_event_loop_utilization_ratio`, "gauge", "Event Loop Utilization ratio.", latest.eventLoopUtilization.utilization);
      metric(lines, `${prefix}_gc_duration_milliseconds_total`, "counter", "Cumulative Garbage Collection duration in milliseconds.", latest.garbageCollection?.totalDurationMs);
      metric(lines, `${prefix}_gc_events_total`, "counter", "Cumulative Garbage Collection event count.", latest.garbageCollection?.totalCount);
      metric(lines, `${prefix}_active_resources`, "gauge", "Current active resource count.", latest.activeResources?.activeResources);
      metric(lines, `${prefix}_process_uptime_seconds`, "gauge", "Process uptime in seconds.", processUptimeSeconds);
      metric(lines, `${prefix}_resource_max_rss_kilobytes`, "gauge", "Maximum resident set size reported by process.resourceUsage().", latest.resourceUsage?.maxRssKilobytes);
      metric(lines, `${prefix}_libuv_threadpool_configured_size`, "gauge", "Configured libuv thread pool size.", latest.threadPool?.configuredSize);
      metric(lines, `${prefix}_libuv_threadpool_probe_queue_wait_seconds`, "gauge", "Maximum native libuv probe queue wait observed in the snapshot window, in seconds.", latest.threadPool ? latest.threadPool.probeQueueWaitMs / 1_000 : undefined);
      metric(lines, `${prefix}_libuv_threadpool_probe_execution_seconds`, "gauge", "Execution time of the probe that produced the reported queue wait, in seconds.", latest.threadPool ? latest.threadPool.probeExecutionMs / 1_000 : undefined);
      const pressure = latest.threadPool
        ? { low: 0, moderate: 1, high: 2, critical: 3 }[latest.threadPool.pressure]
        : undefined;
      metric(lines, `${prefix}_libuv_threadpool_pressure`, "gauge", "Thread pool pressure level: 0 low, 1 moderate, 2 high, 3 critical.", pressure);
      return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
    },
  };
}
