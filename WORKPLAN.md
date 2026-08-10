# Intelligence Core — Active Roadmap

## Current state

Foundation and the architecture-simplification pass are complete. The repository remains a headless, provider-independent TypeScript library. The Foundation contract is preserved as the historical scope of the implementation already delivered.

## Goal

Evolve the verified Foundation through five practical layers without turning architectural checklists into separate projects.

## Core principles

- The runtime owns lifecycle, IDs, cancellation, stale-result protection, structured errors, events, health, capabilities, concurrency, and shutdown.
- Providers, memory, tools, policy, and transports remain external dependencies behind narrow contracts.
- A model can request an action; it is never authority to perform one.
- The core is headless, agent-first, assistant-name-independent, and provider-independent.

## Architecture roadmap

```text
Foundation / Runtime
        ↓
Model Layer
        ↓
Context Layer
        ↓
Action Layer
        ↓
Production Layer
```

## Historical Foundation scope — complete

Foundation delivered typed requests, inputs, outputs, results, constraints, usage, health, capabilities, request/execution/session IDs, deterministic execution, cancellation, stale-result protection, concurrency, lifecycle events, structured errors, clean shutdown, and null model/context/memory/tool boundaries.

It deliberately did not deliver real providers, prompt assembly, memory storage, application tools, agent loops, routing, HTTP, or a GUI.

## Phases

### Phase 1 — Model Layer

Own `ModelProvider` and `ModelGateway`, provider registration and capabilities, normalized model input/output, streaming, cancellation, usage, and provider-error normalization. Start with a fake provider and one replaceable cloud adapter. No provider SDK may leak into `IntelligenceRuntime` or core contracts.

### Phase 2 — Context Layer

Own `ContextAssembler`: it constructs model-ready information from the current request, session, system instructions, relevant conversation, tool descriptions, external context, and execution metadata. Memory and state remain externally owned context providers.

### Phase 3 — Action Layer

Own the minimal safe model/tool loop: iteration and deadline limits, cancellation, tool-request validation, tool-result handling, trace, completion, and a policy decision boundary. It does not implement application tools or hardcode authorization in prompts.

### Phase 4 — Memory Integration

Connect the external Memory Core through `MemoryContextProvider` (or its compatible successor). Do not add embeddings, vector storage, archival, or memory extraction to this repository.

### Phase 5 — Production Layer

After real usage, add routing, fallback, budgets, provider health, retries, tracing, metrics, evaluation, recovery, and performance hardening. Automatic model selection is not a prerequisite for the prior phases.

## Scope and non-goals

This repository orchestrates intelligence execution; it does not own models, Memory Core, state storage, calendar/mail/filesystem/browser/home-automation tools, final authorization policy, voice, devices, UI, or transport.

## Testing strategy

Keep deterministic, network-free integration coverage for lifecycle, validation, concurrency, cancellation/stale-result protection, failure paths, health, capabilities, and shutdown. Each future phase adds focused contract and failure-path tests. Run `npm run typecheck`, `npm test`, and `npm run build` before claiming a phase complete.

## Completion and stop condition

Complete when all five layers have a provider-independent public contract, deterministic tests, structured failure behavior, and documentation; `IntelligenceRuntime` can run both Foundation and model-backed executions; and the repository remains headless and external-system-boundary compliant.

Stop feature work after the verification and architecture audit. New providers, external tool implementations, Memory Core, policy products, and transport adapters belong to their own bounded work.
