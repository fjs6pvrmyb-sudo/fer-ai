export type IntelligenceConfig =
  | { mode: "disabled" }
  | { mode: "demo" }
  | { mode: "openai"; model: string; key: string };

export function intelligenceConfig(
  env: Readonly<Record<string, string | undefined>> = process.env,
): IntelligenceConfig {
  if (env.FER_INTELLIGENCE_MODE === "demo") return { mode: "demo" };
  const model = env.FER_INTELLIGENCE_MODEL?.trim();
  const key = env.OPENAI_API_KEY?.trim();
  if (
    env.FER_INTELLIGENCE_MODE === "openai" &&
    key &&
    model &&
    /^[a-zA-Z0-9_.:-]{1,80}$/.test(model)
  )
    return { mode: "openai", model, key };
  return { mode: "disabled" };
}
