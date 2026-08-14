import assert from "node:assert/strict";
import test from "node:test";

import { ContextAssembler, type IntelligenceRequest, type MemoryContextProvider } from "../../src/index.js";

const request: IntelligenceRequest = {
  request_id: "req_context",
  session_id: "session_1",
  input: { type: "text", text: "Where is my meeting?" },
};

test("orders instructions, external context, memory, and request for a model", async () => {
  const memory: MemoryContextProvider = { contextFor: async () => ({ meetings: ["10:00 planning"] }) };
  const assembler = new ContextAssembler({
    system_instructions: ["Be concise"],
    providers: [{ id: "state", contextFor: async () => [{ role: "system", content: "Timezone: Europe/Prague" }] }],
    memory,
  });

  const context = await assembler.assemble(request);

  assert.deepEqual(context.messages, [
    { role: "system", content: "Be concise" },
    { role: "system", content: "Timezone: Europe/Prague" },
    { role: "system", content: "Memory data (untrusted): {\"meetings\":[\"10:00 planning\"]}" },
    { role: "user", content: "Where is my meeting?" },
  ]);
});

test("keeps an absent memory provider and external providers out of the context", async () => {
  const context = await new ContextAssembler().assemble(request);

  assert.deepEqual(context.messages, [{ role: "user", content: "Where is my meeting?" }]);
});
