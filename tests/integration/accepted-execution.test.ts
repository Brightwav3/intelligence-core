import assert from "node:assert/strict";
import test from "node:test";
import { IntelligenceRuntime } from "../../src/index.js";
import type { IntelligenceEvent, IntelligenceRequest } from "../../src/index.js";

const request = (overrides: Partial<IntelligenceRequest> = {}): IntelligenceRequest => ({
  request_id: "req-1",
  input: { type: "text", text: "najdi relevantni vzpominky o novem robotovi" },
  ...overrides,
});

const started = async () => { const runtime = new IntelligenceRuntime(); await runtime.start(); return runtime; };

test("accept returns an execution identity before the work finishes", async () => {
  const runtime = await started();
  const accepted = runtime.accept(request({ execution: { delay_ms: 20 } }));
  assert.match(accepted.executionId, /^exec_/);
  assert.equal(accepted.record()?.status, "created");
  assert.deepEqual(runtime.activeExecutionIds(), [accepted.executionId]);
  const result = await accepted.result;
  assert.equal(result.execution_id, accepted.executionId);
  assert.equal(result.status, "completed");
  assert.deepEqual(runtime.activeExecutionIds(), []);
  await runtime.stop();
});

test("the accepted record moves created -> running -> completed", async () => {
  const runtime = await started();
  const seen: string[] = [];
  runtime.events.on((event: IntelligenceEvent) => seen.push(event.type));
  const accepted = runtime.accept(request());
  assert.equal(accepted.record()?.status, "created");
  await accepted.result;
  assert.equal(accepted.record()?.status, "completed");
  assert.deepEqual(seen, [
    "intelligence.request.received",
    "intelligence.execution.created",
    "intelligence.execution.started",
    "intelligence.execution.completed",
  ]);
  await runtime.stop();
});

test("cancelling through the handle aborts the execution signal", async () => {
  const runtime = await started();
  let observed: AbortSignal | undefined;
  const withAction = new IntelligenceRuntime({
    action: {
      execute: async (_request: IntelligenceRequest, signal: AbortSignal) => {
        observed = signal;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return { output: { type: "text", text: "late" }, iterations: 1, tool_calls: 0 };
      },
    } as never,
  });
  await withAction.start();
  const accepted = withAction.accept(request());
  await new Promise((resolve) => setImmediate(resolve));
  await accepted.cancel();
  await assert.rejects(() => accepted.result, /cancelled/i);
  assert.equal(observed?.aborted, true);
  assert.equal(accepted.record()?.status, "cancelled");
  await withAction.stop();
  await runtime.stop();
});

test("cancelling twice is idempotent and keeps one terminal record", async () => {
  const runtime = await started();
  const accepted = runtime.accept(request({ execution: { delay_ms: 50 } }));
  await accepted.cancel();
  await accepted.cancel();
  await assert.rejects(() => accepted.result, /cancelled/i);
  assert.equal(accepted.record()?.status, "cancelled");
  await runtime.stop();
});

test("an expired deadline terminates the execution instead of running forever", async () => {
  const runtime = await started();
  const accepted = runtime.accept(request({ execution: { delay_ms: 5_000, maximum_duration_ms: 20 } }));
  await assert.rejects(() => accepted.result, (error: Error & { code?: string }) => {
    assert.equal(error.code, "EXECUTION_DEADLINE_EXCEEDED");
    return true;
  });
  assert.equal(accepted.record()?.status, "cancelled");
  assert.deepEqual(runtime.activeExecutionIds(), []);
  await runtime.stop();
});

test("an absolute deadline already in the past is refused immediately", async () => {
  const runtime = await started();
  const accepted = runtime.accept(request({ execution: { deadline: "2000-01-01T00:00:00.000Z", delay_ms: 5_000 } }));
  await assert.rejects(() => accepted.result, /deadline/i);
  await runtime.stop();
});

test("a completed execution leaves no deadline timer holding the process open", async () => {
  const runtime = await started();
  const accepted = runtime.accept(request({ execution: { maximum_duration_ms: 60_000 } }));
  await accepted.result;
  // A live timer here would keep the event loop alive well past the test.
  assert.equal(accepted.record()?.status, "completed");
  await runtime.stop();
});

test("interaction_id is carried through the accepted execution record", async () => {
  const runtime = await started();
  const accepted = runtime.accept(request({ session_id: "session-1", interaction_id: "interaction-1" }));
  assert.equal(accepted.record()?.interaction_id, "interaction-1");
  assert.equal(accepted.record()?.session_id, "session-1");
  await accepted.result;
  assert.equal(accepted.record()?.interaction_id, "interaction-1");
  await runtime.stop();
});

test("stop cancels every accepted execution and drains the active list", async () => {
  const runtime = await started();
  const first = runtime.accept(request({ request_id: "req-1", execution: { delay_ms: 5_000 } }));
  const second = runtime.accept(request({ request_id: "req-2", execution: { delay_ms: 5_000 } }));
  const settled = Promise.allSettled([first.result, second.result]);
  await runtime.stop();
  assert.deepEqual((await settled).map((entry) => entry.status), ["rejected", "rejected"]);
  assert.deepEqual(runtime.activeExecutionIds(), []);
});

test("execute stays behaviourally identical to accept().result", async () => {
  const runtime = await started();
  const result = await runtime.execute(request());
  assert.equal(result.status, "completed");
  assert.equal(result.request_id, "req-1");
  assert.match(result.execution_id, /^exec_/);
  await assert.rejects(() => runtime.execute({ request_id: "", input: { type: "text", text: "x" } }), /contract/i);
  await runtime.stop();
});

test("accept refuses an invalid request synchronously rather than minting an execution", async () => {
  const runtime = await started();
  assert.throws(() => runtime.accept({ request_id: "", input: { type: "text", text: "x" } }), /contract/i);
  assert.deepEqual(runtime.activeExecutionIds(), []);
  await runtime.stop();
});
