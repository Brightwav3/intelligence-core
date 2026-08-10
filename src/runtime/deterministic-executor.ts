import type { IntelligenceInput, IntelligenceOutput, IntelligenceRequest } from "../contracts/intelligence.js";
import { IntelligenceRuntimeError } from "../errors/intelligence-runtime-error.js";

const wait = (duration: number, signal: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  const timeout = setTimeout(resolve, duration);
  signal.addEventListener("abort", () => {
    clearTimeout(timeout);
    reject(new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false));
  }, { once: true });
});

const outputFor = (input: IntelligenceInput): IntelligenceOutput => {
  if (input.type === "text") return { type: "text", text: input.text };
  if (input.type === "structured") return { type: "structured", value: input.value };
  return { type: "structured", value: { event: input.name, payload: input.payload ?? {} } };
};

export class DeterministicExecutor {
  public async execute(request: IntelligenceRequest, signal: AbortSignal): Promise<IntelligenceOutput[]> {
    const delay = request.execution?.delay_ms ?? 0;
    if (delay > 0) await wait(delay, signal);
    if (signal.aborted) throw new IntelligenceRuntimeError("EXECUTION_CANCELLED", "Execution was cancelled.", false);
    if (request.metadata?.deterministic_failure === true) {
      throw new IntelligenceRuntimeError("EXECUTION_FAILED", "Deterministic execution failed.", false);
    }
    return [outputFor(request.input)];
  }
}
