export type BenchmarkAlertSeverity = "info" | "warning" | "critical";

export interface BenchmarkAlert {
  code: string;
  severity: BenchmarkAlertSeverity;
  message: string;
  metric: string;
  value: number;
  threshold: number;
  timestamp: string;
}
