import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";
import type { ModelExecutor, ModelGateway } from "../models/model-gateway.js";
import type { ModelRequest, ModelResponse } from "../models/model-boundary.js";
import { ExecutionTracer } from "../observability/execution-tracer.js";
import { ModelRouter } from "./model-router.js";

export interface ProductionModelGatewayOptions {
  models: ModelGateway;
  router: ModelRouter;
  tracer?: ExecutionTracer;
  maximum_retries?: number;
  maximum_cost?: number;
}

export class ProductionModelGateway implements ModelExecutor {
  private readonly tracer: ExecutionTracer;
  private readonly maximumRetries: number;

  public constructor(private readonly options: ProductionModelGatewayOptions) {
    this.tracer = options.tracer ?? new ExecutionTracer();
    this.maximumRetries = options.maximum_retries ?? 1;
  }

  public async generate(request: ModelRequest, signal?: AbortSignal): Promise<ModelResponse> {
    let lastError: unknown;
    for (const providerId of this.options.router.providersFor(request)) {
      for (let attempt = 0; attempt <= this.maximumRetries; attempt++) {
        const started = Date.now();
        try {
          const response = await this.options.models.generate({ ...request, provider_id: providerId }, signal);
          const cost = response.usage?.estimated_cost ?? 0;
          if (this.options.maximum_cost !== undefined && cost > this.options.maximum_cost) {
            throw new IntelligenceRuntimeError("MODEL_BUDGET_EXCEEDED", "Model cost exceeds the configured budget.", false, { maximum_cost: this.options.maximum_cost, estimated_cost: cost });
          }
          this.tracer.record({ provider_id: providerId, model: request.model, outcome: "completed", duration_ms: Date.now() - started });
          return response;
        } catch (cause) {
          const retryable = cause instanceof IntelligenceRuntimeError && cause.retryable;
          this.tracer.record({ provider_id: providerId, model: request.model, outcome: "failed", duration_ms: Date.now() - started, retryable });
          lastError = cause;
          if (!retryable || attempt === this.maximumRetries) break;
        }
      }
    }
    throw lastError instanceof Error ? lastError : new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "Model provider failed.", true);
  }
}
