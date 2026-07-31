import { setTimeout as wait } from "node:timers/promises";
import { createProcessBenchmark } from "../../../dist/index.js";

if (typeof globalThis.gc !== "function") process.exit(2);
const benchmark = createProcessBenchmark({
  collectGarbageCollection: true,
  diagnostics: { enabled: false },
}).start();

for (let cycle = 0; cycle < 4; cycle += 1) {
  const allocations = Array.from({ length: 4_000 }, (_, index) => ({
    index,
    payload: "x".repeat(256),
  }));
  globalThis.gc();
  void allocations;
  await wait(10);
}

const snapshot = benchmark.snapshot();
benchmark.stop();
process.stdout.write(JSON.stringify(snapshot.garbageCollection));
