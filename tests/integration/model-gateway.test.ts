import assert from "node:assert/strict";
import test from "node:test";

import {
  FakeModelProvider,
  IntelligenceRuntimeError,
  ModelGateway,
  type ModelProvider,
  type ModelRequest,
} from "../../src/index.js";

const request: ModelRequest = {
  provider_id: "fake",
  model: "fake-1",
  messages: [{ role: "user", content: "Say hello" }],
};

test("returns normalized output from the selected provider", async () => {
  const gateway = new ModelGateway();
  gateway.register(new FakeModelProvider({
    id: "fake",
    responses: [{ type: "final", message: { role: "assistant", content: "hello" }, usage: { input_units: 2, output_units: 1 } }],
  }));

  const result = await gateway.generate(request);

  assert.deepEqual(result, {
    provider_id: "fake",
    model: "fake-1",
    type: "final",
    message: { role: "assistant", content: "hello" },
    usage: { input_units: 2, output_units: 1 },
  });
});

test("rejects an unregistered provider with a structured error", async () => {
  const gateway = new ModelGateway();

  await assert.rejects(
    gateway.generate({ ...request, provider_id: "missing" }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "MODEL_PROVIDER_NOT_FOUND",
  );
});

test("normalizes unknown provider failures without exposing provider details", async () => {
  const broken: ModelProvider = {
    id: "broken",
    models: async () => [],
    capabilities: async () => ({ streaming: false, tool_calling: false, structured_output: false, vision: false }),
    health: async () => ({ state: "unhealthy" }),
    generate: async () => { throw new Error("provider secret: abc"); },
  };
  const gateway = new ModelGateway();
  gateway.register(broken);

  await assert.rejects(
    gateway.generate({ ...request, provider_id: "broken" }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "MODEL_PROVIDER_FAILED" && error.message === "Model provider failed.",
  );
});

test("propagates cancellation to a provider call", async () => {
  const gateway = new ModelGateway();
  gateway.register(new FakeModelProvider({
    id: "fake",
    delay_ms: 50,
    responses: [{ type: "final", message: { role: "assistant", content: "late" } }],
  }));
  const controller = new AbortController();
  const pending = gateway.generate(request, controller.signal);
  controller.abort();

  await assert.rejects(
    pending,
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "EXECUTION_CANCELLED",
  );
});
