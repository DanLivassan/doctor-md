import { setTimeout as wait } from "node:timers/promises";
import { createProcessBenchmark } from "../../../dist/index.js";

const benchmark = createProcessBenchmark({
  collectGarbageCollection: false,
  collectResourceUsage: false,
  collectActiveResources: false,
  diagnostics: { enabled: false },
}).start();

await new Promise((resolve) => setTimeout(resolve, 50));
const startedAt = performance.now();
while (performance.now() - startedAt < 200) {
  // Intentional integration-test blockage.
}
await wait(30);
const snapshot = benchmark.snapshot();
benchmark.stop();
process.stdout.write(JSON.stringify(snapshot.eventLoopDelay));
