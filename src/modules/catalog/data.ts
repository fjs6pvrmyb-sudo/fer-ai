import type { SupabaseClient } from "@supabase/supabase-js";

export type Product = {
  id: string;
  name: string;
  active: boolean;
  price_id: string;
  amount_minor: string;
};

export async function catalog(
  client: SupabaseClient,
  org: string,
  onlyActive = false,
) {
  let query = client
    .from("catalog")
    .select("id,name,active,price_id,amount_minor")
    .eq("organization_id", org);
  if (onlyActive) query = query.eq("active", true);
  const { data, error } = await query
    .order("name")
    .limit(200)
    .returns<Product[]>();
  if (error) throw new Error("No se pudo consultar el catálogo");
  return data;
}
