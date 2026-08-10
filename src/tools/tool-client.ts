export interface ToolDescriptor {
  id: string;
  description: string;
}

export interface ToolClient {
  discover(): Promise<ToolDescriptor[]>;
}

export class NullToolClient implements ToolClient {
  public async discover(): Promise<ToolDescriptor[]> { return []; }
}
