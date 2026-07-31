export interface BenchmarkCollector<T> {
  readonly name: string;
  start?(): void | Promise<void>;
  collect(): T | Promise<T>;
  reset?(): void;
  stop?(): void | Promise<void>;
}
