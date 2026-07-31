# node-md example project

This minimal project demonstrates `@danxcode/node-md` in a plain Node.js HTTP server.

Open `http://localhost:3000` to use the live dashboard. It plots Event Loop Utilization and maximum Event Loop Delay, shows CPU and heap usage, displays recent diagnostic alerts, and provides buttons for firing both example routes.

The example intentionally uses more sensitive CPU and Event Loop Utilization thresholds than the library defaults, making the blocking route trigger multiple alerts consistently. This configuration is for demonstration only.

It exposes two routes:

- `GET /fast`: returns immediately;
- `GET /blocked`: performs synchronous work and intentionally blocks the Event Loop for about 750 ms.

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

Wait for one or two benchmark lines to appear, then call the fast route from another terminal:

```bash
curl http://localhost:3000/fast
```

Call the problematic route:

```bash
curl http://localhost:3000/blocked
```

After calling `/blocked`, the next `[benchmark]` line should show a large increase in Event Loop Delay, Event Loop Utilization, and CPU usage.

Inspect a complete snapshot with:

```bash
curl http://localhost:3000/internal/benchmark
```

Press `Ctrl+C` to stop the server cleanly.
