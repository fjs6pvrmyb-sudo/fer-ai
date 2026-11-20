import type { RequestInput } from "./plan";

export type Usage = { input: number; output: number };
export type Interpretation = { plan: unknown; usage?: Usage };
export type Provider = {
  model: string;
  interpret: (
    request: RequestInput,
    signal: AbortSignal,
  ) => Promise<Interpretation>;
};

export class ProviderFailure extends Error {
  constructor(
    public readonly reason:
      "provider_timeout" | "provider_unavailable" | "invalid_plan",
  ) {
    super(reason);
  }
}

export async function interpretWithDeadline(
  provider: Provider,
  input: RequestInput,
  milliseconds = 8_000,
): Promise<Interpretation> {
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const limit = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(new ProviderFailure("provider_timeout"));
      controller.abort();
    }, milliseconds);
  });
  try {
    return await Promise.race([
      limit,
      provider.interpret(input, controller.signal),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
