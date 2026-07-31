export class CollectorTimeoutError extends Error {
  constructor(
    readonly collector: string,
    readonly timeoutMs: number,
  ) {
    super(`Collector "${collector}" exceeded its ${timeoutMs} ms timeout`);
    this.name = "CollectorTimeoutError";
  }
}
