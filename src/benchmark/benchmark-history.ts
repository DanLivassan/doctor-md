export class BenchmarkHistory<T> {
  readonly #capacity: number;
  #values: T[] = [];
  #nextIndex = 0;

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 0) {
      throw new TypeError("History capacity must be a non-negative integer");
    }
    this.#capacity = capacity;
  }

  add(value: T): void {
    if (this.#capacity === 0) return;
    if (this.#values.length < this.#capacity) {
      this.#values.push(value);
      return;
    }
    this.#values[this.#nextIndex] = value;
    this.#nextIndex = (this.#nextIndex + 1) % this.#capacity;
  }

  values(): T[] {
    if (this.#values.length < this.#capacity || this.#nextIndex === 0) {
      return [...this.#values];
    }
    return [
      ...this.#values.slice(this.#nextIndex),
      ...this.#values.slice(0, this.#nextIndex),
    ];
  }

  clear(): void {
    this.#values = [];
    this.#nextIndex = 0;
  }
}
