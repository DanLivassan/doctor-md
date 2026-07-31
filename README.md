# @danxcode/node-md

A framework-independent TypeScript library for collecting Node.js process performance metrics with low overhead.

The current release collects and exports:

- memory usage;
- CPU usage;
- Event Loop Delay;
- Event Loop Utilization;
- Garbage Collection activity;
- operating-system resource usage;
- active Node.js resources;
- process and current Worker Thread information;
- a bounded snapshot history;
- configurable diagnostic alerts;
- JSON, JSON Lines, Prometheus, and HTTP output.

Node.js 20 or newer is required.

## Installation

Install the public package from npm:

```bash
npm install @danxcode/node-md
```

During local library development, install the parent directory instead:

```bash
npm install /path/to/node-md
```

## Quick start

```ts
import { createProcessBenchmark } from "@danxcode/node-md";

const benchmark = createProcessBenchmark();

benchmark.onSnapshot((snapshot) => {
  console.log(JSON.stringify(snapshot));
});

benchmark.start();

const shutdown = () => {
  benchmark.stop();
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
```

By default, a snapshot is produced every five seconds. The timer uses `unref()`, so it does not keep the Node.js process alive on its own.

## Manual snapshots

You do not need to start periodic collection to take a snapshot:

```ts
const benchmark = createProcessBenchmark();
const snapshot = benchmark.snapshot();

console.log(snapshot.cpu.usagePercent);
console.log(snapshot.memory.rssBytes);
console.log(snapshot.eventLoopDelay.p99Ms);
console.log(snapshot.eventLoopUtilization.utilizationPercent);
```

Snapshots are directly JSON-serializable:

```ts
const json = JSON.stringify(benchmark.snapshot(), null, 2);
```

## Configuration

```ts
const benchmark = createProcessBenchmark({
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
  customCollectorTimeoutMs: 1_000,
  errorPolicy: "continue",
  overlappingCollectionPolicy: "skip",
  diagnostics: {
    enabled: true,
  },
});
```

Available options:

| Option | Default | Description |
| --- | ---: | --- |
| `intervalMs` | `5000` | Time between periodic snapshots. |
| `eventLoopDelayResolutionMs` | `20` | Event Loop Delay histogram resolution. |
| `resetEventLoopDelayOnSnapshot` | `true` | Resets the histogram after each snapshot. |
| `includeProcessInfoInEverySnapshot` | `false` | Includes process information in every snapshot. By default, it appears only in the first one. |
| `historySize` | `60` | Maximum number of snapshots retained in memory. Use `0` to disable history. |
| `unrefTimers` | `true` | Prevents the collection timer from keeping the process alive. |
| `collectGarbageCollection` | `true` | Observes GC events through `PerformanceObserver`. |
| `collectResourceUsage` | `true` | Collects values exposed by `process.resourceUsage()`. |
| `collectActiveResources` | `true` | Collects resource types from the public `process.getActiveResourcesInfo()` API. |
| `collectInternalActiveResources` | `false` | Opts into private Node.js APIs for handle and request details. |
| `customCollectorTimeoutMs` | `1000` | Maximum wait for each asynchronous custom collector. |
| `errorPolicy` | `continue` | Records custom collector failures. Use `throw` for strict mode. |
| `overlappingCollectionPolicy` | `skip` | Prevents periodic async collections from accumulating. |
| `diagnostics.enabled` | `true` | Enables heuristic alerts. |
| `diagnostics.thresholds` | defaults below | Overrides individual diagnostic thresholds. |
| `allowUnsafeInterval` | `false` | Allows intervals shorter than one second, which may increase overhead. |
| `logger` | none | Optional logger used to report listener errors. |

Intervals shorter than one second are rejected by default. To explicitly enable one:

```ts
const benchmark = createProcessBenchmark({
  intervalMs: 250,
  allowUnsafeInterval: true,
});
```

## Lifecycle

`start()` and `stop()` are idempotent. Repeated calls do not create extra timers or throw errors.

```ts
benchmark.start();
benchmark.start(); // Only one timer is active.

benchmark.stop();
benchmark.stop(); // Safe no-op.
```

Both methods return the benchmark instance:

```ts
createProcessBenchmark().start();
```

## Receiving snapshots

Use `onSnapshot()` to receive periodic snapshots. The returned function removes the listener:

```ts
const unsubscribe = benchmark.onSnapshot((snapshot) => {
  console.log("CPU:", snapshot.cpu.usagePercent);
});

benchmark.start();

unsubscribe();
```

If one listener throws, the remaining listeners still run. An optional logger can receive the error:

```ts
const benchmark = createProcessBenchmark({
  logger: {
    error(message, context) {
      console.error(message, context);
    },
  },
});
```

## History

History uses a circular buffer. Once its limit is reached, the oldest snapshots are discarded.

```ts
const benchmark = createProcessBenchmark({ historySize: 10 });

benchmark.snapshot();
benchmark.snapshot();

const snapshots = benchmark.getHistory();
```

`getHistory()` returns a safe copy. Changing the returned array or its snapshots does not mutate the internal history.

To disable history:

```ts
const benchmark = createProcessBenchmark({ historySize: 0 });
```

## Snapshot structure

```ts
interface ProcessBenchmarkSnapshot {
  id: string;
  timestamp: string;
  intervalMs?: number;
  process?: ProcessInfo;
  thread: {
    isMainThread: boolean;
    threadId: number;
  };
  memory: MemoryMetrics;
  cpu: CpuMetrics;
  eventLoopDelay: EventLoopDelayMetrics;
  eventLoopUtilization: EventLoopUtilizationMetrics;
  garbageCollection?: GarbageCollectionMetrics;
  resourceUsage?: ResourceUsageMetrics;
  activeResources?: ActiveResourcesMetrics;
  custom?: Record<string, unknown>;
  alerts: BenchmarkAlert[];
  collectionErrors: CollectionError[];
}
```

Simplified example:

```json
{
  "id": "d0ca9d81-a8d1-492c-a846-fef70f591eae",
  "timestamp": "2026-07-31T14:00:00.000Z",
  "intervalMs": 5001,
  "thread": {
    "isMainThread": true,
    "threadId": 0
  },
  "memory": {
    "rssBytes": 73400320,
    "heapTotalBytes": 12582912,
    "heapUsedBytes": 8388608,
    "heapUsagePercent": 66.67,
    "peakRssBytes": 73400320,
    "peakHeapUsedBytes": 8388608
  },
  "cpu": {
    "userMicroseconds": 280000,
    "systemMicroseconds": 70000,
    "totalMicroseconds": 350000,
    "intervalTotalMicroseconds": 100000,
    "usagePercent": 2,
    "peakUsagePercent": 2
  },
  "eventLoopDelay": {
    "p99Ms": 21.2,
    "maxMs": 24.8,
    "resolutionMs": 20
  },
  "eventLoopUtilization": {
    "activeMilliseconds": 250,
    "idleMilliseconds": 4750,
    "utilization": 0.05,
    "utilizationPercent": 5
  },
  "alerts": []
}
```

Actual snapshots also contain the remaining percentiles and fields exposed by the public types.

## Understanding the metrics

### Memory

- `rssBytes`: total resident memory used by the process;
- `heapUsedBytes`: V8 heap currently in use;
- `heapTotalBytes`: V8 heap currently allocated;
- `heapUsagePercent`: ratio between used and total heap;
- `deltaRssBytes` and `deltaHeapUsedBytes`: change since the previous snapshot;
- `peakRssBytes` and `peakHeapUsedBytes`: highest values observed by this benchmark instance.

All memory sizes are returned in bytes.

### CPU

`usagePercent` represents the CPU time consumed by the process during the interval between two collections:

```text
CPU % = interval CPU time / elapsed wall-clock time × 100
```

The value may exceed 100% on multicore systems. This means the process consumed more CPU time during the interval than a single core could provide.

Interval fields and `usagePercent` may be absent from the first collection when no previous sample exists.

### Event Loop Delay

Event Loop Delay measures how late callbacks run compared with their expected execution time. The public API converts the native nanosecond values to milliseconds and exposes the minimum, maximum, mean, standard deviation, and percentiles from p50 through p99.9.

With `resetEventLoopDelayOnSnapshot: true`, values represent the window since the previous snapshot. When set to `false`, the histogram remains cumulative from the beginning of collection.

### Event Loop Utilization

Event Loop Utilization measures the proportion of time for which the Event Loop was active:

- `utilization`: a ratio from `0` to `1`;
- `utilizationPercent`: the same value expressed as a percentage;
- `activeMilliseconds` and `idleMilliseconds`: times for the current interval.

Delay and utilization answer different questions. A process may have high utilization without significant delays, or experience a short blocking operation that increases delay without keeping utilization high for the entire window.

### Garbage Collection

Garbage Collection collection is enabled by default and uses `PerformanceObserver` entries of type `gc`:

```ts
const snapshot = benchmark.snapshot();

console.log(snapshot.garbageCollection?.totalCount);
console.log(snapshot.garbageCollection?.intervalCount);
console.log(snapshot.garbageCollection?.maxDurationMs);
console.log(snapshot.garbageCollection?.byKind);
```

Totals and per-kind aggregations are cumulative for the lifetime of the collector. `intervalCount` and `intervalDurationMs` are reset after each snapshot. GC kinds are exposed as readable names such as `minor`, `major`, `incremental`, and `weakCallbacks`.

GC performance entries have changed across Node.js versions. The collector supports both the current `detail.kind` field and the legacy `kind` field.

To disable this observer:

```ts
const benchmark = createProcessBenchmark({
  collectGarbageCollection: false,
});
```

### Resource usage

`resourceUsage` comes from `process.resourceUsage()` and includes CPU time, maximum RSS, page faults, context switches, filesystem operations, and IPC message counts:

```ts
const usage = benchmark.snapshot().resourceUsage;

console.log(usage?.maxRssKilobytes);
console.log(usage?.voluntaryContextSwitches);
console.log(usage?.filesystemReads);
```

The meaning and availability of these counters may differ between Linux, macOS, and Windows. In particular, `maxRssKilobytes` is the platform value reported by Node.js and is not the same as the current `memory.rssBytes` value.

### Active resources

By default, only the public `process.getActiveResourcesInfo()` API is used:

```ts
const resources = benchmark.snapshot().activeResources;

console.log(resources?.activeResources);
console.log(resources?.resourcesByType);
```

For deeper troubleshooting, private Node.js APIs can be explicitly enabled:

```ts
const benchmark = createProcessBenchmark({
  collectInternalActiveResources: true,
});
```

This adds `activeHandles`, `activeRequests`, `handlesByType`, and `requestsByType`. The underlying `_getActiveHandles()` and `_getActiveRequests()` APIs are private, may change without notice, and are never used unless this option is enabled.

## Diagnostics

Diagnostics are heuristic signals for investigation, not definitive diagnoses. They are enabled by default and evaluate CPU, heap, Event Loop Delay, Event Loop Utilization, GC pauses, and memory growth across multiple samples.

```ts
const benchmark = createProcessBenchmark({
  diagnostics: {
    enabled: true,
    thresholds: {
      eventLoopDelayP99WarningMs: 40,
      cpuWarningPercent: 70,
      heapUsageCriticalPercent: 95,
      memoryGrowthWindowSize: 10,
      memoryGrowthWarningPercent: 15,
    },
  },
});

benchmark.onSnapshot((snapshot) => {
  for (const alert of snapshot.alerts) {
    console.warn(alert.code, alert.severity, alert.message);
  }
});
```

Default thresholds:

| Signal | Warning | Critical |
| --- | ---: | ---: |
| Event Loop Delay p99 | 50 ms | 200 ms |
| Event Loop Utilization | 70% | 90% |
| CPU usage | 80% | 150% |
| Heap usage | 80% | 90% |
| Maximum GC pause | 50 ms | 200 ms |

Memory growth defaults to a 20% increase across a 12-snapshot window. A single sample never produces a memory growth alert.

Disable diagnostics while continuing to collect metrics with:

```ts
const benchmark = createProcessBenchmark({
  diagnostics: { enabled: false },
});
```

## Custom collectors

Phase 4 lets applications add JSON-serializable metrics without modifying the library:

```ts
const unregister = benchmark.registerCollector({
  name: "queue",
  collect() {
    return {
      pendingJobs: queue.pendingCount(),
      activeJobs: queue.activeCount(),
    };
  },
});

const snapshot = benchmark.snapshot();
console.log(snapshot.custom?.queue);

unregister();
```

Collector names must be unique and cannot replace built-in fields. A collector may also define `start`, `reset`, and `stop` lifecycle hooks.

For an asynchronous collector, use `snapshotAsync()`:

```ts
const benchmark = createProcessBenchmark({
  customCollectorTimeoutMs: 750,
  errorPolicy: "continue",
});

benchmark.registerCollector({
  name: "databasePool",
  async collect() {
    return getDatabasePoolStats();
  },
});

const snapshot = await benchmark.snapshotAsync();
```

With the default `continue` policy, a failed or timed-out collector does not discard the snapshot. Its failure appears in `collectionErrors`, and other collectors continue normally:

```ts
for (const error of snapshot.collectionErrors) {
  console.error(error.collector, error.message, error.timedOut);
}
```

Use `errorPolicy: "throw"` when collector failure must reject `snapshotAsync()`. Timeouts can interrupt only asynchronous work represented by a Promise; JavaScript cannot preempt a collector that blocks synchronously. Periodic asynchronous collection uses the `skip` overlap policy, so a slow cycle never creates an unbounded queue.

## JSON export

Export the latest collected snapshot:

```ts
const json = benchmark.exportJson();
const prettyJson = benchmark.exportJson({ pretty: true });
```

Export the bounded history:

```ts
const historyJson = benchmark.exportJson({
  includeHistory: true,
  pretty: true,
});
```

If no snapshot exists yet, exporting the latest snapshot performs one collection.

## Structured JSON logs

The JSON log exporter writes exactly one valid JSON object per line and has no dependency on Pino, Winston, or Bunyan:

```ts
import {
  createJsonLogExporter,
  createProcessBenchmark,
} from "@danxcode/node-md";

const benchmark = createProcessBenchmark();
const jsonLog = createJsonLogExporter({
  write(line) {
    process.stdout.write(`${line}\n`);
  },
});

benchmark.onSnapshot(jsonLog.consume);
benchmark.start();
```

## Prometheus

The Prometheus exporter does not start an HTTP server. It consumes snapshots and exposes the latest metric values as Prometheus text:

```ts
import { createProcessBenchmark } from "@danxcode/node-md";
import { createPrometheusExporter } from "@danxcode/node-md/prometheus";

const benchmark = createProcessBenchmark();
const prometheus = createPrometheusExporter({
  prefix: "node_process_benchmark",
});

benchmark.onSnapshot(prometheus.consume);
benchmark.start();

const metricsText = prometheus.metrics();
```

The output uses gauges for current values and counters for cumulative GC values. PID is not used as a label, avoiding an unnecessary source of cardinality.

## HTTP handler

The library provides a framework-independent handler but never starts a server automatically.

### Node.js HTTP

```ts
import http from "node:http";
import { createProcessBenchmark } from "@danxcode/node-md";

const benchmark = createProcessBenchmark().start();
const benchmarkHandler = benchmark.createHttpHandler({ format: "json" });

const server = http.createServer((request, response) => {
  if (request.url === "/internal/benchmark") {
    benchmarkHandler(request, response);
    return;
  }

  response.statusCode = 404;
  response.end();
});

server.listen(3000);
```

For Prometheus output:

```ts
const metricsHandler = benchmark.createHttpHandler({
  format: "prometheus",
  prometheus: { prefix: "my_service" },
});
```

### Express

```ts
app.get("/internal/benchmark", (_request, response) => {
  response.json(benchmark.snapshot());
});
```

### Fastify

```ts
fastify.get("/internal/benchmark", async () => benchmark.snapshot());
```

### NestJS

```ts
@Get("benchmark")
getBenchmark() {
  return this.benchmark.snapshot();
}
```

Benchmark endpoints may reveal operational details. Protect them with network restrictions, authentication, or both.

## Sending metrics to an AI system

The recommended integration point is an `onSnapshot()` callback or a JSON export. The core library intentionally does not send data to an AI provider, store API keys, or make external network requests.

Prefer sending a bounded window rather than asking an AI to diagnose a single sample. Also select only the fields needed for analysis instead of forwarding the complete process metadata:

```ts
const benchmark = createProcessBenchmark({ historySize: 12 });
let sampleCount = 0;

benchmark.onSnapshot(() => {
  sampleCount += 1;
  if (sampleCount % 12 !== 0) return;

  const samples = benchmark.getHistory().map((snapshot) => ({
    timestamp: snapshot.timestamp,
    cpu: snapshot.cpu,
    memory: snapshot.memory,
    eventLoopDelay: snapshot.eventLoopDelay,
    eventLoopUtilization: snapshot.eventLoopUtilization,
    garbageCollection: snapshot.garbageCollection,
    activeResources: snapshot.activeResources,
    alerts: snapshot.alerts,
  }));

  void fetch("https://your-internal-ai-gateway.example/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ samples }),
  }).catch((error) => {
    // Send this error to your application logger.
    console.error("AI analysis request failed", error);
  });
});

benchmark.start();
```

Use your own authenticated backend or AI gateway for the provider call. Do not expose provider credentials in a public metrics endpoint. Treat AI output as an investigation aid: performance conclusions should be verified against the raw time series, application behavior, and workload context.

## CommonJS

The package can also be loaded with `require()`:

```js
const { createProcessBenchmark } = require("@danxcode/node-md");

const benchmark = createProcessBenchmark();
console.log(benchmark.snapshot());
```

## Worker Threads

Each instance measures the Event Loop of the thread in which it was created. The snapshot identifies whether it is running on the main thread:

```ts
const snapshot = benchmark.snapshot();

console.log(snapshot.thread.isMainThread);
console.log(snapshot.thread.threadId);
```

The library does not yet automatically discover or aggregate every Worker in a process.

A Worker can send its snapshot to the parent thread with the provided helper:

```ts
import {
  createProcessBenchmark,
  sendSnapshotToParentPort,
} from "@danxcode/node-md";

const benchmark = createProcessBenchmark();

benchmark.onSnapshot((snapshot) => {
  sendSnapshotToParentPort(snapshot);
});

benchmark.start();
```

## Development

```bash
npm install
npm run lint
npm run typecheck
npm test
npm run test:integration
npm run build
```

The build produces ESM, CommonJS, source maps, and TypeScript declarations in `dist/`. Run `npm run benchmark:overhead` for the isolated overhead comparison; methodology and a recorded run are in [docs/overhead.md](docs/overhead.md).

## Publishing a new version

The package is public and scoped as `@danxcode/node-md`. Authenticate with the npm account that owns the `@danxcode` scope, then publish from the repository root:

```bash
npm login
npm whoami
npm run verify
npm publish --access public
```

The repository must already contain the version you intend to publish in `package.json`. Before a future release, use `npm version patch` for backward-compatible fixes, `minor` for backward-compatible features, and `major` for breaking changes. Do not run it again when the desired version is already prepared. `npm version` creates a Git commit and tag; push both after a successful publication:

```bash
git push
git push --tags
npm view @danxcode/node-md version
```

Never commit an npm access token. If npm requires two-factor authentication, follow its prompt or publish with an appropriately scoped automation token in CI.

## Current scope and limitations

Phases 1 through 4 are implemented. Exact libuv thread pool occupancy is not exposed by a public Node.js API. The visual example therefore reports pending application jobs and their batch latency as an observable pressure experiment, not as an invented utilization percentage. A native queue-wait probe remains a separate proposed feature.

The library does not claim to measure exact libuv thread-pool occupancy, automatically discover all Worker Threads, diagnose memory leaks from a single sample, or replace a full APM platform.
