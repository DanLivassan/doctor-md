import { describe, expect, it } from "vitest";
import { classifyThreadPoolPressure } from "../src/collectors/thread-pool-pressure.collector.js";

const thresholds = { moderateMs: 5, highMs: 20, criticalMs: 100 };

describe("thread pool pressure classification", () => {
  it.each([
    [0, "low"],
    [4.999, "low"],
    [5, "moderate"],
    [19.999, "moderate"],
    [20, "high"],
    [99.999, "high"],
    [100, "critical"],
  ] as const)("classifies %s ms as %s", (queueWaitMs, pressure) => {
    expect(classifyThreadPoolPressure(queueWaitMs, thresholds)).toBe(pressure);
  });
});
