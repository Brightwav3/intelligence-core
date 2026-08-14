# Intelligence Core

[![CI](https://github.com/Brightwav3/intelligence-core/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Brightwav3/intelligence-core/actions/workflows/ci.yml)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Part of Assistant Mark I](https://img.shields.io/badge/Part%20of-Assistant%20Mark%20I-6f42c1)](https://github.com/Brightwav3/Assistant-mark-I)

## Status: CORE COMPLETE

Intelligence Core is a headless, provider-independent TypeScript library. It validates structured requests, runs deterministic or model-backed executions, assembles context, safely orchestrates authorized external tools, and reports lifecycle, health, capabilities, and metadata-only traces.

It includes a generic `ModelProvider` contract, `ModelGateway`, `FakeModelProvider`, and an optional Gemini REST adapter. Any additional model is added by implementing `ModelProvider`; no provider SDK belongs in the runtime.

It does not own model credentials, memory storage, application tools, final authorization policy, transport, or a GUI.

### Accepted executions

`accept(request)` admits work and returns its identity synchronously, before any
model runs, so a caller can acknowledge and correlate immediately rather than
waiting on a completion promise. `execute(request)` is exactly `accept(request).result`
and keeps its previous behaviour.

### Usage metering

Every physical provider call emits one normalized `usage.record.v1` — voice, text,
embeddings, retries, and failures that still consumed tokens. Retries are separate
records because a retry is separately billable, while `call_id` keeps them
attributable to the one logical call behind them.

Missing provider usage is recorded as unknown, never as zero: an untracked call is
unmeasured, not free. Unknown values are excluded from totals and reported as an
unknown-usage count beside them.

Pricing lives in a versioned catalog rather than in provider code, so a recorded
cost can always be traced to the numbers that produced it. Currencies are never
merged implicitly, and a call with no matching price follows an explicit
`unknown_cost_policy` that is fail-closed by default.

## Use

```ts
import { IntelligenceRuntime } from "intelligence-core";

const runtime = new IntelligenceRuntime();
await runtime.start();
const result = await runtime.execute({
  request_id: "req_example",
  input: { type: "text", text: "foundation test" },
});
await runtime.stop();
```

## Model-backed use

```ts
import {
  ActionRuntime, FakeModelProvider, IntelligenceRuntime, ModelGateway,
} from "intelligence-core";

const models = new ModelGateway();
models.register(new FakeModelProvider({
  responses: [{ type: "final", message: { role: "assistant", content: "Ready." } }],
}));

const runtime = new IntelligenceRuntime({
  action: new ActionRuntime({ models, provider_id: "fake", model: "fake-1" }),
});
```

For Gemini, construct `new GeminiModelProvider()` and set `GEMINI_API_KEY` in the runtime environment. The adapter uses the REST API directly and is replaceable.

## Commands

```bash
npm install
npm run build
npm run typecheck
npm test
```

Node.js 22 or later is required. Tests are deterministic and require no network, credentials, GPU, or other repository.
