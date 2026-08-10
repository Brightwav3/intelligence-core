import assert from "node:assert/strict";
import test from "node:test";

import {
  ExecutionTracer,
  FakeModelProvider,
  IntelligenceRuntimeError,
  ModelGateway,
  ModelRouter,
  ProductionModelGateway,
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
