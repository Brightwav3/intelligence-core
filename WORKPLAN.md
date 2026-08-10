# Intelligence Core — Foundation Workplan

## Goal

Deliver a clean, independently testable, headless, agent-first, provider-independent TypeScript runtime that establishes Foundation contracts and execution lifecycle.

## Scope

- Typed request, input (`text`, `structured`, `event`), output, result, constraints, usage, IDs, health, and capabilities.
- Distinct opaque request and execution identities.
- Deterministic execution, cancellation, stale-result protection, concurrency, lifecycle events, structured errors, and clean shutdown.
- Minimal model/context/memory/tool boundaries and null context/tool implementations.
- Documentation, ADRs, automated tests, and git hygiene.

## Non-goals

No real AI providers, provider SDKs, prompt/reasoning loops, tools, memory storage, agents, HTTP transport, GUI, or modifications to neighboring repositories.

## Definition of Done

Foundation is complete when build, strict typecheck, and deterministic tests pass; public contracts and runtime behavior exist; health/capabilities/events/errors are machine-readable; cancellation protects against late results; documentation and ADRs accurately explain boundaries; and repository/headless/identity/agent-first hygiene audits pass.

## Stop condition

After the Definition of Done passes, record `FOUNDATION COMPLETE` and do not start provider, memory, tool, or agent work. The supplied Foundation workplan remains the detailed source contract for this implementation.
