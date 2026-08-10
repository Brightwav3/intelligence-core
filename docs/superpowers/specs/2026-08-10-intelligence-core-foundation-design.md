# Intelligence Core Foundation Design

## Goal

Create a headless, provider-independent TypeScript library that safely owns the lifecycle of deterministic intelligence executions. It establishes the contracts future sectors need without making a model call, invoking a tool, or storing memory.

## Chosen approach

The library exposes `IntelligenceRuntime` as its narrow public surface. A caller starts the runtime, submits a validated `IntelligenceRequest`, receives an `IntelligenceResult`, observes typed lifecycle events, may cancel by `execution_id`, and can read machine-readable health and capabilities.

Each request gets a stable opaque `request_id`; every processing attempt gets a distinct opaque `execution_id`. The Foundation backend is injected and deterministic: it echoes inputs, can delay, and can deliberately fail for tests. The runtime owns authoritative state. Cancellation aborts the backend and permanently prevents a late completion from replacing the cancelled execution.

## Boundaries

- Owns: validation, canonical IDs, runtime lifecycle, execution state, deterministic backend, typed events, structured errors, health, capabilities, and clean shutdown.
- Does not own: providers, model SDKs, reasoning, prompt assembly, tool execution, memory persistence, HTTP transport, UI, or other ecosystem repositories.
- Context, memory, models, and tools are represented only by small interfaces and null implementations. Future adapters can depend on the public contracts without leaking provider payloads into the runtime.

## Package layout

`src/contracts` contains stable data types and validation; `src/runtime` owns state and the deterministic executor; `src/events` owns the typed event emitter; `src/errors` owns public errors; and `src/{models,context,tools}` contain boundary interfaces. `src/index.ts` is the only public export point.

## Execution model

1. `start()` transitions the runtime to `running` idempotently.
2. `execute()` validates a request, emits received/created/started events, and records one execution.
3. The deterministic executor returns a structured echo or a structured failure.
4. The runtime accepts completion only while that execution remains `running`; otherwise it rejects the stale result.
5. `cancel()` transitions a running execution to `cancelled`, aborts its signal, emits an event, and causes its pending promise to reject with `EXECUTION_CANCELLED`.
6. `stop()` cancels active executions and transitions to `stopped` idempotently.

## Safety and observability

Execution metadata and duration are exposed through state and events. User input and output content are never logged by default. Future model output is untrusted input: it cannot become authority or execute tools without a separate validated authorization boundary.

## Verification

Tests use Node's built-in test runner and no network, credentials, GPU, or neighboring repositories. They cover validation, IDs, events, success, controlled failure, cancellation, stale-result protection, concurrent executions, health, capabilities, and clean shutdown. One integration test exercises start through stop.

## Completion boundary

Foundation ends once these contracts, tests, docs, ADRs, package hygiene, and audits pass. Provider integrations, memory, tool loops, and agentic behavior require later workplans.
