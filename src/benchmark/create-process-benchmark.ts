import type { ProcessBenchmarkOptions } from "./benchmark-options.js";
import { ProcessBenchmark } from "./process-benchmark.js";

export const createProcessBenchmark = (
  options: ProcessBenchmarkOptions = {},
): ProcessBenchmark => new ProcessBenchmark(options);
