import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import type { IntelligenceConfig } from "./config";
import { ProviderFailure, type Interpretation } from "./provider-contract";

export async function requestStructured(
  config: Extract<IntelligenceConfig, { mode: "openai" }>,
  name: string,
  schema: z.ZodType,
  instructions: string,
  question: string,
  signal: AbortSignal,
  outputTokens: number,
): Promise<Interpretation> {
  const client = new OpenAI({
    apiKey: config.key,
    baseURL: "https://api.openai.com/v1",
    logLevel: "off",
    maxRetries: 0,
    timeout: 8_000,
  });
  try {
    const response = await client.responses.create(
      {
        model: config.model,
        input: [{ role: "user", content: question }],
        instructions,
        store: false,
        max_output_tokens: outputTokens,
        text: { format: zodTextFormat(schema, name) },
      },
      { signal },
    );
    const usage = response.usage && {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
    };
    let plan: unknown = null;
    // Responses can include reasoning alongside the single assistant message.
    // A refusal, partial message or unexpected output must not become a plan.
    const messages = response.output.filter(
      (item) => item.type !== "reasoning",
    );
    const message = messages[0];
    const content = message?.type === "message" ? message.content[0] : null;
    if (
      response.status === "completed" &&
      messages.length === 1 &&
      message.type === "message" &&
      message.role === "assistant" &&
      message.status === "completed" &&
      message.content.length === 1 &&
      content?.type === "output_text"
    ) {
      try {
        plan = JSON.parse(content.text);
      } catch {
        /* The caller rejects unusable plans. */
      }
    }
    return { plan, usage: usage ?? undefined };
  } catch (error) {
    if (signal.aborted || error instanceof OpenAI.APIConnectionTimeoutError)
      throw new ProviderFailure("provider_timeout");
    throw new ProviderFailure("provider_unavailable");
  }
}
