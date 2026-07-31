export interface BenchmarkCollector<T> {
  readonly name: string;
  start?(): void;
  collect(): T;
  reset?(): void;
  stop?(): void;
}
