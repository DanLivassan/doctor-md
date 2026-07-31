import { performance } from "node:perf_hooks";
import { describe, expect, it } from "vitest";
import { createProcessBenchmark } from "../src/index.js";

describe("snapshot overhead guard", () => {
  it("keeps synchronous collection bounded and history capped", () => {
    const benchmark = createProcessBenchmark({
      historySize: 10,
      collectGarbageCollection: false,
      collectResourceUsage: false,
      collectActiveResources: false,
      diagnostics: { enabled: false },
    });
    const iterations = 1_000;
    const startedAt = performance.now();

    for (let index = 0; index < iterations; index += 1) benchmark.snapshot();

    const averageMilliseconds = (performance.now() - startedAt) / iterations;
    expect(averageMilliseconds).toBeLessThan(2);
    expect(benchmark.getHistory()).toHaveLength(10);
  });
});
