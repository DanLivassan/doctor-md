import type { ProcessBenchmarkSnapshot } from "../benchmark/benchmark-snapshot.js";

export interface JsonLogExporterOptions {
  write(line: string): void;
}

export interface JsonLogExporter {
  consume(snapshot: ProcessBenchmarkSnapshot): void;
}

export function createJsonLogExporter(options: JsonLogExporterOptions): JsonLogExporter {
  if (typeof options.write !== "function") {
    throw new TypeError("write must be a function");
  }
  return {
    consume(snapshot) {
      options.write(JSON.stringify(snapshot));
    },
  };
}
