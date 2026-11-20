import type { SupabaseClient } from "@supabase/supabase-js";
import { draftRecord, type DraftKey, type DraftDocument } from "./contract";

const columns = "id,revision,status,expires_at,document,sale_id";

export async function readDraft(
  client: SupabaseClient,
  org: string,
  actor: string,
  id?: string,
) {
  let query = client
    .from("conversational_sale_drafts")
    .select(columns)
    .eq("organization_id", org)
    .eq("actor_id", actor);
  if (id) query = query.eq("id", id);
  else
    query = query
      .in("status", ["editing", "review", "confirmed"])
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error("No se pudo consultar el borrador");
  return data ? draftRecord.parse(data) : null;
}

export async function saveDraft(
  client: SupabaseClient,
  org: string,
  key: DraftKey | null,
  document: DraftDocument,
  review: unknown = null,
) {
  const result = await client.rpc("save_conversational_sale", {
    p_org: org,
    p_id: key?.id ?? null,
    p_revision: key?.revision ?? null,
    p_document: document,
    p_review: review,
  });
  return result.error
    ? { code: result.error.message, record: null }
    : { code: null, record: draftRecord.parse(result.data) };
}
