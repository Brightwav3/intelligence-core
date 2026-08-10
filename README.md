# Intelligence Core

## Status: FOUNDATION COMPLETE

Intelligence Core will become the assistant ecosystem's model-independent intelligence runtime. The completed Foundation is a headless TypeScript library that validates structured requests, runs deterministic executions, exposes lifecycle events, supports cancellation, and reports health and capabilities.

It intentionally does **not** call a model, assemble prompts, run tools, persist memory, expose HTTP, or provide a GUI.

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

## Commands

```bash
npm install
npm run build
npm run typecheck
npm test
```

Node.js 22 or later is required. Tests are deterministic and require no network, credentials, GPU, or other repository.
