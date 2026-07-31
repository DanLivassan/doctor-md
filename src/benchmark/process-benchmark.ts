import { randomUUID } from "node:crypto";
import os from "node:os";
import { ActiveResourcesCollector } from "../collectors/active-resources.collector.js";
import type { BenchmarkCollector } from "../collectors/collector.js";
import { CpuCollector } from "../collectors/cpu.collector.js";
import { EventLoopDelayCollector } from "../collectors/event-loop-delay.collector.js";
import { EventLoopUtilizationCollector } from "../collectors/event-loop-utilization.collector.js";
import { GarbageCollectionCollector } from "../collectors/garbage-collection.collector.js";
import { MemoryCollector } from "../collectors/memory.collector.js";
import { ResourceUsageCollector } from "../collectors/resource-usage.collector.js";
import { ThreadInfoCollector } from "../collectors/thread-info.collector.js";
import { DiagnosticsEngine } from "../diagnostics/diagnostics-engine.js";
import { CollectorTimeoutError } from "../errors/collector-timeout.error.js";
import { DuplicateCollectorError } from "../errors/duplicate-collector.error.js";
import {
  createBenchmarkHttpHandler,
  type BenchmarkHttpHandler,
  type HttpHandlerOptions,
} from "../exporters/http-handler.js";
import { exportJson } from "../exporters/json.exporter.js";
import { isPromiseLike, withCollectorTimeout } from "../utils/promise.js";
import { BenchmarkHistory } from "./benchmark-history.js";
import type { ProcessBenchmarkOptions, ResolvedProcessBenchmarkOptions } from "./benchmark-options.js";
import { resolveOptions } from "./benchmark-options.js";
import type {
  CollectionError,
  ProcessBenchmarkSnapshot,
  ProcessInfo,
} from "./benchmark-snapshot.js";

export type SnapshotListener = (
  snapshot: ProcessBenchmarkSnapshot,
) => void | Promise<void>;

const RESERVED_COLLECTOR_NAMES = new Set([
  "process",
  "thread",
  "memory",
  "cpu",
  "eventLoopDelay",
  "eventLoopUtilization",
  "garbageCollection",
  "activeResources",
  "resourceUsage",
  "alerts",
  "collectionErrors",
  "custom",
]);

const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const assertJsonSerializable = (collector: string, value: unknown): void => {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    throw new TypeError(`Collector "${collector}" returned a non-serializable value`);
  }
  try {
    JSON.stringify(value);
  } catch (error) {
    throw new TypeError(
      `Collector "${collector}" returned a non-serializable value: ${errorMessage(error)}`,
      { cause: error },
    );
  }
};

type CustomCollectionResult =
  | { name: string; value: unknown }
  | { name: string; error: CollectionError };

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
  readonly #customCollectors = new Map<string, BenchmarkCollector<unknown>>();
  #timer?: NodeJS.Timeout;
  #running = false;
  #snapshotCount = 0;
  #previousSnapshotTime?: bigint;
  #latestSnapshot?: ProcessBenchmarkSnapshot;
  #periodicCollectionInProgress = false;
  #asyncCollectionQueue: Promise<void> = Promise.resolve();

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
    for (const collector of this.#customCollectors.values()) {
      this.#runLifecycleHook(collector, "start");
    }
    this.#previousSnapshotTime = process.hrtime.bigint();
    this.#timer = setInterval(() => {
      if (this.#customCollectors.size === 0) {
        this.snapshot();
        return;
      }
      void this.#collectPeriodicSnapshot();
    }, this.options.intervalMs);
    if (this.options.unrefTimers) this.#timer.unref();
    return this;
  }

  stop(): this {
    if (!this.#running) return this;
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = undefined;
    this.#eventLoopDelay.stop();
    this.#garbageCollection?.stop();
    for (const collector of this.#customCollectors.values()) {
      this.#runLifecycleHook(collector, "stop");
    }
    this.#running = false;
    return this;
  }

  snapshot(): ProcessBenchmarkSnapshot {
    const custom: Record<string, unknown> = {};
    const collectionErrors: CollectionError[] = [];
    for (const [name, collector] of this.#customCollectors) {
      try {
        const value = collector.collect();
        if (isPromiseLike(value)) {
          void value.catch((error: unknown) => {
            this.options.logger?.error?.("Asynchronous custom collector failed", {
              collector: name,
              error: errorMessage(error),
            });
          });
          const error = new TypeError(
            `Collector "${name}" is asynchronous; use snapshotAsync()`,
          );
          collectionErrors.push(this.#handleCollectionError(name, error));
          continue;
        }
        assertJsonSerializable(name, value);
        custom[name] = value;
      } catch (error) {
        collectionErrors.push(this.#handleCollectionError(name, error));
      }
    }
    return this.#createAndCommitSnapshot(custom, collectionErrors);
  }

  snapshotAsync(): Promise<ProcessBenchmarkSnapshot> {
    const collection = this.#asyncCollectionQueue.then(() => this.#collectAsyncSnapshot());
    this.#asyncCollectionQueue = collection.then(() => undefined, () => undefined);
    return collection;
  }

  registerCollector<T>(collector: BenchmarkCollector<T>): () => void {
    const name = collector.name;
    if (!/^[A-Za-z][A-Za-z0-9_.-]*$/.test(name)) {
      throw new TypeError("Collector name must start with a letter and contain only letters, numbers, dots, underscores, or hyphens");
    }
    if (RESERVED_COLLECTOR_NAMES.has(name) || this.#customCollectors.has(name)) {
      throw new DuplicateCollectorError(name);
    }
    this.#customCollectors.set(name, collector as BenchmarkCollector<unknown>);
    if (this.#running) this.#runLifecycleHook(collector, "start");

    let registered = true;
    return () => {
      if (!registered) return;
      registered = false;
      this.#customCollectors.delete(name);
      if (this.#running) this.#runLifecycleHook(collector, "stop");
    };
  }

  #createAndCommitSnapshot(
    custom: Record<string, unknown>,
    collectionErrors: CollectionError[],
  ): ProcessBenchmarkSnapshot {
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
      ...(Object.keys(custom).length > 0 ? { custom } : {}),
      alerts: [],
      collectionErrors,
    };
    snapshot.alerts = this.#diagnostics?.evaluate(snapshot) ?? [];
    this.#snapshotCount += 1;
    // Callers and listeners may mutate their snapshot; history remains isolated.
    this.#latestSnapshot = structuredClone(snapshot);
    this.#history.add(this.#latestSnapshot);
    for (const listener of this.#listeners) {
      try {
        const result = listener(snapshot);
        if (isPromiseLike(result)) {
          void result.catch((error: unknown) => this.#logListenerError(error));
        }
      } catch (error) {
        this.#logListenerError(error);
      }
    }
    return snapshot;
  }

  async #collectAsyncSnapshot(): Promise<ProcessBenchmarkSnapshot> {
    const results: CustomCollectionResult[] = await Promise.all(
      [...this.#customCollectors].map(async ([name, collector]) => {
        try {
          const value = await withCollectorTimeout(
            name,
            collector.collect(),
            this.options.customCollectorTimeoutMs,
            this.options.unrefTimers,
          );
          assertJsonSerializable(name, value);
          return { name, value };
        } catch (error) {
          return { name, error: this.#handleCollectionError(name, error) };
        }
      }),
    );
    const custom: Record<string, unknown> = {};
    const collectionErrors: CollectionError[] = [];
    for (const result of results) {
      if ("error" in result) collectionErrors.push(result.error);
      else custom[result.name] = result.value;
    }
    return this.#createAndCommitSnapshot(custom, collectionErrors);
  }

  async #collectPeriodicSnapshot(): Promise<void> {
    if (this.#periodicCollectionInProgress) {
      this.options.logger?.debug?.("Periodic snapshot skipped because collection is still running");
      return;
    }
    this.#periodicCollectionInProgress = true;
    try {
      await this.snapshotAsync();
    } catch (error) {
      this.options.logger?.error?.("Periodic snapshot failed", {
        error: errorMessage(error),
      });
    } finally {
      this.#periodicCollectionInProgress = false;
    }
  }

  #handleCollectionError(name: string, error: unknown): CollectionError {
    if (this.options.errorPolicy === "throw") {
      throw error instanceof Error ? error : new Error(String(error));
    }
    const collectionError: CollectionError = {
      collector: name,
      message: errorMessage(error),
      timestamp: new Date().toISOString(),
      ...(error instanceof CollectorTimeoutError ? { timedOut: true } : {}),
    };
    this.options.logger?.error?.("Custom collector failed", {
      collector: name,
      error: collectionError.message,
      timedOut: collectionError.timedOut ?? false,
    });
    return collectionError;
  }

  #runLifecycleHook(
    collector: BenchmarkCollector<unknown>,
    hook: "start" | "stop",
  ): void {
    try {
      const result = collector[hook]?.();
      if (result && isPromiseLike(result)) {
        void result.catch((error: unknown) => {
          this.options.logger?.error?.(`Custom collector ${hook} hook failed`, {
            collector: collector.name,
            error: errorMessage(error),
          });
        });
      }
    } catch (error) {
      if (this.options.errorPolicy === "throw") throw error;
      this.options.logger?.error?.(`Custom collector ${hook} hook failed`, {
        collector: collector.name,
        error: errorMessage(error),
      });
    }
  }

  #logListenerError(error: unknown): void {
    this.options.logger?.error?.("Snapshot listener failed", {
      error: errorMessage(error),
    });
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
