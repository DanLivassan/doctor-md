import http from "node:http";
import { pbkdf2 } from "node:crypto";
import { performance } from "node:perf_hooks";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import { createProcessBenchmark } from "@danxcode/node-md";

const PORT = Number(process.env.PORT ?? 3000);
const BLOCK_DURATION_MS = 750;
const pbkdf2Async = promisify(pbkdf2);
const threadPoolExperiment = {
  running: false,
  submitted: 0,
  pending: 0,
  completed: 0,
  lastDurationMs: 0,
};
const staticFiles = await Promise.all([
  readFile(new URL("./public/index.html", import.meta.url)),
  readFile(new URL("./public/styles.css", import.meta.url)),
  readFile(new URL("./public/app.js", import.meta.url)),
]);
const [indexHtml, stylesCss, appJavaScript] = staticFiles;

const benchmark = createProcessBenchmark({
  intervalMs: 1_000,
  eventLoopDelayResolutionMs: 10,
  resetEventLoopDelayOnSnapshot: true,
  historySize: 10,
  diagnostics: {
    enabled: true,
    thresholds: {
      eventLoopDelayP99WarningMs: 40,
      eventLoopDelayP99CriticalMs: 200,
      eventLoopUtilizationWarningPercent: 50,
      eventLoopUtilizationCriticalPercent: 85,
      cpuWarningPercent: 50,
      cpuCriticalPercent: 90,
      heapUsageWarningPercent: 90,
      heapUsageCriticalPercent: 97,
    },
  },
});

benchmark.onSnapshot((snapshot) => {
  const metrics = {
    timestamp: snapshot.timestamp,
    cpuPercent: snapshot.cpu.usagePercent?.toFixed(2),
    eventLoopDelayP99Ms: snapshot.eventLoopDelay.p99Ms.toFixed(2),
    eventLoopDelayMaxMs: snapshot.eventLoopDelay.maxMs.toFixed(2),
    eventLoopUtilizationPercent:
      snapshot.eventLoopUtilization.utilizationPercent.toFixed(2),
  };

  process.stdout.write(`[benchmark] ${JSON.stringify(metrics)}\n`);
});

benchmark.start();

const benchmarkHttpHandler = benchmark.createHttpHandler({
  format: "json",
  pretty: true,
});

const server = http.createServer(async (request, response) => {
  try {
  if (request.url === "/" || request.url === "/index.html") {
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(indexHtml);
    return;
  }

  if (request.url === "/styles.css") {
    response.setHeader("content-type", "text/css; charset=utf-8");
    response.end(stylesCss);
    return;
  }

  if (request.url === "/app.js") {
    response.setHeader("content-type", "text/javascript; charset=utf-8");
    response.end(appJavaScript);
    return;
  }

  if (request.url === "/api/metrics") {
    const snapshot = benchmark.getLatestSnapshot() ?? benchmark.snapshot();
    const recentAlertsByCode = new Map();
    for (const historicalSnapshot of benchmark.getHistory()) {
      for (const alert of historicalSnapshot.alerts) {
        recentAlertsByCode.set(alert.code, alert);
      }
    }
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.setHeader("cache-control", "no-store");
    response.end(JSON.stringify({
      ...snapshot,
      recentAlerts: [...recentAlertsByCode.values()],
      experiments: {
        garbageCollectionAvailable: typeof globalThis.gc === "function",
        threadPool: threadPoolExperiment,
      },
    }));
    return;
  }

  if (request.url === "/internal/benchmark") {
    benchmarkHttpHandler(request, response);
    return;
  }

  response.setHeader("content-type", "application/json; charset=utf-8");

  if (request.url === "/fast") {
    response.end(JSON.stringify({
      route: "fast",
      message: "This response does not intentionally block the Event Loop.",
    }));
    return;
  }

  if (request.url === "/blocked") {
    const startedAt = performance.now();

    while (performance.now() - startedAt < BLOCK_DURATION_MS) {
      // Intentional synchronous work used to demonstrate Event Loop blocking.
    }

    response.end(JSON.stringify({
      route: "blocked",
      message: `The Event Loop was intentionally blocked for about ${BLOCK_DURATION_MS} ms.`,
    }));
    return;
  }

  if (request.url === "/garbage-collection") {
    const heapBeforeBytes = process.memoryUsage().heapUsed;
    const allocations = Array.from({ length: 30_000 }, (_, index) => ({
      index,
      payload: `${index}-${"x".repeat(512)}`,
    }));
    const heapAfterAllocationBytes = process.memoryUsage().heapUsed;
    allocations.length = 0;
    globalThis.gc?.();

    response.end(JSON.stringify({
      route: "garbage-collection",
      message: typeof globalThis.gc === "function"
        ? "Allocated temporary heap objects and requested an explicit garbage collection."
        : "Allocated temporary heap objects. Explicit GC is unavailable; start Node.js with --expose-gc.",
      allocatedHeapMb: (heapAfterAllocationBytes - heapBeforeBytes) / 1024 / 1024,
    }));
    return;
  }

  if (request.url === "/libuv-thread-pool") {
    if (threadPoolExperiment.running) {
      response.statusCode = 409;
      response.end(JSON.stringify({
        route: "libuv-thread-pool",
        message: "A thread pool pressure experiment is already running.",
      }));
      return;
    }

    const taskCount = 12;
    const startedAt = performance.now();
    threadPoolExperiment.running = true;
    threadPoolExperiment.submitted = taskCount;
    threadPoolExperiment.pending = taskCount;
    threadPoolExperiment.completed = 0;

    const tasks = Array.from({ length: taskCount }, async (_, index) => {
      await pbkdf2Async(`password-${index}`, "node-md-demo", 180_000, 32, "sha256");
      threadPoolExperiment.pending -= 1;
      threadPoolExperiment.completed += 1;
    });
    await Promise.all(tasks);
    threadPoolExperiment.running = false;
    threadPoolExperiment.lastDurationMs = performance.now() - startedAt;

    response.end(JSON.stringify({
      route: "libuv-thread-pool",
      message: `Completed ${taskCount} concurrent PBKDF2 jobs in the libuv thread pool.`,
      durationMs: threadPoolExperiment.lastDurationMs,
    }));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "Not found" }));
  } catch (error) {
    response.statusCode = 500;
    response.setHeader("content-type", "application/json; charset=utf-8");
    response.end(JSON.stringify({
      error: error instanceof Error ? error.message : String(error),
    }));
  }
});

server.listen(PORT, () => {
  process.stdout.write(`Example server listening at http://localhost:${PORT}\n`);
  process.stdout.write(`Dashboard:     http://localhost:${PORT}/\n`);
  process.stdout.write(`Fast route:    http://localhost:${PORT}/fast\n`);
  process.stdout.write(`Blocked route: http://localhost:${PORT}/blocked\n`);
  process.stdout.write(`GC route:      http://localhost:${PORT}/garbage-collection\n`);
  process.stdout.write(`libuv route:   http://localhost:${PORT}/libuv-thread-pool\n`);
  process.stdout.write(`Benchmark:     http://localhost:${PORT}/internal/benchmark\n`);
});

const shutdown = () => {
  benchmark.stop();
  server.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
