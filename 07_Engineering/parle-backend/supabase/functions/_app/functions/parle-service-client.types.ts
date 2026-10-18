// GENERATED from parle-app/functions/parle-service-client.types.ts by scripts/sync-app-code.ts. Do not edit.
export type ParleServiceEntity = {
  filter(...args: unknown[]): Promise<unknown>;
  create(value: Record<string, unknown>): Promise<unknown>;
  update(id: string, value: Record<string, unknown>): Promise<unknown>;
  delete(id: string): Promise<unknown>;
  bulkCreate?(values: Array<Record<string, unknown>>): Promise<unknown>;
};

export type ParleServiceClient = {
  auth: { setToken(token: string): void; me(): Promise<unknown> };
  entities: Record<string, ParleServiceEntity>;
  integrations: {
    core: {
      invokeLLM(input: Record<string, unknown>, options: { headers: Record<string, string> }): Promise<unknown>;
      sendEmail(input: Record<string, unknown>, options: { headers: Record<string, string> }): Promise<unknown>;
    };
  };
  usage: {
    increment(input: { userId: string; period: "day" | "month"; periodKey: string; limit: number }): Promise<{ ok?: unknown; used?: unknown } | null>;
    claimReply(input: { userId: string }): Promise<string | null>;
    releaseReply(input: { userId: string; token: string }): Promise<void>;
  };
};
