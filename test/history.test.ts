import { describe, expect, it } from "vitest";
import { BenchmarkHistory } from "../src/index.js";

describe("BenchmarkHistory", () => {
  it("keeps only the newest entries in chronological order", () => {
    const history = new BenchmarkHistory<number>(2);
    history.add(1);
    history.add(2);
    history.add(3);
    expect(history.values()).toEqual([2, 3]);
  });

  it("can be disabled and returns a safe array copy", () => {
    const disabled = new BenchmarkHistory<number>(0);
    disabled.add(1);
    expect(disabled.values()).toEqual([]);

    const history = new BenchmarkHistory<number>(1);
    history.add(4);
    const copy = history.values();
    copy.length = 0;
    expect(history.values()).toEqual([4]);
  });
});
