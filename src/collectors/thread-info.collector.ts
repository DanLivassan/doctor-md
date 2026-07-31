import * as workerThreads from "node:worker_threads";
import type { ProcessBenchmarkSnapshot, ThreadInfo } from "../benchmark/benchmark-snapshot.js";
import type { BenchmarkCollector } from "./collector.js";

export class ThreadInfoCollector implements BenchmarkCollector<ThreadInfo> {
  readonly name = "thread";

  collect(): ThreadInfo {
    const threadName = (workerThreads as typeof workerThreads & { threadName?: string }).threadName;
    return {
      isMainThread: workerThreads.isMainThread,
      threadId: workerThreads.threadId,
      ...(threadName ? { name: threadName } : {}),
    };
  }
}

/** Sends a serializable snapshot from a Worker to its parent thread. */
export function sendSnapshotToParentPort(snapshot: ProcessBenchmarkSnapshot): boolean {
  if (workerThreads.parentPort === null) return false;
  workerThreads.parentPort.postMessage(snapshot);
  return true;
}
