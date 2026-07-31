import { randomUUID } from "node:crypto";
import os from "node:os";
import { isMainThread, threadId } from "node:worker_threads";
import { CpuCollector } from "../collectors/cpu.collector.js";
import { EventLoopDelayCollector } from "../collectors/event-loop-delay.collector.js";
import { EventLoopUtilizationCollector } from "../collectors/event-loop-utilization.collector.js";
import { MemoryCollector } from "../collectors/memory.collector.js";
import { BenchmarkHistory } from "./benchmark-history.js";
import type { ProcessBenchmarkOptions, ResolvedProcessBenchmarkOptions } from "./benchmark-options.js";
import { resolveOptions } from "./benchmark-options.js";
import type { ProcessBenchmarkSnapshot, ProcessInfo } from "./benchmark-snapshot.js";

export type SnapshotListener = (snapshot: ProcessBenchmarkSnapshot) => void;

function collectProcessInfo(timestamp: string): ProcessInfo {
  return {
    pid: process.pid,
    ppid: process.ppid,
    nodeVersion: process.version,
    v8Version: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    processUptimeSeconds: process.uptime(),
    systemUptimeSeconds: os.uptime(),
    timestamp,
    hostname: os.hostname(),
    processTitle: process.title,
    availableParallelism: os.availableParallelism(),
  };
}

export class ProcessBenchmark {
  readonly options: Readonly<ResolvedProcessBenchmarkOptions>;
  readonly #memory = new MemoryCollector();
  readonly #cpu = new CpuCollector();
  readonly #eventLoopDelay: EventLoopDelayCollector;
  readonly #eventLoopUtilization = new EventLoopUtilizationCollector();
  readonly #history: BenchmarkHistory<ProcessBenchmarkSnapshot>;
  readonly #listeners = new Set<SnapshotListener>();
  #timer?: NodeJS.Timeout;
  #running = false;
  #snapshotCount = 0;
  #previousSnapshotTime?: bigint;

  constructor(options: ProcessBenchmarkOptions = {}) {
    this.options = Object.freeze(resolveOptions(options));
    this.#eventLoopDelay = new EventLoopDelayCollector(
      this.options.eventLoopDelayResolutionMs,
      this.options.resetEventLoopDelayOnSnapshot,
    );
    this.#history = new BenchmarkHistory(this.options.historySize);
  }

  get isRunning(): boolean {
    return this.#running;
  }

  start(): this {
    if (this.#running) return this;
    this.#running = true;
    this.#cpu.start();
    this.#eventLoopUtilization.start();
    this.#eventLoopDelay.start();
    this.#previousSnapshotTime = process.hrtime.bigint();
    this.#timer = setInterval(() => this.snapshot(), this.options.intervalMs);
    if (this.options.unrefTimers) this.#timer.unref();
    return this;
  }

  stop(): this {
    if (!this.#running) return this;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#eventLoopDelay.stop();
    this.#running = false;
    return this;
  }

  snapshot(): ProcessBenchmarkSnapshot {
    const timestamp = new Date().toISOString();
    const now = process.hrtime.bigint();
    const intervalMs = this.#previousSnapshotTime === undefined
      ? undefined
      : Number(now - this.#previousSnapshotTime) / 1_000_000;
    this.#previousSnapshotTime = now;

    const snapshot: ProcessBenchmarkSnapshot = {
      id: randomUUID(),
      timestamp,
      ...(intervalMs === undefined ? {} : { intervalMs }),
      ...((this.#snapshotCount === 0 || this.options.includeProcessInfoInEverySnapshot)
        ? { process: collectProcessInfo(timestamp) }
        : {}),
      thread: { isMainThread, threadId },
      memory: this.#memory.collect(),
      cpu: this.#cpu.collect(),
      eventLoopDelay: this.#eventLoopDelay.collect(),
      eventLoopUtilization: this.#eventLoopUtilization.collect(),
      alerts: [],
    };
    this.#snapshotCount += 1;
    // Callers and listeners may mutate their snapshot; history remains isolated.
    this.#history.add(structuredClone(snapshot));
    for (const listener of this.#listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        this.options.logger?.error?.("Snapshot listener failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return snapshot;
  }

  onSnapshot(listener: SnapshotListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  getHistory(): ProcessBenchmarkSnapshot[] {
    return structuredClone(this.#history.values());
  }
}
