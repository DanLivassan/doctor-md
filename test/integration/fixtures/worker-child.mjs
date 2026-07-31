import { parentPort } from "node:worker_threads";
import {
  createProcessBenchmark,
  sendSnapshotToParentPort,
} from "../../../dist/index.js";

const snapshot = createProcessBenchmark({
  collectGarbageCollection: false,
  diagnostics: { enabled: false },
}).snapshot();
if (!sendSnapshotToParentPort(snapshot)) process.exit(2);
parentPort?.close();
