import { createClient } from "@supabase/supabase-js";
import { fiscalRequest } from "./contract";
import { renderFiscalOffline } from "./render";

export function createOfflineFiscalService(config: {
  url: string;
  publishableKey: string;
  workerKey: string;
}) {
  const url = new URL(config.url);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("fiscal_requires_loopback");

  // This entry point is intentionally unwired to Next and only speaks to local
  // Supabase. A redirect must not forward the local token/key off-host.
  const localFetch: typeof fetch = (input, init) => {
    const target = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (target.origin !== url.origin)
      throw new Error("fiscal_requires_loopback");
    return fetch(input, { ...init, redirect: "error" });
  };
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: { fetch: localFetch },
  };
  const auth = createClient(url.origin, config.publishableKey, options).auth;
  const worker = createClient(url.origin, config.workerKey, options);

  return async function prepareOffline(accessToken: string, input: unknown) {
    const request = fiscalRequest.parse(input);
    const { data, error } = await auth.getUser(accessToken);
    if (error || !data.user) throw new Error("fiscal_forbidden");

    const context = { p_actor: data.user.id, p_org: request.organizationId };
    const pending = await worker.rpc("reserve_fiscal_offline", {
      ...context,
      p_sale: request.saleId,
      p_kind: request.kind,
      p_receiver: request.receiver,
      p_transfers: request.transfers,
    });
    if (pending.error) throw new Error(pending.error.message);
    const prepared = await renderFiscalOffline(pending.data);
    const result = await worker.rpc("store_fiscal_offline", {
      ...context,
      p_intent: pending.data.id,
      p_clave: prepared.clave,
      p_consecutive: prepared.consecutive,
      p_xml: prepared.xml,
      p_totals: prepared.totals,
    });
    if (result.error) throw new Error(result.error.message);
    return {
      status: "prepared_offline" as const,
      intentId: String(result.data.intent_id),
      sha256: String(result.data.xml_sha256),
      ...prepared,
    };
  };
}
