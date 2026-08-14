/**
 * A 429 is a wait, not a refusal. Treating it as terminal turned a few seconds of
 * backoff into a failure the user experiences as the feature being broken.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  GeminiModelProvider,
  IntelligenceRuntimeError,
  ModelGateway,
  ModelRouter,
  ProductionModelGateway,
} from "../../src/index.js";

const request = { provider_id: "gemini", model: "gemini-3.5-flash", messages: [{ role: "user" as const, content: "hello" }] };

const rateLimited = (body: string, headers: Record<string, string> = {}) =>
  new Response(body, { status: 429, headers });

const ok = () => new Response(JSON.stringify({
  candidates: [{ content: { parts: [{ text: "done" }] } }],
  usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
}), { status: 200 });

test("a rate limit is reported as retryable, unlike a client error", async () => {
  const limited = new GeminiModelProvider({ api_key: "test", fetch: async () => rateLimited("{}") });
  await assert.rejects(() => limited.generate(request), (error: unknown) => {
    assert.ok(error instanceof IntelligenceRuntimeError);
    assert.equal(error.code, "MODEL_PROVIDER_FAILED");
    assert.equal(error.retryable, true);
    assert.equal(error.context?.status, 429);
    return true;
  });

  const badRequest = new GeminiModelProvider({ api_key: "test", fetch: async () => new Response("{}", { status: 400 }) });
  await assert.rejects(() => badRequest.generate(request), (error: unknown) => {
    assert.equal((error as IntelligenceRuntimeError).retryable, false, "a 400 will fail again identically");
    return true;
  });
});

test("the provider's advised wait is read from the header or the RetryInfo body", async () => {
  const fromHeader = new GeminiModelProvider({ api_key: "test", fetch: async () => rateLimited("{}", { "retry-after": "7" }) });
  await assert.rejects(() => fromHeader.generate(request), (error: unknown) => {
    assert.equal((error as IntelligenceRuntimeError).context?.retry_after_ms, 7_000);
    return true;
  });

  const body = JSON.stringify({ error: { code: 429, details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "3.5s" }] } });
  const fromBody = new GeminiModelProvider({ api_key: "test", fetch: async () => rateLimited(body) });
  await assert.rejects(() => fromBody.generate(request), (error: unknown) => {
    assert.equal((error as IntelligenceRuntimeError).context?.retry_after_ms, 3_500);
    return true;
  });
});

test("the error message never carries the provider's response body", async () => {
  const provider = new GeminiModelProvider({ api_key: "test", fetch: async () => rateLimited(JSON.stringify({ error: { message: "project 12345 secret detail" } })) });
  await assert.rejects(() => provider.generate(request), (error: unknown) => {
    assert.equal((error as Error).message.includes("12345"), false);
    assert.match((error as Error).message, /quota or rate limit/i);
    return true;
  });
});

test("the gateway waits the advised delay and then succeeds", async () => {
  let attempts = 0;
  const models = new ModelGateway();
  models.register(new GeminiModelProvider({
    api_key: "test",
    fetch: async () => (++attempts === 1 ? rateLimited("{}", { "retry-after": "0.05" }) : ok()),
  }));
  const gateway = new ProductionModelGateway({ models, router: new ModelRouter({ default_provider_id: "gemini" }), maximum_retries: 1 });

  const started = Date.now();
  const response = await gateway.generate(request);
  const elapsed = Date.now() - started;

  assert.equal(response.type, "final");
  assert.equal(attempts, 2);
  assert.ok(elapsed >= 45, `expected a real wait before retrying, waited ${elapsed}ms`);
});

test("an advised delay cannot park an execution beyond the configured cap", async () => {
  let attempts = 0;
  const models = new ModelGateway();
  models.register(new GeminiModelProvider({
    api_key: "test",
    // A provider asking for an hour must not be obeyed literally.
    fetch: async () => (++attempts === 1 ? rateLimited("{}", { "retry-after": "3600" }) : ok()),
  }));
  const gateway = new ProductionModelGateway({ models, router: new ModelRouter({ default_provider_id: "gemini" }), maximum_retries: 1, maximum_retry_delay_ms: 30 });

  const started = Date.now();
  await gateway.generate(request);
  assert.ok(Date.now() - started < 2_000, "the cap, not the provider, decides the ceiling");
  assert.equal(attempts, 2);
});

test("cancellation interrupts the backoff instead of waiting it out", async () => {
  const controller = new AbortController();
  const models = new ModelGateway();
  models.register(new GeminiModelProvider({
    api_key: "test",
    fetch: async () => { queueMicrotask(() => controller.abort()); return rateLimited("{}", { "retry-after": "30" }); },
  }));
  const gateway = new ProductionModelGateway({ models, router: new ModelRouter({ default_provider_id: "gemini" }), maximum_retries: 1, maximum_retry_delay_ms: 30_000 });

  const started = Date.now();
  await gateway.generate(request, controller.signal).catch(() => undefined);
  assert.ok(Date.now() - started < 2_000, "an aborted execution must not sit in a backoff");
});
