import { pbkdf2 } from "node:crypto";
import { promisify } from "node:util";
import { createProcessBenchmark } from "../../../dist/index.js";

const pbkdf2Async = promisify(pbkdf2);
const benchmark = createProcessBenchmark({
  intervalMs: 5_000,
  threadPool: { enabled: true, intervalMs: 100 },
}).start();

const tasks = Array.from({ length: 12 }, (_, index) =>
  pbkdf2Async(`password-${index}`, "node-md-integration", 180_000, 32, "sha256"));

await Promise.all(tasks);
await new Promise((resolve) => setTimeout(resolve, 50));
const snapshot = benchmark.snapshot();
benchmark.stop();
process.stdout.write(`${JSON.stringify(snapshot.threadPool)}\n`);
