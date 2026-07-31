import http from "node:http";
import { performance } from "node:perf_hooks";
import { createProcessBenchmark } from "@danilo/node-md";

const PORT = 3000;
const BLOCK_DURATION_MS = 750;

const benchmark = createProcessBenchmark({
  intervalMs: 1_000,
  eventLoopDelayResolutionMs: 10,
  resetEventLoopDelayOnSnapshot: true,
  historySize: 10,
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

const server = http.createServer((request, response) => {
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

  response.statusCode = 404;
  response.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, () => {
  process.stdout.write(`Example server listening at http://localhost:${PORT}\n`);
  process.stdout.write(`Fast route:    http://localhost:${PORT}/fast\n`);
  process.stdout.write(`Blocked route: http://localhost:${PORT}/blocked\n`);
});

const shutdown = () => {
  benchmark.stop();
  server.close(() => process.exit(0));
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
