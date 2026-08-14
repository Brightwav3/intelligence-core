import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionTracer,
  FakeModelProvider,
  InMemoryUsageMeter,
  IntelligenceRuntimeError,
  ModelGateway,
  ModelRouter,
  PriceCatalog,
  ProductionModelGateway,
  type ModelPriceEntry,
} from "../../src/index.js";

const request = { provider_id: "primary", model: "model-1", messages: [{ role: "user" as const, content: "private prompt" }] };

test("falls back to the configured secondary provider after a retryable failure", async () => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ id: "secondary", responses: [{ type: "final", message: { role: "assistant", content: "fallback answer" } }] }));
  models.register({
    id: "primary",
    models: async () => [], capabilities: async () => ({ streaming: false, tool_calling: false, structured_output: false, vision: false }), health: async () => ({ state: "unhealthy" }),
    generate: async () => { throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "temporary", true); },
  });
  const tracer = new ExecutionTracer();
  const gateway = new ProductionModelGateway({ models, router: new ModelRouter({ default_provider_id: "primary", fallback_provider_ids: ["secondary"] }), tracer, maximum_retries: 0 });

  const result = await gateway.generate(request);

  assert.equal(result.provider_id, "secondary");
  assert.equal(result.type, "final");
  assert.deepEqual(tracer.records().map((record) => ({ provider_id: record.provider_id, outcome: record.outcome })), [
    { provider_id: "primary", outcome: "failed" },
    { provider_id: "secondary", outcome: "completed" },
  ]);
  assert.equal(JSON.stringify(tracer.records()).includes("private prompt"), false);
});

test("rejects a result that exceeds the configured model budget", async () => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ responses: [{ type: "final", message: { role: "assistant", content: "answer" }, usage: { estimated_cost: 2 } }] }));
  const gateway = new ProductionModelGateway({ models, router: new ModelRouter({ default_provider_id: "fake" }), maximum_cost: 1 });

  await assert.rejects(
    gateway.generate({ ...request, provider_id: "fake" }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "MODEL_BUDGET_EXCEEDED",
  );
});

const meterFor = (entries: ModelPriceEntry[] = [], policy: "allow" | "warn" | "block" = "allow") =>
  new InMemoryUsageMeter({ catalog: new PriceCatalog({ entries, unknown_cost_policy: policy }) });

const priceEntry: ModelPriceEntry = {
  provider_id: "fake", model_pattern: "model-1", currency: "USD",
  input_per_million: 1, output_per_million: 2,
  effective_from: "2000-01-01T00:00:00.000Z", catalog_version: "test-1",
};

test("every physical attempt is metered, including the failed one that preceded a fallback", async () => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ id: "secondary", responses: [{ type: "final", message: { role: "assistant", content: "fallback answer" }, usage: { input_tokens: 10, output_tokens: 5 } }] }));
  models.register({
    id: "primary",
    models: async () => [], capabilities: async () => ({ streaming: false, tool_calling: false, structured_output: false, vision: false }), health: async () => ({ state: "unhealthy" }),
    generate: async () => { throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "temporary", true); },
  });
  const meter = meterFor();
  const gateway = new ProductionModelGateway({
    models, router: new ModelRouter({ default_provider_id: "primary", fallback_provider_ids: ["secondary"] }),
    maximum_retries: 0, meter, usage_context: { role: "delegation", operation: "chat", request_id: "req-1", execution_id: "exec-1" },
  });

  await gateway.generate(request);

  const records = meter.records();
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => [record.provider_id, record.outcome]), [["primary", "failed"], ["secondary", "completed"]]);
  assert.equal(records[0]?.usage_source, "unknown", "a failure with no provider usage is unknown, not zero");
  assert.equal(records[1]?.dimensions.input_tokens, 10);
  assert.equal(records[0]?.execution_id, "exec-1");
  assert.equal(records[0]?.role, "delegation");
  assert.equal(records.every((record) => record.redacted), true);
  assert.equal(JSON.stringify(records).includes("private prompt"), false);
});

test("retry attempts share one logical call id and are counted as retries", async () => {
  const models = new ModelGateway();
  let attempts = 0;
  models.register({
    id: "flaky",
    models: async () => [], capabilities: async () => ({ streaming: false, tool_calling: false, structured_output: false, vision: false }), health: async () => ({ state: "degraded" }),
    generate: async () => {
      attempts += 1;
      if (attempts === 1) throw new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", "temporary", true);
      return { type: "final", message: { role: "assistant", content: "ok" }, usage: { input_tokens: 1 } };
    },
  });
  const meter = meterFor();
  const gateway = new ProductionModelGateway({ models, router: new ModelRouter({ default_provider_id: "flaky" }), maximum_retries: 1, meter });

  await gateway.generate({ ...request, provider_id: "flaky" });

  const records = meter.records();
  assert.equal(records.length, 2);
  assert.equal(new Set(records.map((record) => record.call_id)).size, 1, "one logical call");
  assert.deepEqual(records.map((record) => record.attempt), [1, 2]);
  assert.deepEqual(records.map((record) => record.retry_count), [0, 1]);
});

test("the cost ceiling is enforced from the normalized estimate", async () => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ responses: [{ type: "final", message: { role: "assistant", content: "answer" }, usage: { input_tokens: 3_000_000 } }] }));
  const meter = meterFor([priceEntry]);
  const gateway = new ProductionModelGateway({ models, router: new ModelRouter({ default_provider_id: "fake" }), maximum_cost: 1, meter });

  await assert.rejects(
    gateway.generate({ ...request, provider_id: "fake", model: "model-1" }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "MODEL_BUDGET_EXCEEDED",
  );
  assert.equal(meter.records().length, 1, "a billable call that busted the budget is still metered");
});

test("a call with no usable price is refused when the unknown-cost policy blocks", async () => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ responses: [{ type: "final", message: { role: "assistant", content: "answer" } }] }));
  const gateway = new ProductionModelGateway({
    models, router: new ModelRouter({ default_provider_id: "fake" }),
    maximum_cost: 1, meter: meterFor([], "block"),
  });

  await assert.rejects(
    gateway.generate({ ...request, provider_id: "fake", model: "unpriced-model" }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "MODEL_BUDGET_EXCEEDED",
  );
});

test("an unpriced call proceeds when the policy allows it", async () => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ responses: [{ type: "final", message: { role: "assistant", content: "answer" } }] }));
  const gateway = new ProductionModelGateway({
    models, router: new ModelRouter({ default_provider_id: "fake" }),
    maximum_cost: 1, meter: meterFor([], "allow"),
  });

  const result = await gateway.generate({ ...request, provider_id: "fake", model: "unpriced-model" });
  assert.equal(result.type, "final");
});
