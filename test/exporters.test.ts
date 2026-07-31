import type { IncomingMessage, ServerResponse } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  createBenchmarkHttpHandler,
  createJsonLogExporter,
  createProcessBenchmark,
  createPrometheusExporter,
} from "../src/index.js";

const benchmarkOptions = {
  collectGarbageCollection: false,
  collectResourceUsage: false,
  collectActiveResources: false,
  diagnostics: { enabled: false },
} as const;

describe("JSON exporters", () => {
  it("exports the latest snapshot or history", () => {
    const benchmark = createProcessBenchmark({ ...benchmarkOptions, historySize: 2 });
    benchmark.snapshot();
    benchmark.snapshot();
    expect(JSON.parse(benchmark.exportJson())).toHaveProperty("id");
    expect(JSON.parse(benchmark.exportJson({ includeHistory: true }))).toHaveLength(2);
    expect(benchmark.exportJson({ pretty: true })).toContain("\n  \"id\"");
  });

  it("writes one valid JSON object per consumed snapshot", () => {
    const lines: string[] = [];
    const exporter = createJsonLogExporter({ write: (line) => lines.push(line) });
    const snapshot = createProcessBenchmark(benchmarkOptions).snapshot();
    exporter.consume(snapshot);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ id: snapshot.id });
    expect(lines[0]).not.toContain("\n");
  });
});

describe("Prometheus exporter", () => {
  it("produces valid gauges and counters without PID labels", () => {
    const snapshot = createProcessBenchmark(benchmarkOptions).snapshot();
    snapshot.cpu.usagePercent = 42;
    snapshot.garbageCollection = {
      totalCount: 3,
      totalDurationMs: 4.5,
      averageDurationMs: 1.5,
      maxDurationMs: 2,
      intervalCount: 1,
      intervalDurationMs: 1,
      byKind: {},
    };
    snapshot.threadPool = {
      configuredSize: 4,
      probeQueueWaitMs: 42,
      probeExecutionMs: 0.08,
      pressure: "high",
      exactUtilizationAvailable: false,
      collectedAt: Date.now(),
    };
    const exporter = createPrometheusExporter({ prefix: "example" });
    exporter.consume(snapshot);
    const output = exporter.metrics();
    expect(output).toContain("# TYPE example_cpu_usage_percent gauge");
    expect(output).toContain("example_cpu_usage_percent 42");
    expect(output).toContain("# TYPE example_gc_events_total counter");
    expect(output).toContain("example_libuv_threadpool_configured_size 4");
    expect(output).toContain("example_libuv_threadpool_probe_queue_wait_seconds 0.042");
    expect(output).toContain("example_libuv_threadpool_probe_execution_seconds 0.00008");
    expect(output).toContain("example_libuv_threadpool_pressure 2");
    expect(output).not.toContain("pid=");
  });

  it("rejects invalid metric prefixes", () => {
    expect(() => createPrometheusExporter({ prefix: "not valid" })).toThrow(/prefix/);
  });
});

describe("HTTP handler", () => {
  it("returns a JSON snapshot", () => {
    const benchmark = createProcessBenchmark(benchmarkOptions);
    const handler = createBenchmarkHttpHandler(benchmark);
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    handler({ method: "GET" } as IncomingMessage, response);
    expect(response.statusCode).toBe(200);
    expect(response.setHeader).toHaveBeenCalledWith(
      "content-type",
      "application/json; charset=utf-8",
    );
    expect(JSON.parse(vi.mocked(response.end).mock.calls[0]?.[0] as string)).toHaveProperty("id");
  });

  it("returns Prometheus text and rejects unsupported methods", () => {
    const benchmark = createProcessBenchmark(benchmarkOptions);
    const handler = benchmark.createHttpHandler({ format: "prometheus" });
    const response = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    handler({ method: "GET" } as IncomingMessage, response);
    expect(response.statusCode).toBe(200);
    expect(vi.mocked(response.end).mock.calls[0]?.[0]).toContain(
      "node_process_benchmark_memory_rss_bytes",
    );

    const rejected = {
      statusCode: 0,
      setHeader: vi.fn(),
      end: vi.fn(),
    } as unknown as ServerResponse;
    handler({ method: "POST" } as IncomingMessage, rejected);
    expect(rejected.statusCode).toBe(405);
  });
});
