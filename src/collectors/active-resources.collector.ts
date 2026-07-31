import type { BenchmarkCollector } from "./collector.js";

export interface ActiveResourcesMetrics {
  activeResources: number;
  resourcesByType: Record<string, number>;
  activeHandles?: number;
  activeRequests?: number;
  handlesByType?: Record<string, number>;
  requestsByType?: Record<string, number>;
}

type InternalProcess = typeof process & {
  _getActiveHandles?: () => unknown[];
  _getActiveRequests?: () => unknown[];
};

const groupStrings = (values: string[]): Record<string, number> => {
  const result: Record<string, number> = {};
  for (const value of values) result[value] = (result[value] ?? 0) + 1;
  return result;
};

const valueType = (value: unknown): string => {
  if (value === null) return "null";
  if (typeof value !== "object" && typeof value !== "function") return typeof value;
  const constructor = (value as { constructor?: { name?: unknown } }).constructor;
  return typeof constructor?.name === "string" && constructor.name.length > 0
    ? constructor.name
    : "Unknown";
};

const groupValues = (values: unknown[]): Record<string, number> =>
  groupStrings(values.map(valueType));

export class ActiveResourcesCollector implements BenchmarkCollector<ActiveResourcesMetrics> {
  readonly name = "activeResources";

  constructor(
    private readonly includeInternal: boolean,
    private readonly readResourceInfo = (): string[] => process.getActiveResourcesInfo(),
    private readonly internalProcess: InternalProcess = process,
  ) {}

  collect(): ActiveResourcesMetrics {
    const resources = this.readResourceInfo();
    const metrics: ActiveResourcesMetrics = {
      activeResources: resources.length,
      resourcesByType: groupStrings(resources),
    };
    if (!this.includeInternal) return metrics;

    const handles = this.internalProcess._getActiveHandles?.();
    const requests = this.internalProcess._getActiveRequests?.();
    if (handles) {
      metrics.activeHandles = handles.length;
      metrics.handlesByType = groupValues(handles);
    }
    if (requests) {
      metrics.activeRequests = requests.length;
      metrics.requestsByType = groupValues(requests);
    }
    return metrics;
  }
}
