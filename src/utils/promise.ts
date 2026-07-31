import { CollectorTimeoutError } from "../errors/collector-timeout.error.js";

export const isPromiseLike = <T>(value: T | Promise<T>): value is Promise<T> =>
  typeof value === "object"
  && value !== null
  && "then" in value
  && typeof value.then === "function";

export function withCollectorTimeout<T>(
  collector: string,
  value: T | Promise<T>,
  timeoutMs: number,
  unrefTimer: boolean,
): Promise<T> {
  if (!isPromiseLike(value) || timeoutMs === 0) return Promise.resolve(value);

  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new CollectorTimeoutError(collector, timeoutMs)),
      timeoutMs,
    );
    if (unrefTimer) timer.unref();
    value.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
