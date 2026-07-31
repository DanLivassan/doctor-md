# @danilo/node-md

A framework-independent TypeScript library for collecting Node.js process performance metrics with low overhead.

The current core release collects:

- memory usage;
- CPU usage;
- Event Loop Delay;
- Event Loop Utilization;
- process and current Worker Thread information;
- a bounded snapshot history.

Node.js 20 or newer is required.

## Installation

Until the package is published, install it from a local directory:

```bash
npm install /path/to/node-md
```

After publication:

```bash
npm install @danilo/node-md
```

## Quick start

```ts
import { createProcessBenchmark } from "@danilo/node-md";

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
  alerts: [];
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

## CommonJS

The package can also be loaded with `require()`:

```js
const { createProcessBenchmark } = require("@danilo/node-md");

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

## Development

```bash
npm install
npm test
npm run build
```

The build produces ESM, CommonJS, source maps, and TypeScript declarations in `dist/`.

## Current scope

This is the Phase 1 core implementation. The following features are not available yet:

- Garbage Collection and `resourceUsage()` collection;
- active resources;
- diagnostics and alerts;
- custom collectors;
- JSON log and Prometheus exporters;
- an HTTP endpoint;
- aggregated summaries.

These features belong to later phases in the project specification.
