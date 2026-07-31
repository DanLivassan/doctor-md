import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, resolveOptions } from "../src/index.js";

describe("benchmark options", () => {
  it("applies defaults without sharing a mutable object", () => {
    const options = resolveOptions();
    expect(options).toMatchObject(DEFAULT_OPTIONS);
    expect(options).not.toBe(DEFAULT_OPTIONS);
    expect(options).toMatchObject({
      collectGarbageCollection: true,
      collectResourceUsage: true,
      collectActiveResources: true,
      collectInternalActiveResources: false,
      customCollectorTimeoutMs: 1_000,
      errorPolicy: "continue",
      overlappingCollectionPolicy: "skip",
      diagnostics: { enabled: true },
    });
  });

  it("rejects unsafe intervals unless explicitly allowed", () => {
    expect(() => resolveOptions({ intervalMs: 999 })).toThrow(/intervalMs/);
    expect(resolveOptions({ intervalMs: 25, allowUnsafeInterval: true }).intervalMs).toBe(25);
  });

  it.each([
    [{ historySize: -1 }, "historySize"],
    [{ historySize: 1.5 }, "historySize"],
    [{ eventLoopDelayResolutionMs: 0 }, "eventLoopDelayResolutionMs"],
    [{ customCollectorTimeoutMs: -1 }, "customCollectorTimeoutMs"],
  ])("validates numeric options", (input, name) => {
    expect(() => resolveOptions(input)).toThrow(name);
  });

  it("merges and validates diagnostic thresholds", () => {
    expect(resolveOptions({
      diagnostics: { thresholds: { cpuWarningPercent: 70 } },
    }).diagnostics.thresholds).toMatchObject({
      cpuWarningPercent: 70,
      cpuCriticalPercent: 150,
    });
    expect(() => resolveOptions({
      diagnostics: {
        thresholds: { cpuWarningPercent: 200, cpuCriticalPercent: 100 },
      },
    })).toThrow(/cpuCriticalPercent/);
  });

  it("validates robustness policies", () => {
    expect(() => resolveOptions({ errorPolicy: "invalid" as "continue" })).toThrow(/errorPolicy/);
    expect(() => resolveOptions({
      overlappingCollectionPolicy: "queue-one" as "skip",
    })).toThrow(/overlappingCollectionPolicy/);
  });
});
