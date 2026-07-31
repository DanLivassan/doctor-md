import type { IncomingMessage, ServerResponse } from "node:http";
import type { ProcessBenchmarkSnapshot } from "../benchmark/benchmark-snapshot.js";
import { createPrometheusExporter, type PrometheusExporterOptions } from "./prometheus.js";

export interface BenchmarkHttpSource {
  snapshot(): ProcessBenchmarkSnapshot;
  getHistory(): ProcessBenchmarkSnapshot[];
}

export interface HttpHandlerOptions {
  format?: "json" | "prometheus";
  includeHistory?: boolean;
  pretty?: boolean;
  prometheus?: PrometheusExporterOptions;
}

export type BenchmarkHttpHandler = (
  request: IncomingMessage,
  response: ServerResponse,
) => void;

export function createBenchmarkHttpHandler(
  source: BenchmarkHttpSource,
  options: HttpHandlerOptions = {},
): BenchmarkHttpHandler {
  const format = options.format ?? "json";
  const prometheus = format === "prometheus"
    ? createPrometheusExporter(options.prometheus)
    : undefined;

  return (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.statusCode = 405;
      response.setHeader("allow", "GET, HEAD");
      response.end();
      return;
    }

    try {
      const snapshot = source.snapshot();
      let body: string;
      if (prometheus) {
        prometheus.consume(snapshot);
        body = prometheus.metrics();
        response.setHeader("content-type", "text/plain; version=0.0.4; charset=utf-8");
      } else {
        const value = options.includeHistory ? source.getHistory() : snapshot;
        body = JSON.stringify(value, null, options.pretty ? 2 : undefined);
        response.setHeader("content-type", "application/json; charset=utf-8");
      }
      response.statusCode = 200;
      response.end(request.method === "HEAD" ? undefined : body);
    } catch {
      response.statusCode = 500;
      response.setHeader("content-type", "application/json; charset=utf-8");
      response.end(JSON.stringify({ error: "Benchmark collection failed" }));
    }
  };
}
