import { randomUUID } from "node:crypto";
import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { ModelExecutor, ModelGateway } from "../models/model-gateway.js";
import type { ModelRequest, ModelResponse } from "../models/model-boundary.js";
import { ExecutionTracer } from "../observability/execution-tracer.js";
import { normalizeModelUsage, type UsageMeter, type UsageRecord } from "../observability/usage-meter.js";
import type { UsageOperation, UsageRole } from "../observability/price-catalog.js";
import { PriceCatalog } from "../observability/price-catalog.js";
import { ModelRouter } from "./model-router.js";

/** Correlation the gateway cannot infer for itself. */
export interface UsageContext {
  role?: UsageRole;
  operation?: UsageOperation;
  request_id?: string;
  session_id?: string;
  interaction_id?: string;
  execution_id?: string;
}

export interface ProductionModelGatewayOptions {
  models: ModelGateway;
  router: ModelRouter;
  tracer?: ExecutionTracer;
  maximum_retries?: number;
  /** Caps how long a provider's advised wait may park an execution. */
  maximum_retry_delay_ms?: number;
  maximum_cost?: number;
  /** Records one normalized record per physical attempt. Also supplies the price catalog used for budget decisions. */
  meter?: UsageMeter & { catalog?: PriceCatalog };
  usage_context?: UsageContext;
}

export class ProductionModelGateway implements ModelExecutor {
  private readonly tracer: ExecutionTracer;
  private readonly maximumRetries: number;
  private readonly maximumRetryDelayMs: number;

  public constructor(private readonly options: ProductionModelGatewayOptions) {
    this.tracer = options.tracer ?? new ExecutionTracer();
    this.maximumRetries = options.maximum_retries ?? 1;
    this.maximumRetryDelayMs = options.maximum_retry_delay_ms ?? 10_000;
  }

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    let lastError: unknown;
    // One logical call spans every provider and retry attempt below, so a retry stays
    // attributable to the request that caused it while remaining separately billable.
    const callId = `call_${randomUUID()}`;
    for (const providerId of this.options.router.providersFor(request)) {
      for (let attempt = 0; attempt <= this.maximumRetries; attempt++) {
        const started = Date.now();
        const occurredAt = new Date().toISOString();
        try {
          this.assertPriceKnown(providerId, request.model, occurredAt);
          const response = await this.options.models.generate({ ...request, provider_id: providerId }, signal);
          const cost = this.costOf(providerId, request, response, occurredAt);
          this.meter(callId, providerId, request, occurredAt, attempt, "completed", Date.now() - started, response);
          if (this.options.maximum_cost !== undefined && cost > this.options.maximum_cost) {
            throw new IntelligenceRuntimeError("MODEL_BUDGET_EXCEEDED", "Model cost exceeds the configured budget.", false, { maximum_cost: this.options.maximum_cost, estimated_cost: cost });
          }
          this.tracer.record({ provider_id: providerId, model: request.model, outcome: "completed", duration_ms: Date.now() - started });
          return response;
        } catch (cause) {
          const runtimeError = cause instanceof IntelligenceRuntimeError ? cause : undefined;
          // A budget rejection is a decision about an already-metered response, not a
          // provider failure to retry around.
          if (runtimeError?.code === "MODEL_BUDGET_EXCEEDED") throw cause;
          const retryable = runtimeError?.retryable === true;
          this.tracer.record({ provider_id: providerId, model: request.model, outcome: "failed", duration_ms: Date.now() - started, retryable });
          this.meter(callId, providerId, request, occurredAt, attempt, this.outcomeOf(runtimeError, signal), Date.now() - started, undefined, runtimeError?.code);
          lastError = cause;
          if (!retryable || attempt === this.maximumRetries) break;
          // Retrying a rate limit immediately just spends the next attempt on the same
          // refusal. Honour the provider's own wait when it gives one.
          await this.waitBeforeRetry(runtimeError, attempt, signal);
        }
      }
    }
    throw lastError instanceof Error ? lastError : new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Model provider failed.", true);
  }

  /** Bounded so a provider cannot park an execution indefinitely by naming a long delay. */
  private async waitBeforeRetry(error: IntelligenceRuntimeError | undefined, attempt: number, signal?: AbortSignal): Promise<void> {
    const advised = error?.context?.retry_after_ms;
    const suggested = typeof advised === "number" && Number.isFinite(advised) ? advised : 250 * 2 ** attempt;
    const delay = Math.min(Math.max(suggested, 0), this.maximumRetryDelayMs);
    // An already-aborted signal never emits `abort` again, so the listener below would
    // never fire and the execution would sit out the whole delay after being cancelled.
    if (delay <= 0 || signal?.aborted) return;
    await new Promise<void>((resolve) => {
      const timer = setTimeout(finish, delay);
      function finish(): void { clearTimeout(timer); signal?.removeEventListener("abort", finish); resolve(); }
      signal?.addEventListener("abort", finish, { once: true });
    });
  }

  private outcomeOf(error: IntelligenceRuntimeError | undefined, signal?: AbortSignal): UsageRecord["outcome"] {
    if (signal?.aborted || error?.code === "EXECUTION_CANCELLED") return "cancelled";
    if (error?.code === "EXECUTION_DEADLINE_EXCEEDED") return "timeout";
    return "failed";
  }

  /**
   * Fail-closed on unpriceable spend. Only enforced when a ceiling is actually configured:
   * without a budget there is nothing for an unknown price to breach.
   */
  private assertPriceKnown(providerId: string, model: string, at: string): void {
    const catalog = this.options.meter?.catalog;
    if (!catalog || this.options.maximum_cost === undefined) return;
    const decision = catalog.authorize({ provider_id: providerId, model, at, dimensions: {} });
    if (!decision.allowed) {
      throw new IntelligenceRuntimeError("MODEL_BUDGET_EXCEEDED", "No price is known for this model and the unknown-cost policy blocks the call.", false, { provider_id: providerId, model, unknown_cost_policy: decision.policy });
    }
  }

  private costOf(providerId: string, request: ModelRequest, response: ModelResponse, at: string): number {
    const reported = response.usage?.estimated_cost;
    if (reported !== undefined) return reported;
    const catalog = this.options.meter?.catalog;
    if (!catalog) return 0;
    const { dimensions } = normalizeModelUsage(response.usage);
    return catalog.estimate({ provider_id: providerId, model: request.model, at, dimensions }).total_cost ?? 0;
  }

  private meter(callId: string, providerId: string, request: ModelRequest, occurredAt: string, attempt: number, outcome: UsageRecord["outcome"], latencyMs: number, response?: ModelResponse, errorCode?: string): void {
    const meter = this.options.meter;
    if (!meter) return;
    const { dimensions, usage_source } = normalizeModelUsage(response?.usage);
    const context = this.options.usage_context ?? {};
    meter.record({
      schema: "usage.record.v1",
      record_id: `usage_${randomUUID()}`,
      occurred_at: occurredAt,
      ...(context.request_id ? { request_id: context.request_id } : {}),
      ...(context.session_id ? { session_id: context.session_id } : {}),
      ...(context.interaction_id ? { interaction_id: context.interaction_id } : {}),
      ...(context.execution_id ? { execution_id: context.execution_id } : {}),
      call_id: callId,
      attempt: attempt + 1,
      provider_id: providerId,
      model: request.model,
      operation: context.operation ?? "chat",
      role: context.role ?? "other",
      outcome,
      dimensions,
      model_calls: 1,
      // Tool calls are counted once, by the action loop that runs them. Counting them
      // here as well would double them at the two boundaries.
      tool_calls: 0,
      retry_count: attempt,
      latency_ms: latencyMs,
      ...(errorCode ? { error_code: errorCode } : {}),
      usage_source,
      redacted: true,
    });
  }
}
