import type { IntelligenceInput, IntelligenceRequest } from "../contracts/intelligence.js";
import type { ModelMessage } from "../models/model-boundary.js";
import type { ContextProvider } from "./context-provider.js";
import type { MemoryContextProvider } from "./memory-context-provider.js";

export interface ModelContext { messages: ModelMessage[]; }

export interface ContextAssemblerOptions {
  system_instructions?: string[];
  providers?: ContextProvider[];
  memory?: MemoryContextProvider;
}

const inputText = (input: IntelligenceInput): string => {
  if (input.type === "text") return input.text;
  if (input.type === "structured") return JSON.stringify(input.value);
  return JSON.stringify({ event: input.name, payload: input.payload ?? {} });
};

export class ContextAssembler {
  private readonly instructions: string[];
  private readonly providers: ContextProvider[];
  private readonly memory?: MemoryContextProvider;

  public constructor(options: ContextAssemblerOptions = {}) {
    this.instructions = options.system_instructions ?? [];
    this.providers = options.providers ?? [];
    this.memory = options.memory;
  }

  public async assemble(request: IntelligenceRequest): Promise<ModelContext> {
    const messages: ModelMessage[] = this.instructions.map((content) => ({ role: "system", content }));
    for (const provider of this.providers) messages.push(...await provider.contextFor(request));
    if (this.memory) {
      const memory = await this.memory.contextFor(request.request_id);
      if (Object.keys(memory).length > 0) messages.push({ role: "system", content: `Memory context: ${JSON.stringify(memory)}` });
    }
    messages.push({ role: "user", content: inputText(request.input) });
    return { messages };
  }
}
