import { randomUUID } from "node:crypto";
import type {
  ExecutionId, ExecutionRecord, IntelligenceRequest, IntelligenceResult, RuntimeCapabilities,
  RuntimeHealth, RuntimeLifecycleState, Usage,
} from "../contracts/intelligence.js";
import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import { IntelligenceEventBus } from "../events/intelligence-events.js";
import { DeterministicExecutor } from "./deterministic-executor.js";
import type { ActionRuntime } from "../agent/action-runtime.js";

interface ActiveExecution {
  record: ExecutionRecord;
  controller: AbortController;
  resolve: (result: IntelligenceResult) => void;
  reject: (error: IntelligenceRuntimeError) => void;
}

export interface IntelligenceRuntimeOptions {
  action?: ActionRuntime;
}

const now = (): string => new Date().toISOString();
const copy = (record: ExecutionRecord): ExecutionRecord => ({ ...record, usage: record.usage ? { ...record.usage } : undefined });

export class IntelligenceRuntime {
  public readonly events = new IntelligenceEventBus();
  private readonly executor = new DeterministicExecutor();
  private readonly executions = new Map<ExecutionId, ActiveExecution>();
  private lifecycle: RuntimeLifecycleState = "created";

  public constructor(private readonly options: IntelligenceRuntimeOptions = {}) {}

  public lifecycleState(): RuntimeLifecycleState { return this.lifecycle; }

  public async start(): Promise<void> {
    if (this.lifecycle === "running") return;
    if (this.lifecycle !== "created" && this.lifecycle !== "stopped") {
      throw new IntelligenceRuntimeError("INVALID_STATE", `Cannot start from ${this.lifecycle}.`, false);
    }
    this.lifecycle = "starting";
    this.lifecycle = "running";
  }

  public async stop(): Promise<void> {
    if (this.lifecycle === "stopped") return;
    if (this.lifecycle !== "running") {
      throw new IntelligenceRuntimeError("INVALID_STATE", `Cannot stop from ${this.lifecycle}.`, false);
    }
    this.lifecycle = "stopping";
    await Promise.all(this.activeExecutionIds().map((executionId) => this.cancel(executionId)));
    this.lifecycle = "stopped";
  }

  public async execute(request: IntelligenceRequest): Promise<IntelligenceResult> {
    this.assertRunning();
    this.validate(request);
    this.events.emit({ type: "intelligence.request.received", request_id: request.request_id, occurred_at: now() });
    const executionId = `exec_${randomUUID()}`;
    const record: ExecutionRecord = { request_id: request.request_id, execution_id: executionId, status: "created", created_at: now() };
    const controller = new AbortController();
    const promise = new Promise<IntelligenceResult>((resolve, reject) => {
      this.executions.set(executionId, { record, controller, resolve, reject });
    });
    this.events.emit({ type: "intelligence.execution.created", execution: copy(record), occurred_at: now() });
    void this.run(executionId, request);
    return promise;
  }

  public async cancel(executionId: ExecutionId): Promise<void> {
    const active = this.executions.get(executionId);
    if (!active) throw new IntelligenceRuntimeError("EXECUTION_NOT_FOUND", "Execution was not found.", false, { execution_id: executionId });
    if (active.record.status !== "running" && active.record.status !== "created") return;
    active.record.status = "cancelled";
    active.record.finished_at = now();
    active.controller.abort();
    this.events.emit({ type: "intelligence.execution.cancelled", execution: copy(active.record), occurred_at: now() });
    active.reject(new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false, { execution_id: executionId }));
  }

  public execution(executionId: ExecutionId): ExecutionRecord | undefined {
    const active = this.executions.get(executionId);
    return active ? copy(active.record) : undefined;
  }

  public activeExecutionIds(): ExecutionId[] {
    return [...this.executions.values()].filter(({ record }) => record.status === "created" || record.status === "running").map(({ record }) => record.execution_id);
  }

  public health(): RuntimeHealth {
    const healthy = this.lifecycle === "running";
    return { state: healthy ? "healthy" : "degraded", components: { runtime: healthy ? "healthy" : "degraded" } };
  }

  public capabilities(): RuntimeCapabilities {
    const actionEnabled = this.options.action !== undefined;
    return { runtime: true, models: actionEnabled, tools: actionEnabled, memory: false, agentic_execution: actionEnabled };
  }

  private async run(executionId: ExecutionId, request: IntelligenceRequest): Promise<void> {
    const active = this.executions.get(executionId);
    if (!active) return;
    active.record.status = "running";
    active.record.started_at = now();
    this.events.emit({ type: "intelligence.execution.started", execution: copy(active.record), occurred_at: now() });
    try {
      const actionResult = this.options.action ? await this.options.action.execute(request, active.controller.signal) : undefined;
      const outputs = actionResult ? [actionResult.output] : await this.executor.execute(request, active.controller.signal);
      if (active.record.status !== "running") return;
      active.record.status = "completed";
      active.record.finished_at = now();
      const usage: Usage = {
        duration_ms: Date.parse(active.record.finished_at) - Date.parse(active.record.started_at),
        ...(actionResult ? { model_calls: actionResult.iterations, tool_calls: actionResult.tool_calls } : {}),
      };
      active.record.usage = usage;
      this.events.emit({ type: "intelligence.execution.completed", execution: copy(active.record), occurred_at: now() });
      active.resolve({ request_id: request.request_id, execution_id: executionId, status: "completed", outputs, usage });
    } catch (cause) {
      if (active.record.status !== "running") return;
      active.record.status = "failed";
      active.record.finished_at = now();
      this.events.emit({ type: "intelligence.execution.failed", execution: copy(active.record), occurred_at: now() });
      active.reject(cause instanceof IntelligenceRuntimeError ? cause : new IntelligenceRuntimeError("INTERNAL_ERROR", "Execution failed unexpectedly.", false));
    }
  }

  private assertRunning(): void {
    if (this.lifecycle !== "running") throw new IntelligenceRuntimeError("INVALID_STATE", "Runtime is not running.", false);
  }

  private validate(request: IntelligenceRequest): void {
    const input = request?.input;
    const invalid = !request?.request_id || !input ||
      (input.type === "text" && !input.text.trim()) ||
      (input.type === "structured" && (!input.value || Array.isArray(input.value))) ||
      (input.type === "event" && !input.name.trim()) ||
      !["text", "structured", "event"].includes(input.type) ||
      (request.execution?.delay_ms !== undefined && (!Number.isFinite(request.execution.delay_ms) || request.execution.delay_ms < 0));
    if (invalid) throw new IntelligenceRuntimeError("INVALID_REQUEST", "Request does not match the Intelligence Request contract.", false);
  }
}
