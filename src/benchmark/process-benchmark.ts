import { randomUUID } from "node:crypto";
import os from "node:os";
import { ActiveResourcesCollector } from "../collectors/active-resources.collector.js";
import { CpuCollector } from "../collectors/cpu.collector.js";
import { EventLoopDelayCollector } from "../collectors/event-loop-delay.collector.js";
import { EventLoopUtilizationCollector } from "../collectors/event-loop-utilization.collector.js";
import { GarbageCollectionCollector } from "../collectors/garbage-collection.collector.js";
import { MemoryCollector } from "../collectors/memory.collector.js";
import { ResourceUsageCollector } from "../collectors/resource-usage.collector.js";
import { ThreadInfoCollector } from "../collectors/thread-info.collector.js";
import { DiagnosticsEngine } from "../diagnostics/diagnostics-engine.js";
import {
  createBenchmarkHttpHandler,
  type BenchmarkHttpHandler,
  type HttpHandlerOptions,
} from "../exporters/http-handler.js";
import { exportJson } from "../exporters/json.exporter.js";
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
  readonly #garbageCollection?: GarbageCollectionCollector;
  readonly #resourceUsage?: ResourceUsageCollector;
  readonly #activeResources?: ActiveResourcesCollector;
  readonly #thread = new ThreadInfoCollector();
  readonly #diagnostics?: DiagnosticsEngine;
  readonly #history: BenchmarkHistory<ProcessBenchmarkSnapshot>;
  readonly #listeners = new Set<SnapshotListener>();
  #timer?: NodeJS.Timeout;
  #running = false;
  #snapshotCount = 0;
  #previousSnapshotTime?: bigint;
  #latestSnapshot?: ProcessBenchmarkSnapshot;

  constructor(options: ProcessBenchmarkOptions = {}) {
    this.options = Object.freeze(resolveOptions(options));
    this.#eventLoopDelay = new EventLoopDelayCollector(
      this.options.eventLoopDelayResolutionMs,
      this.options.resetEventLoopDelayOnSnapshot,
    );
    this.#history = new BenchmarkHistory(this.options.historySize);
    if (this.options.collectGarbageCollection) {
      this.#garbageCollection = new GarbageCollectionCollector();
    }
    if (this.options.collectResourceUsage) {
      this.#resourceUsage = new ResourceUsageCollector();
    }
    if (this.options.collectActiveResources) {
      this.#activeResources = new ActiveResourcesCollector(
        this.options.collectInternalActiveResources,
      );
    }
    if (this.options.diagnostics.enabled) {
      this.#diagnostics = new DiagnosticsEngine(this.options.diagnostics.thresholds);
    }
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
    this.#garbageCollection?.start();
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
    this.#garbageCollection?.stop();
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
      thread: this.#thread.collect(),
      memory: this.#memory.collect(),
      cpu: this.#cpu.collect(),
      eventLoopDelay: this.#eventLoopDelay.collect(),
      eventLoopUtilization: this.#eventLoopUtilization.collect(),
      ...(this.#garbageCollection
        ? { garbageCollection: this.#garbageCollection.collect() }
        : {}),
      ...(this.#activeResources
        ? { activeResources: this.#activeResources.collect() }
        : {}),
      ...(this.#resourceUsage ? { resourceUsage: this.#resourceUsage.collect() } : {}),
      alerts: [],
    };
    snapshot.alerts = this.#diagnostics?.evaluate(snapshot) ?? [];
    this.#snapshotCount += 1;
    // Callers and listeners may mutate their snapshot; history remains isolated.
    this.#latestSnapshot = structuredClone(snapshot);
    this.#history.add(this.#latestSnapshot);
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

  getLatestSnapshot(): ProcessBenchmarkSnapshot | undefined {
    return this.#latestSnapshot ? structuredClone(this.#latestSnapshot) : undefined;
  }

  exportJson(options: { includeHistory?: boolean; pretty?: boolean } = {}): string {
    const value = options.includeHistory
      ? this.getHistory()
      : this.#latestSnapshot ?? this.snapshot();
    return exportJson(value, options);
  }

  createHttpHandler(options: HttpHandlerOptions = {}): BenchmarkHttpHandler {
    return createBenchmarkHttpHandler(this, options);
  }
}
