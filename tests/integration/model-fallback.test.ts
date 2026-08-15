/**
 * Configured fallback models used to be carried the whole way to the gateway and then
 * dropped, so a primary-model outage looked like a plain failure and the fallbacks were
 * never tried. These tests pin the escalation itself, and its limits: a fallback is a
 * response to a failing model, not a way around a budget, a cancellation, or a refusal
 * that will repeat identically.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  IntelligenceRuntimeError,
  ModelGateway,
  ModelRouter,
  ProductionModelGateway,
  type Model,
  type ModelCapabilities,
  type ModelProvider,
  type ModelProviderHealth,
  type ModelRequest,
  type ModelResponse,
} from "../../src/index.js";

const CAPABILITIES: ModelCapabilities = { streaming: false, tool_calling: true, structured_output: true, vision: false };

/** Records exactly what each attempt asked for, which is the whole point of these tests. */
class StubProvider implements ModelProvider {
  public readonly seen: ModelRequest[] = [];

  public constructor(
    public readonly id: string,
    private readonly respond: (request: ModelRequest, attempt: number) => ModelResponse,
  ) {}

  public async models(): Promise<Model[]> { return [{ id: "stub", capabilities: CAPABILITIES }]; }
  public async capabilities(): Promise<ModelCapabilities> { return CAPABILITIES; }
  public async health(): Promise<ModelProviderHealth> { return { state: "healthy" }; }

  public async generate(request: ModelRequest): Promise<ModelResponse> {
    this.seen.push(request);
    return this.respond(request, this.seen.length);
  }
}

const final = (text: string): ModelResponse => ({ type: "final", message: { role: "assistant", content: text } });

const failing = (model: string, retryable: boolean) =>
  new IntelligenceRuntimeError("MODEL_PROVIDER_FAILED", `${model} is unavailable.`, retryable);

function build(provider: StubProvider, maximumRetries = 0): ProductionModelGateway {
  const models = new ModelGateway();
  models.register(provider);
  return new ProductionModelGateway({
    models,
    router: new ModelRouter({ default_provider_id: provider.id }),
    maximum_retries: maximumRetries,
  });
}

const request = (fallbacks: string[]): ModelRequest => ({
  provider_id: "stub",
  model: "primary",
  messages: [{ role: "user", content: "hello" }],
  ...(fallbacks.length ? { fallback_models: fallbacks } : {}),
});

test("a failing primary escalates to the configured fallback, in order", async () => {
  const provider = new StubProvider("stub", (input) => {
    if (input.model !== "second-fallback") throw failing(input.model, true);
    return final("done");
  });

  const response = await build(provider).generate(request(["first-fallback", "second-fallback"]));

  assert.equal(response.type, "final");
  assert.deepEqual(provider.seen.map((entry) => entry.model), ["primary", "first-fallback", "second-fallback"]);
});

test("the escalation is ordered, not opportunistic, so a failure stays reproducible", async () => {
  const attempts: string[][] = [];
  for (let run = 0; run < 3; run++) {
    const provider = new StubProvider("stub", (input) => { throw failing(input.model, true); });
    await build(provider).generate(request(["b", "a", "c"])).catch(() => undefined);
    attempts.push(provider.seen.map((entry) => entry.model));
  }
  for (const order of attempts) assert.deepEqual(order, ["primary", "b", "a", "c"]);
});

test("each model spends its own retry budget before the next one is tried", async () => {
  const provider = new StubProvider("stub", (input) => {
    if (input.model !== "fallback") throw failing(input.model, true);
    return final("done");
  });

  await build(provider, 2).generate(request(["fallback"]));

  // Three attempts on the primary (initial + two retries), then the fallback.
  assert.deepEqual(provider.seen.map((entry) => entry.model), ["primary", "primary", "primary", "fallback"]);
});

test("a non-retryable failure still escalates: the next model may not share the fault", async () => {
  const provider = new StubProvider("stub", (input) => {
    // A model that has been withdrawn refuses identically every time, which is exactly
    // the case a fallback exists for.
    if (input.model !== "fallback") throw failing(input.model, false);
    return final("done");
  });

  const response = await build(provider, 2).generate(request(["fallback"]));

  assert.equal(response.type, "final");
  assert.deepEqual(provider.seen.map((entry) => entry.model), ["primary", "fallback"], "a refusal that will repeat is not retried, only escalated");
});

test("the fallback list never reaches a provider", async () => {
  const provider = new StubProvider("stub", () => final("done"));

  await build(provider).generate(request(["fallback"]));

  assert.equal("fallback_models" in provider.seen[0]!, false, "fallbacks are routing, not content");
  assert.equal(provider.seen[0]!.model, "primary");
});

test("a fallback repeating the primary does not double its retry budget", async () => {
  const provider = new StubProvider("stub", (input) => { throw failing(input.model, true); });

  await build(provider, 1).generate(request(["primary"])).catch(() => undefined);

  assert.deepEqual(provider.seen.map((entry) => entry.model), ["primary", "primary"], "the duplicate is collapsed, not run twice");
});

test("a budget refusal is not escalated around", async () => {
  const provider = new StubProvider("stub", () => { throw new IntelligenceRuntimeError("MODEL_BUDGET_EXCEEDED", "over budget", false); });

  await assert.rejects(
    () => build(provider).generate(request(["fallback"])),
    (error: unknown) => (error as IntelligenceRuntimeError).code === "MODEL_BUDGET_EXCEEDED",
  );
  assert.deepEqual(provider.seen.map((entry) => entry.model), ["primary"], "a ceiling is a decision, not a model fault");
});

test("a cancelled execution does not escalate to the next model", async () => {
  const controller = new AbortController();
  const provider = new StubProvider("stub", (input) => {
    controller.abort();
    throw failing(input.model, true);
  });

  await build(provider).generate(request(["fallback"]), controller.signal).catch(() => undefined);

  assert.deepEqual(provider.seen.map((entry) => entry.model), ["primary"], "nobody is waiting for the answer any more");
});

test("the error surfaced is the last one, not a generic gateway failure", async () => {
  const provider = new StubProvider("stub", (input) => { throw failing(input.model, true); });

  await assert.rejects(
    () => build(provider).generate(request(["fallback"])),
    (error: unknown) => {
      assert.match((error as Error).message, /fallback is unavailable/);
      return true;
    },
  );
});

test("no fallback list leaves behaviour exactly as it was", async () => {
  const provider = new StubProvider("stub", (input) => { throw failing(input.model, true); });

  await build(provider, 1).generate(request([])).catch(() => undefined);

  assert.deepEqual(provider.seen.map((entry) => entry.model), ["primary", "primary"]);
});
