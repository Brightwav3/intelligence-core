import type { ExecutionId, ExecutionRecord, RequestId } from "../contracts/intelligence.js";

export type IntelligenceEvent =
  | { type: "intelligence.request.received"; request_id: RequestId; occurred_at: string }
  | { type: "intelligence.execution.created"; execution: ExecutionRecord; occurred_at: string }
  | { type: "intelligence.execution.started"; execution: ExecutionRecord; occurred_at: string }
  | { type: "intelligence.execution.completed"; execution: ExecutionRecord; occurred_at: string }
  | { type: "intelligence.execution.failed"; execution: ExecutionRecord; occurred_at: string }
  | { type: "intelligence.execution.cancelled"; execution: ExecutionRecord; occurred_at: string };

export type IntelligenceEventListener = (event: IntelligenceEvent) => void;

export class IntelligenceEventBus {
  private readonly listeners = new Set<IntelligenceEventListener>();

  public on(listener: IntelligenceEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public emit(event: IntelligenceEvent): void {
    for (const listener of this.listeners) listener(event);
  }
}
