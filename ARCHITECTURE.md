# Intelligence Core Architecture

## Foundation / Runtime

Intelligence Core is a headless, model-independent library for intelligence execution. The verified Foundation exposes `start`, `stop`, `health`, `capabilities`, `execute`, `cancel`, and typed lifecycle events.

```text
Input → IntelligenceRuntime → structured result
             │       │       │
          Context  Models   Tools
          boundary boundary boundary
```

The Runtime owns immutable request identity, execution identity, optional session identity, lifecycle, cancellation, stale-result protection, structured errors, typed events, health, capabilities, concurrency, and clean shutdown. It remains provider-independent.

## Five-layer roadmap

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

These are implementation groupings, not mandatory standalone subsystems. Shared contracts for IDs, events, and errors remain in the Foundation.

### Model Layer — implemented

Provides `ModelGateway` and replaceable `ModelProvider` adapters. It normalizes model input, output, streaming, cancellation, usage, capabilities, and provider errors. Provider SDKs live only inside their adapters: `IntelligenceRuntime` must never depend on a provider SDK.

### Context Layer — implemented

Provides `ContextAssembler`, which constructs the information given to a model execution. It may consume request, session, instructions, conversation, tool descriptions, external state, memory context, and execution metadata. It does not own Memory Core or state storage; those systems supply narrow context-provider contracts.

### Action Layer — implemented

Provides the smallest safe model/tool execution environment. A model decides whether another step is useful and can request an available tool. The infrastructure validates the request, applies limits, asks an external policy boundary for a decision, executes through an external tool client, protects against stale results, and records the execution trace.

```text
request → context → model → response
                         ├─ final answer → done
                         └─ tool request → validate → policy → tool → result → context
```

Model output is untrusted input, never authorization. Calendar, mail, filesystem, browser, home automation, and similar tools remain external implementations.

### Production Layer — implemented baseline

Wraps the proven core path with routing, fallback, retries, budgets, provider health, metrics, evaluations, recovery, and performance hardening. It follows rather than blocks a basic single-provider path.

## Historical sector mapping

The former A–J sectors remain a conceptual checklist, not ten implementation projects.

| Former sector | Practical layer |
| --- | --- |
| A — Contracts & Runtime | Foundation / Runtime |
| B — Model Gateway | Model Layer |
| C — Conversation & Context | Context Layer |
| D/E/F/H — Reasoning, Tools, Agentic Execution, Authority boundary | Action Layer |
| G/I/J — Routing, Observability, Integration & Hardening | Production Layer |

## Dependency direction

Later layers build on lower layers. Production concerns observe or wrap core behavior instead of becoming prerequisites for a basic execution. The model and tool boundaries prevent circular coupling and keep integrations replaceable.

## Current implementation boundary

`IntelligenceRuntime` remains lifecycle authority. With no action configuration it uses the deterministic Foundation executor. With `ActionRuntime`, it assembles context, calls any `ModelExecutor`, validates model tool requests, uses an external `PolicyClient`, and calls an external `ToolClient`. `ProductionModelGateway` adds configured primary/fallback routing, retryable-provider retry, response-budget enforcement, and metadata-only tracing.

The repository does not persist memory, implement application tools, own authorization policy, expose HTTP, or provide a GUI. The Gemini adapter is optional and talks to REST only through its own module; a future provider implements the same `ModelProvider` interface.

## Security and observability

Events expose IDs, statuses, and timestamps; user/model content is not logged by default. Model output is not authority to perform an action. Any future tool request must cross validation and an external policy/authority boundary.
