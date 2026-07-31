# node-md example project

This minimal project demonstrates `@danxcode/node-md` in a plain Node.js HTTP server.

Open `http://localhost:3000` to use the live dashboard. It plots Event Loop Utilization and maximum Event Loop Delay, shows CPU, heap, and Garbage Collection activity, displays recent diagnostic alerts, and provides actionable workload buttons.

The example intentionally uses more sensitive CPU and Event Loop Utilization thresholds than the library defaults, making the blocking route trigger multiple alerts consistently. This configuration is for demonstration only.

The benchmark enables the native thread pool probe every 250 ms. Its panel shows queue wait, probe execution time, pressure level, configured pool size, pending PBKDF2 jobs, and batch duration.

It exposes four experiment routes:

- `GET /fast`: returns immediately;
- `GET /blocked`: performs synchronous work and intentionally blocks the Event Loop for about 750 ms.
- `GET /garbage-collection`: allocates temporary heap objects, releases them, and explicitly requests GC;
- `GET /libuv-thread-pool`: submits 12 concurrent PBKDF2 jobs to the libuv thread pool.

It also exposes `GET /internal/benchmark`, using the library's JSON HTTP handler.

## Run the example

First, build the library from the parent directory:

```bash
cd ..
npm install
npm run build
```

Then install and start this example:

```bash
cd example-project
npm install
npm start
```

The start script uses `node --expose-gc server.mjs`, which is required for the GC button to request an explicit collection. The allocation itself is real, and the dashboard updates the collector's interval count, total count, and maximum observed pause after the next sample.

Wait for one or two benchmark lines to appear, then call the fast route from another terminal:

```bash
curl http://localhost:3000/fast
```

Call the problematic route:

```bash
curl http://localhost:3000/blocked
```

Trigger allocation and explicit Garbage Collection:

```bash
curl http://localhost:3000/garbage-collection
```

Submit concurrent work to the libuv thread pool:

```bash
curl http://localhost:3000/libuv-thread-pool
```

After calling `/blocked`, the next `[benchmark]` line should show a large increase in Event Loop Delay, Event Loop Utilization, and CPU usage.

The PBKDF2 button fills the default thread pool while the native zero-work probe waits in the same queue. This should produce a `HIGH_THREAD_POOL_PRESSURE` alert even when Event Loop Delay remains healthy. Node.js does not expose exact libuv worker occupancy, so the probe reports scheduling latency rather than a utilization percentage. The default pool normally has four workers; setting `UV_THREADPOOL_SIZE` before process startup changes it.

Inspect a complete snapshot with:

```bash
curl http://localhost:3000/internal/benchmark
```

Press `Ctrl+C` to stop the server cleanly.
