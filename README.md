# Intelligence Core

## Status: CORE COMPLETE

Intelligence Core is a headless, provider-independent TypeScript library. It validates structured requests, runs deterministic or model-backed executions, assembles context, safely orchestrates authorized external tools, and reports lifecycle, health, capabilities, and metadata-only traces.

It includes a generic `ModelProvider` contract, `ModelGateway`, `FakeModelProvider`, and an optional Gemini REST adapter. Any additional model is added by implementing `ModelProvider`; no provider SDK belongs in the runtime.

It does not own model credentials, memory storage, application tools, final authorization policy, transport, or a GUI.

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
