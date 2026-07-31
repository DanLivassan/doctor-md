export interface JsonExportOptions {
  pretty?: boolean;
}

export function exportJson(value: unknown, options: JsonExportOptions = {}): string {
  return JSON.stringify(value, null, options.pretty ? 2 : undefined);
}
