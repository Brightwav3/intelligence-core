import assert from "node:assert/strict";
import test from "node:test";

import {
  ActionRuntime,
  FakeModelProvider,
  IntelligenceRuntimeError,
  ModelGateway,
  type ModelResponse,
  type ModelExecutor,
  type PolicyClient,
  type ToolClient,
} from "../../src/index.js";

const request = { request_id: "req_action", input: { type: "text" as const, text: "What is the temperature?" } };
const allow: PolicyClient = { evaluate: async () => ({ decision: "allow" }) };

const runtimeFor = (responses: ModelResponse[], policy: PolicyClient = allow, tools?: ToolClient) => {
  const models = new ModelGateway();
  models.register(new FakeModelProvider({ responses }));
  return new ActionRuntime({ models, policy, tools, provider_id: "fake", model: "fake-1" });
};

test("returns a final model answer without invoking tools", async () => {
  const result = await runtimeFor([{ type: "final", message: { role: "assistant", content: "22 °C" } }]).execute(request);

  assert.deepEqual(result, { output: { type: "text", text: "22 °C" }, iterations: 1, tool_calls: 0 });
});

test("executes only policy-approved tool requests and returns the following answer", async () => {
  let executions = 0;
  const tools: ToolClient = {
    discover: async () => [{ id: "weather.current", description: "Gets current weather", input_schema: { type: "object" } }],
    execute: async (toolRequest) => { executions++; assert.deepEqual(toolRequest, { id: "call_1", tool_id: "weather.current", arguments: { city: "Prague" } }); return { tool_call_id: "call_1", content: "22 °C" }; },
  };
  const result = await runtimeFor([
    { type: "tool_requests", tool_requests: [{ id: "call_1", tool_id: "weather.current", arguments: { city: "Prague" } }] },
    { type: "final", message: { role: "assistant", content: "Prague is 22 °C." } },
  ], allow, tools).execute(request);

  assert.equal(executions, 1);
  assert.deepEqual(result, { output: { type: "text", text: "Prague is 22 °C." }, iterations: 2, tool_calls: 1 });
});

test("does not execute a denied tool request", async () => {
  const deny: PolicyClient = { evaluate: async () => ({ decision: "deny", reason: "not allowed" }) };
  const tools: ToolClient = { discover: async () => [{ id: "files.delete", description: "Deletes", input_schema: {} }], execute: async () => { throw new Error("must not execute"); } };

  await assert.rejects(
    runtimeFor([{ type: "tool_requests", tool_requests: [{ id: "call_1", tool_id: "files.delete", arguments: {} }] }], deny, tools).execute(request),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "TOOL_ACTION_DENIED",
  );
});

test("a request with zero allowed tool calls does not advertise tools to the model", async () => {
  let advertisedTools = -1;
  const models: ModelExecutor = {
    generate: async (modelRequest) => {
      advertisedTools = modelRequest.tools?.length ?? 0;
      return { type: "final", message: { role: "assistant", content: "compacted" } };
    },
  };
  const tools: ToolClient = {
    discover: async () => [{ id: "conversation_recall", description: "Recall", input_schema: { type: "object" } }],
    execute: async () => { throw new Error("must not execute"); },
  };
  const runtime = new ActionRuntime({ models, policy: allow, tools, provider_id: "fake", model: "fake-1" });

  await runtime.execute({ ...request, execution: { maximum_tool_calls: 0 } });

  assert.equal(advertisedTools, 0);
});

test("per-request model call limit overrides the runtime default", async () => {
  const tools: ToolClient = {
    discover: async () => [{ id: "weather.current", description: "Weather", input_schema: { type: "object" } }],
    execute: async () => ({ tool_call_id: "call_1", content: "22 °C" }),
  };
  const runtime = runtimeFor([
    { type: "tool_requests", tool_requests: [{ id: "call_1", tool_id: "weather.current", arguments: {} }] },
    { type: "final", message: { role: "assistant", content: "22 °C" } },
  ], allow, tools);

  await assert.rejects(
    runtime.execute({ ...request, execution: { maximum_model_calls: 1, maximum_tool_calls: 1 } }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "ACTION_LIMIT_EXCEEDED",
  );
});
