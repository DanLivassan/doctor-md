import { describe, expect, it } from "vitest";
import { DEFAULT_OPTIONS, resolveOptions } from "../src/index.js";

describe("benchmark options", () => {
  it("applies defaults without sharing a mutable object", () => {
    const options = resolveOptions();
    expect(options).toMatchObject(DEFAULT_OPTIONS);
    expect(options).not.toBe(DEFAULT_OPTIONS);
  });

  it("rejects unsafe intervals unless explicitly allowed", () => {
    expect(() => resolveOptions({ intervalMs: 999 })).toThrow(/intervalMs/);
    expect(resolveOptions({ intervalMs: 25, allowUnsafeInterval: true }).intervalMs).toBe(25);
  });

  it.each([
    [{ historySize: -1 }, "historySize"],
    [{ historySize: 1.5 }, "historySize"],
    [{ eventLoopDelayResolutionMs: 0 }, "eventLoopDelayResolutionMs"],
  ])("validates numeric options", (input, name) => {
    expect(() => resolveOptions(input)).toThrow(name);
  });
});
