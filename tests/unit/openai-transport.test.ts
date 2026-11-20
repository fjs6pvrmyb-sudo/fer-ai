import { afterEach, describe, expect, it, vi } from "vitest";
import { interpretSale } from "@/modules/conversation/extract";
import { demoSaleExtraction } from "@/modules/conversation/demo";
import { extraction } from "@/modules/conversation/contract";
import { openAIProvider } from "@/modules/intelligence/openai";
import { queryPlan } from "@/modules/intelligence/plan";

vi.mock("server-only", () => ({}));

const config = {
  mode: "openai",
  key: "test-fixture",
  model: "test-model",
} as const;
const sale = "Vendí dos cafés filtrados. Me pagaron mil por SINPE";
const period = { from: "2026-11-20", to: "2026-11-20" };
const plan = {
  intent: "sales",
  period: { kind: "today", from: null, to: null },
  comparison: null,
  method: null,
  organization: null,
};

const outputText = (data: unknown) => ({
  type: "output_text",
  text: JSON.stringify(data),
});
const message = (...content: unknown[]) => ({
  type: "message",
  role: "assistant",
  status: "completed",
  content,
});
const response = (output: unknown[], status = "completed") =>
  Response.json({
    status,
    output,
    usage: { input_tokens: 177, output_tokens: 32 },
  });

function fetchFixture(...responses: Response[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const reply of responses) fetch.mockResolvedValueOnce(reply);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function expectClosedSchema(node: unknown) {
  if (!node || typeof node !== "object") return;
  if (
    "properties" in node &&
    node.properties &&
    typeof node.properties === "object"
  ) {
    expect(node).toMatchObject({ additionalProperties: false });
    expect(node).toHaveProperty("required", Object.keys(node.properties));
  }
  for (const child of Object.values(node)) expectClosedSchema(child);
}

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI Responses API con transporte controlado", () => {
  it("genera esquemas estrictos y envía solo el contexto necesario para cada permiso", async () => {
    const extracted = extraction.parse(demoSaleExtraction(sale, false));
    const fetch = fetchFixture(
      response([message(outputText(plan))]),
      response([{ type: "reasoning" }, message(outputText(extracted))]),
    );

    const read = await openAIProvider(config).interpret(
      { question: "¿Cuánto vendimos hoy?", ...period },
      new AbortController().signal,
    );
    const write = await interpretSale(config, sale, true);
    expect(queryPlan.parse(read.plan)).toEqual(plan);
    expect(extraction.parse(write.plan)).toEqual(extracted);
    expect(write.usage).toEqual({ input: 177, output: 32 });
    expect(fetch).toHaveBeenCalledTimes(2);

    const cases = [
      ["feria_query_plan", 450, "¿Cuánto vendimos hoy?"],
      ["feria_sale_extraction", 1200, sale],
    ] as const;
    fetch.mock.calls.forEach(([url, init], index) => {
      const [name, tokens, question] = cases[index];
      expect(String(url)).toBe("https://api.openai.com/v1/responses");
      expect(init).toMatchObject({ method: "POST" });
      const body = JSON.parse(String(init?.body));
      expect(body).toMatchObject({
        model: config.model,
        store: false,
        max_output_tokens: tokens,
        input: [{ role: "user", content: question }],
        text: { format: { type: "json_schema", name, strict: true } },
      });
      expect(body).not.toHaveProperty("tools");
      expect(body).not.toHaveProperty("previous_response_id");
      expect(String(init?.body)).not.toContain(period.from);
      expectClosedSchema(body.text.format.schema);
    });
  });

  it.each([
    [
      "rechazo",
      () => response([message({ type: "refusal", refusal: "rechazo" })]),
    ],
    [
      "mezcla de rechazo y texto",
      () => response([message(outputText(plan), { type: "refusal" })]),
    ],
    [
      "salida parcial",
      () => response([message(outputText(plan))], "incomplete"),
    ],
    [
      "mensaje incompleto",
      () => response([{ ...message(outputText(plan)), status: "incomplete" }]),
    ],
    [
      "dos mensajes",
      () => response([message(outputText(plan)), message(outputText(plan))]),
    ],
    [
      "herramienta inesperada",
      () => response([message(outputText(plan)), { type: "function_call" }]),
    ],
    [
      "JSON inválido",
      () => response([message({ type: "output_text", text: "{ } texto" })]),
    ],
  ])(
    "descarta %s sin perder la telemetría técnica",
    async (_, makeResponse) => {
      const fetch = fetchFixture(makeResponse());
      await expect(interpretSale(config, sale, false)).resolves.toEqual({
        plan: null,
        usage: { input: 177, output: 32 },
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it.each([401, 429, 503])(
    "no reintenta ni propaga detalles HTTP %s",
    async (status) => {
      const fetch = fetchFixture(
        Response.json({ error: { message: "internal detail" } }, { status }),
      );
      await expect(interpretSale(config, sale, false)).rejects.toMatchObject({
        reason: "provider_unavailable",
        message: "provider_unavailable",
      });
      expect(fetch).toHaveBeenCalledOnce();
    },
  );
});
