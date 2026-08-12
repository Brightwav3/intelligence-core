import assert from "node:assert/strict";
import test from "node:test";

import { GeminiModelProvider, IntelligenceRuntimeError } from "../../src/index.js";

test("converts normalized messages to a Gemini REST request and response", async () => {
  let requestedUrl = "";
  let requestedBody: unknown;
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async (url, init) => {
      requestedUrl = String(url);
      requestedBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        candidates: [{ content: { parts: [{ text: "hello from Gemini" }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
      }), { status: 200 });
    },
  });

  const response = await provider.generate({
    provider_id: "gemini",
    model: "gemini-test",
    messages: [
      { role: "system", content: "Be concise" },
      { role: "user", content: "Hello" },
    ],
  });

  assert.match(requestedUrl, /models\/gemini-test:generateContent\?key=test-key$/);
  assert.deepEqual(requestedBody, {
    systemInstruction: { parts: [{ text: "Be concise" }] },
    contents: [{ role: "user", parts: [{ text: "Hello" }] }],
  });
  assert.deepEqual(response, {
    provider_id: "gemini",
    model: "gemini-test",
    type: "final",
    message: { role: "assistant", content: "hello from Gemini" },
    usage: { input_units: 3, output_units: 4 },
  });
});

test("does not leak an HTTP provider response into its error", async () => {
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async () => new Response("upstream secret", { status: 500 }),
  });

  await assert.rejects(
    provider.generate({ provider_id: "gemini", model: "gemini-test", messages: [{ role: "user", content: "Hello" }] }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "MODEL_PROVIDER_FAILED" && error.retryable === true && error.message === "Gemini model request failed.",
  );
});

test("requires an API key only when a real Gemini call is attempted", async () => {
  const provider = new GeminiModelProvider({ api_key: "" });

  await assert.rejects(
    provider.generate({ provider_id: "gemini", model: "gemini-test", messages: [{ role: "user", content: "Hello" }] }),
    (error: unknown) => error instanceof IntelligenceRuntimeError && error.code === "INVALID_CONFIGURATION",
  );
});

test("declares tool calling and forwards tool definitions as function declarations", async () => {
  let body: any;
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "done" }] } }] }), { status: 200 });
    },
  });

  assert.equal((await provider.capabilities()).tool_calling, true);

  await provider.generate({
    provider_id: "gemini",
    model: "gemini-test",
    messages: [{ role: "user", content: "open the browser" }],
    tools: [{ id: "open_app", description: "Launches an application.", input_schema: { type: "OBJECT", properties: { app: { type: "STRING" } }, required: ["app"] } }],
  });

  assert.deepEqual(body.tools, [{
    function_declarations: [{
      name: "open_app",
      description: "Launches an application.",
      parameters: { type: "OBJECT", properties: { app: { type: "STRING" } }, required: ["app"] },
    }],
  }]);
});

test("omits the tools field entirely when no tools are offered", async () => {
  let body: any;
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "hi" }] } }] }), { status: 200 });
    },
  });

  await provider.generate({ provider_id: "gemini", model: "gemini-test", messages: [{ role: "user", content: "hi" }], tools: [] });
  assert.equal("tools" in body, false);
});

test("a function call becomes a normalized tool request with a minted identifier", async () => {
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: "open_app", args: { app: "browser" } } }] } }],
      usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 2 },
    }), { status: 200 }),
  });

  const response = await provider.generate({
    provider_id: "gemini",
    model: "gemini-test",
    messages: [{ role: "user", content: "open the browser" }],
    tools: [{ id: "open_app", description: "Launches an application.", input_schema: {} }],
  });

  assert.equal(response.type, "tool_requests");
  if (response.type !== "tool_requests") return;
  assert.equal(response.tool_requests.length, 1);
  assert.equal(response.tool_requests[0]?.tool_id, "open_app");
  assert.deepEqual(response.tool_requests[0]?.arguments, { app: "browser" });
  assert.match(String(response.tool_requests[0]?.id), /^gemini-call-\d+$/);
  assert.equal(response.usage?.input_units, 11);
});

test("minted tool call identifiers are unique so results correlate to their request", async () => {
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: "open_app", args: {} } }] } }],
    }), { status: 200 }),
  });

  const request = { provider_id: "gemini", model: "gemini-test", messages: [{ role: "user" as const, content: "go" }], tools: [] };
  const first = await provider.generate(request);
  const second = await provider.generate(request);

  const idOf = (response: Awaited<ReturnType<typeof provider.generate>>) =>
    response.type === "tool_requests" ? response.tool_requests[0]?.id : undefined;
  assert.notEqual(idOf(first), idOf(second));
});

test("multiple function calls in one response all become tool requests", async () => {
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [
        { functionCall: { name: "open_app", args: { app: "browser" } } },
        { functionCall: { name: "open_app", args: { app: "editor" } } },
      ] } }],
    }), { status: 200 }),
  });

  const response = await provider.generate({ provider_id: "gemini", model: "gemini-test", messages: [{ role: "user", content: "open both" }], tools: [] });
  assert.equal(response.type === "tool_requests" && response.tool_requests.length, 2);
});

test("a tool result is sent back as a function response, not as user text", async () => {
  let body: any;
  const provider = new GeminiModelProvider({
    api_key: "test-key",
    fetch: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Opened it." }] } }] }), { status: 200 });
    },
  });

  await provider.generate({
    provider_id: "gemini",
    model: "gemini-test",
    messages: [
      { role: "user", content: "open the browser" },
      { role: "tool", tool_call_id: "open_app", content: "Opened browser." },
    ],
    tools: [],
  });

  assert.deepEqual(body.contents[1].parts[0], {
    functionResponse: { name: "open_app", response: { result: "Opened browser." } },
  });
});
