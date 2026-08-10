# Intelligence Core Architecture

## Foundation boundary

Intelligence Core orchestrates future intelligence; it does not own models, memory, tools, voice, devices, UI, or application integrations. It exposes a typed library surface suitable for a future Brain Core adapter: `start`, `stop`, `health`, `capabilities`, `execute`, `cancel`, and `events`.

```text
Input -> IntelligenceRuntime -> structured result
              |       |       |
           Context  Models   Tools
            (null)  (types) (null)
```

## Vocabulary

- **request**: immutable input entering the core, identified by `request_id`.
- **execution**: one attempt to process a request, identified by `execution_id`.
- **input/output**: discriminated provider-independent data shapes.
- **context/model/provider/tool**: future extension boundaries, not Foundation features.
- **session**: an optional generic grouping reference; it is not a voice conversation.
- **event**: a typed lifecycle notification.

## Runtime

The runtime owns lifecycle (`created`, `starting`, `running`, `stopping`, `stopped`, `failed`) and execution state (`created`, `running`, `completed`, `failed`, `cancelled`). A deterministic executor echoes text, structured input, or event data. A cancelled execution becomes non-authoritative before its abort signal reaches the backend, so a late result cannot change it.

## Security and observability

Events provide IDs, statuses, and timestamps; user/model content is not logged by default. Model output is untrusted structured input and is never authority to perform an action. Future tool calls must cross separate validation and authorization boundaries.

## Future sectors

1. Core Runtime & Contracts (Foundation)
2. Model Gateway & Providers
3. Context Assembly
4. Reasoning Runtime
5. Tool Intelligence
6. Agentic Execution
7. Model Routing & Economics
8. Authority, Policy & Security
9. Observability & Evaluation
10. Ecosystem Integration & Hardening

Provider replacement requires only a future provider adapter: `IntelligenceRuntime` does not contain provider SDK payloads or assumptions.
