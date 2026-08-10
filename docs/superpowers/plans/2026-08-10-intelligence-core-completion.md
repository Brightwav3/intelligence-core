# Intelligence Core Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the verified Foundation into a usable, headless intelligence core with replaceable models, assembled context, safe tool orchestration, external memory integration, and bounded production reliability.

**Architecture:** Preserve `IntelligenceRuntime` as lifecycle authority. Add a model gateway and provider adapters, a context assembler, and an action runtime that turns normalized model tool requests into externally authorized tool calls. Production wrappers provide configured routing, retry/fallback, budgets, tracing, and health without becoming required for the basic path.

**Tech Stack:** TypeScript 5.8, Node.js 22 ESM, native `fetch`, `node:test`, `tsx`.

## Global Constraints

- No provider SDKs outside provider adapter files; use a Gemini REST adapter and `GEMINI_API_KEY` only at the adapter boundary.
- No GUI, HTTP server, memory storage, application-tool implementation, or assistant-name runtime dependency.
- Every tool request crosses `PolicyClient.evaluate`; model output is never authority.
- New behavior is test-first and network-free in CI.
- Public contracts use typed, normalized, provider-independent data.

---

### Task 1: Model contracts, gateway, and providers

**Files:**
- Modify: `src/contracts/intelligence.ts`, `src/errors/intelligence-runtime-error.ts`, `src/models/model-boundary.ts`, `src/index.ts`
- Create: `src/models/model-gateway.ts`, `src/models/fake-model-provider.ts`, `src/models/gemini-model-provider.ts`
- Test: `tests/integration/model-gateway.test.ts`, `tests/integration/gemini-model-provider.test.ts`

**Interfaces:**
- Produces `ModelRequest`, `ModelResponse`, `ModelStreamEvent`, `ModelProvider`, `ModelGateway`, `FakeModelProvider`, and `GeminiModelProvider`.
- `ModelGateway.generate(request, signal?)` selects a registered provider by ID and normalizes unknown provider failures to `MODEL_PROVIDER_FAILED`.
- `ModelProvider` has `id`, `models()`, `capabilities()`, `health()`, `generate()`, and optional `stream()`.

- [ ] **Step 1: Write failing gateway tests** for provider registration, normalized generation, unknown-provider errors, abort propagation, and provider-failure normalization.
- [ ] **Step 2: Run** `npm test -- tests/integration/model-gateway.test.ts` **and confirm failure because gateway exports are missing.**
- [ ] **Step 3: Implement minimal provider-independent contracts, fake provider, and gateway.**
- [ ] **Step 4: Run** `npm test -- tests/integration/model-gateway.test.ts` **and confirm pass.**
- [ ] **Step 5: Write failing Gemini adapter tests** using injected `fetch`: request shape, response normalization, HTTP error normalization, and missing-key failure.
- [ ] **Step 6: Run** `npm test -- tests/integration/gemini-model-provider.test.ts` **and confirm failure because the adapter is missing.**
- [ ] **Step 7: Implement the Gemini REST adapter with injected fetch and no SDK dependency.**
- [ ] **Step 8: Run model tests, typecheck, and commit.**

### Task 2: Context assembly and external memory contract

**Files:**
- Modify: `src/context/memory-context-provider.ts`, `src/index.ts`
- Create: `src/context/context-assembler.ts`, `src/context/context-provider.ts`
- Test: `tests/integration/context-assembler.test.ts`

**Interfaces:**
- Produces `ContextAssembler`, `ContextProvider`, `ModelContext`, and a compatible `MemoryContextProvider`.
- `ContextAssembler.assemble(request, execution)` returns ordered system, session, external, memory, tool, and request context without persisting any data.

- [ ] **Step 1: Write failing tests** for deterministic context ordering, null providers, provider failures, and memory passed only through its public boundary.
- [ ] **Step 2: Run** `npm test -- tests/integration/context-assembler.test.ts` **and confirm failure because context assembly is missing.**
- [ ] **Step 3: Implement the minimal assembler and null external providers.**
- [ ] **Step 4: Run the context test and confirm pass.**
- [ ] **Step 5: Run typecheck and commit.**

### Task 3: Policy boundary, tools, and action loop

**Files:**
- Modify: `src/tools/tool-client.ts`, `src/contracts/intelligence.ts`, `src/index.ts`
- Create: `src/policy/policy-client.ts`, `src/agent/action-runtime.ts`
- Test: `tests/integration/action-runtime.test.ts`

**Interfaces:**
- Produces `ToolRequest`, `ToolResult`, `PolicyClient`, `PolicyDecision`, `ActionRuntime`, and `ActionResult`.
- `ActionRuntime.execute(request, signal?)` assembles context, calls the model, validates a requested tool, asks policy, executes only `ALLOW`, feeds the result to the next model call, and returns a final answer or structured limit/denial/error.

- [ ] **Step 1: Write failing tests** for final-answer completion, allowed tool round-trip, denied tool non-execution, confirmation non-execution, invalid tool request, iteration limit, and cancellation.
- [ ] **Step 2: Run** `npm test -- tests/integration/action-runtime.test.ts` **and confirm failure because ActionRuntime is missing.**
- [ ] **Step 3: Implement policy contracts, richer tool contracts, and the smallest sequential action loop.**
- [ ] **Step 4: Run action tests and confirm pass.**
- [ ] **Step 5: Run full tests, typecheck, build, and commit.**

### Task 4: Runtime composition and production reliability

**Files:**
- Modify: `src/runtime/intelligence-runtime.ts`, `src/contracts/intelligence.ts`, `src/index.ts`
- Create: `src/production/model-router.ts`, `src/production/production-model-gateway.ts`, `src/observability/execution-tracer.ts`
- Test: `tests/integration/production-model-gateway.test.ts`, `tests/integration/intelligence-runtime.test.ts`

**Interfaces:**
- Produces `ModelRouter`, `ProductionModelGateway`, `ExecutionTracer`, and an `IntelligenceRuntime` composition option that delegates model-backed requests without changing Foundation lifecycle semantics.
- `ProductionModelGateway.generate` enforces budget and deadline before attempts, retries retryable normalized provider errors, falls back only to configured providers, and records a structured trace with no prompt content.

- [ ] **Step 1: Write failing tests** for configured default selection, retry, fallback, budget rejection, deadline rejection, trace redaction, and runtime lifecycle cancellation of a model-backed execution.
- [ ] **Step 2: Run production tests and confirm failure because production contracts are missing.**
- [ ] **Step 3: Implement minimal configured routing, retry/fallback, budget/deadline checks, tracing, and runtime composition.**
- [ ] **Step 4: Run production and full tests, then confirm typecheck and build pass.**
- [ ] **Step 5: Commit.**

### Task 5: Documentation, audit, and verified completion

**Files:**
- Modify: `README.md`, `WORKPLAN.md`, `ARCHITECTURE.md`, `PROGRESS.md`, `ISSUES.md`
- Modify only when verified complete: `C:/Users/Sajmon/Jarvis/README AGENTS.md`

- [ ] **Step 1: Update public documentation to describe implemented contracts, configuration, limitations, and all five layers.**
- [ ] **Step 2: Run** `npm run typecheck`, `npm test`, and `npm run build` **and record exact results.**
- [ ] **Step 3: Audit runtime code for provider SDK leakage, model authority, memory/tool ownership leaks, GUI, assistant-name coupling, secrets, and speculative abstractions.**
- [ ] **Step 4: Audit Git hygiene and synchronize the ecosystem manifest from verified repository evidence.**
- [ ] **Step 5: Commit the verified documentation and audit record.**
