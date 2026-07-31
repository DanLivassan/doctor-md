import { Worker } from "node:worker_threads";

const worker = new Worker(new URL("./worker-child.mjs", import.meta.url));
worker.once("message", (snapshot) => {
  process.stdout.write(JSON.stringify(snapshot.thread));
});
worker.once("error", (error) => {
  process.stderr.write(error.stack ?? error.message);
  process.exitCode = 1;
});
