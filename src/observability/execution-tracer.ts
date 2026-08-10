export interface ModelTraceRecord {
  provider_id: string;
  model: string;
  outcome: "completed" | "failed";
  duration_ms: number;
  retryable?: boolean;
}

export class ExecutionTracer {
  private readonly trace: ModelTraceRecord[] = [];

  public record(record: ModelTraceRecord): void { this.trace.push({ ...record }); }
  public records(): ModelTraceRecord[] { return this.trace.map((record) => ({ ...record })); }
}
