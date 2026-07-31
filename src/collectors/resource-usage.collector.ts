import type { BenchmarkCollector } from "./collector.js";

export interface ResourceUsageMetrics {
  userCpuTimeMicroseconds: number;
  systemCpuTimeMicroseconds: number;
  maxRssKilobytes: number;
  minorPageFaults: number;
  majorPageFaults: number;
  voluntaryContextSwitches: number;
  involuntaryContextSwitches: number;
  filesystemReads: number;
  filesystemWrites: number;
  ipcMessagesSent: number;
  ipcMessagesReceived: number;
}

export class ResourceUsageCollector implements BenchmarkCollector<ResourceUsageMetrics> {
  readonly name = "resourceUsage";

  constructor(
    private readonly readResourceUsage = (): NodeJS.ResourceUsage => process.resourceUsage(),
  ) {}

  collect(): ResourceUsageMetrics {
    const usage = this.readResourceUsage();
    return {
      userCpuTimeMicroseconds: usage.userCPUTime,
      systemCpuTimeMicroseconds: usage.systemCPUTime,
      maxRssKilobytes: usage.maxRSS,
      minorPageFaults: usage.minorPageFault,
      majorPageFaults: usage.majorPageFault,
      voluntaryContextSwitches: usage.voluntaryContextSwitches,
      involuntaryContextSwitches: usage.involuntaryContextSwitches,
      filesystemReads: usage.fsRead,
      filesystemWrites: usage.fsWrite,
      ipcMessagesSent: usage.ipcSent,
      ipcMessagesReceived: usage.ipcReceived,
    };
  }
}
