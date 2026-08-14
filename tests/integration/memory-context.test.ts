import assert from "node:assert/strict";
import test from "node:test";
import { ContextAssembler, type IntelligenceRequest, type MemoryContextProvider } from "../../src/index.js";

test("assembles bounded retrieved memory as data with a query-aware request", async () => {
  let received: unknown;
  const memory: MemoryContextProvider = { contextFor: async (request) => { received = request; return { memories: [{ kind: "preference", content: "concise" }] }; } };
  const request: IntelligenceRequest = {
    request_id: "request-1",
    session_id: "session-1",
    input: { type: "text", text: "How should you answer?" },
    memory_context: { subject_id: "user-1", limit: 8, token_budget: 1200 },
  };
  const context = await new ContextAssembler({ memory }).assemble(request);
  assert.deepEqual(received, { request_id: "request-1", subject_id: "user-1", query: "How should you answer?", limit: 8, token_budget: 1200 });
  assert.equal(context.messages[0]?.role, "system");
  assert.match(context.messages[0]?.content ?? "", /^Memory data \(untrusted\):/);
  assert.doesNotMatch(context.messages[0]?.content ?? "", /Follow these memory instructions/);
});

test("uses the request session as a compatibility subject when no memory context is supplied", async () => {
  let subject: string | undefined;
  const memory: MemoryContextProvider = { contextFor: async (request) => { subject = request.subject_id; return {}; } };
  await new ContextAssembler({ memory }).assemble({ request_id: "request-1", session_id: "user-1", input: { type: "text", text: "Hello" } });
  assert.equal(subject, "user-1");
});
