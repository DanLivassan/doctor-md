import { performance, type EventLoopUtilization } from "node:perf_hooks";
import type { BenchmarkCollector } from "./collector.js";

export interface EventLoopUtilizationMetrics {
  activeMilliseconds: number;
  idleMilliseconds: number;
  utilization: number;
  utilizationPercent: number;
}

type EluReader = () => EventLoopUtilization;

export class EventLoopUtilizationCollector
  implements BenchmarkCollector<EventLoopUtilizationMetrics>
{
  readonly name = "eventLoopUtilization";
  #previous?: EventLoopUtilization;

  constructor(
    private readonly readUtilization: EluReader = () => performance.eventLoopUtilization(),
  ) {}

  start(): void {
    this.#previous = this.readUtilization();
  }

  collect(): EventLoopUtilizationMetrics {
    const current = this.readUtilization();
    const active = this.#previous ? Math.max(0, current.active - this.#previous.active) : current.active;
    const idle = this.#previous ? Math.max(0, current.idle - this.#previous.idle) : current.idle;
    const elapsed = active + idle;
    const utilization = elapsed > 0 ? active / elapsed : 0;
    this.#previous = current;
    return {
      activeMilliseconds: active,
      idleMilliseconds: idle,
      utilization,
      utilizationPercent: utilization * 100,
    };
  }
}
