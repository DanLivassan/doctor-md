export class DuplicateCollectorError extends Error {
  constructor(readonly collector: string) {
    super(`A collector named "${collector}" is already registered or reserved`);
    this.name = "DuplicateCollectorError";
  }
}
