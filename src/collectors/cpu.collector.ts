import type { BenchmarkCollector } from "./collector.js";

export interface CpuMetrics {
  userMicroseconds: number;
  systemMicroseconds: number;
  totalMicroseconds: number;
  intervalUserMicroseconds?: number;
  intervalSystemMicroseconds?: number;
  intervalTotalMicroseconds?: number;
  usagePercent?: number;
  peakUsagePercent: number;
}

export function calculateCpuUsagePercent(cpuMicroseconds: number, elapsedNanoseconds: bigint): number {
  if (elapsedNanoseconds <= 0n) return 0;
  return (cpuMicroseconds * 100_000) / Number(elapsedNanoseconds);
}

export class CpuCollector implements BenchmarkCollector<CpuMetrics> {
  readonly name = "cpu";
  #previousUsage?: NodeJS.CpuUsage;
  #previousTime?: bigint;
  #peakUsagePercent = 0;

  constructor(
    private readonly readCpuUsage = (): NodeJS.CpuUsage => process.cpuUsage(),
    private readonly readTime = (): bigint => process.hrtime.bigint(),
  ) {}

  start(): void {
    this.#previousUsage = this.readCpuUsage();
    this.#previousTime = this.readTime();
  }

  collect(): CpuMetrics {
    const usage = this.readCpuUsage();
    const now = this.readTime();
    const metrics: CpuMetrics = {
      userMicroseconds: usage.user,
      systemMicroseconds: usage.system,
      totalMicroseconds: usage.user + usage.system,
      peakUsagePercent: this.#peakUsagePercent,
    };

    if (this.#previousUsage && this.#previousTime !== undefined) {
      const intervalUser = Math.max(0, usage.user - this.#previousUsage.user);
      const intervalSystem = Math.max(0, usage.system - this.#previousUsage.system);
      const intervalTotal = intervalUser + intervalSystem;
      const percent = calculateCpuUsagePercent(intervalTotal, now - this.#previousTime);
      this.#peakUsagePercent = Math.max(this.#peakUsagePercent, percent);
      metrics.intervalUserMicroseconds = intervalUser;
      metrics.intervalSystemMicroseconds = intervalSystem;
      metrics.intervalTotalMicroseconds = intervalTotal;
      metrics.usagePercent = percent;
      metrics.peakUsagePercent = this.#peakUsagePercent;
    }
    this.#previousUsage = usage;
    this.#previousTime = now;
    return metrics;
  }
}
