import assert from "node:assert/strict";
import test from "node:test";

import {
  IntelligenceRuntime,
  IntelligenceRuntimeError,
  ActionRuntime,
  FakeModelProvider,
  ModelGateway,
  type IntelligenceEvent,
} from "../../src/index.js";

const textRequest = (text: string, options: Record<string, unknown> = {}) => ({
  request_id: `req_${crypto.randomUUID()}`,
  input: { type: "text" as const, text },
  ...options,
});

test("runs a deterministic request from start through clean stop", async () => {
  const runtime = new IntelligenceRuntime();
  const events: IntelligenceEvent[] = [];
  runtime.events.on((event) => events.push(event));

  await runtime.start();
  const result = await runtime.execute(textRequest("foundation test"));

  assert.equal(result.status, "completed");
  assert.equal(result.outputs[0]?.type, "text");
  assert.equal(result.outputs[0]?.text, "foundation test");
  assert.equal(runtime.health().state, "healthy");
  assert.deepEqual(events.map((event) => event.type), [
    "intelligence.request.received",
    "intelligence.execution.created",
    "intelligence.execution.started",
    "intelligence.execution.completed",
  ]);

  await runtime.stop();
  assert.equal(runtime.lifecycleState(), "stopped");
});

test("rejects invalid requests with structured errors", async () => {
  const runtime = new IntelligenceRuntime();
  await runtime.start();

  await assert.rejects(
    runtime.execute({ request_id: "", input: { type: "text", text: "" } }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "INVALID_REQUEST",
  );
});

test("uses unique execution identities for concurrent requests", async () => {
  const runtime = new IntelligenceRuntime();
  await runtime.start();

  const results = await Promise.all([
    runtime.execute(textRequest("A", { execution: { delay_ms: 5 } })),
    runtime.execute(textRequest("B", { execution: { delay_ms: 5 } })),
    runtime.execute(textRequest("C", { execution: { delay_ms: 5 } })),
  ]);

  assert.equal(new Set(results.map((result) => result.execution_id)).size, 3);
  assert.deepEqual(
    results.map((result) => {
      const output = result.outputs[0];
      return output?.type === "text" ? output.text : undefined;
    }).sort(),
    ["A", "B", "C"],
  );
  await runtime.stop();
});

test("cancels a delayed execution and rejects its stale completion", async () => {
  const runtime = new IntelligenceRuntime();
  const events: IntelligenceEvent[] = [];
  runtime.events.on((event) => events.push(event));
  await runtime.start();

  const pending = runtime.execute(textRequest("late", { execution: { delay_ms: 50 } }));
  const executionId = runtime.activeExecutionIds()[0];
  assert.ok(executionId);
  await runtime.cancel(executionId);

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "EXECUTION_CANCELLED",
  );
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(runtime.execution(executionId)?.status, "cancelled");
  assert.deepEqual(events.map((event) => event.type).slice(-1), ["intelligence.execution.cancelled"]);
  await runtime.stop();
});

test("returns controlled deterministic failures and truthful capabilities", async () => {
  const runtime = new IntelligenceRuntime();
  await runtime.start();

  await assert.rejects(
    runtime.execute(textRequest("fail", { metadata: { deterministic_failure: true } })),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "EXECUTION_FAILED",
  );
  assert.deepEqual(runtime.capabilities(), {
    runtime: true,
    models: false,
    tools: false,
    memory: false,
    agentic_execution: false,
  });
  await runtime.stop();
});

test("clean shutdown cancels active executions and is idempotent", async () => {
  const runtime = new IntelligenceRuntime();
  await runtime.start();
  const pending = runtime.execute(textRequest("shutdown", { execution: { delay_ms: 50 } }));
  const executionId = runtime.activeExecutionIds()[0];

  await runtime.stop();
  await runtime.stop();

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "EXECUTION_CANCELLED",
  );
  assert.equal(runtime.execution(executionId!)?.status, "cancelled");
  assert.equal(runtime.lifecycleState(), "stopped");
});

test("uses the composed action runtime for model-backed executions", async () => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ responses: [{ type: "final", message: { role: "assistant", content: "model answer" } }] }));
  const runtime = new IntelligenceRuntime({ action: new ActionRuntime({ models, provider_id: "fake", model: "fake-1" }) });
  await runtime.start();

  const result = await runtime.execute(textRequest("Use a model"));

  assert.deepEqual(result.outputs, [{ type: "text", text: "model answer" }]);
  assert.equal(result.usage.model_calls, 1);
  await runtime.stop();
});
