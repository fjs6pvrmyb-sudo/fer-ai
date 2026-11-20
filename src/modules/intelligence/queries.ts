import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  dayReview,
  daySchema,
  operationsMetrics,
} from "@/modules/operations/model";
import type { Period } from "./plan";

export function authorizedReads(client: SupabaseClient, org: string) {
  return {
    async totals(period: Period) {
      const { data, error } = await client.rpc("operations_metrics", {
        p_org: org,
        p_from: period.from,
        p_to: period.to,
      });
      if (error) throw new Error("query_error");
      return operationsMetrics.parse(data);
    },
    async latestClosure(today: string) {
      const { data, error } = await client
        .from("day_closures")
        .select("day")
        .eq("organization_id", org)
        .lte("day", today)
        .order("day", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("query_error");
      return data ? daySchema.parse(data.day) : null;
    },
    async closure(day: string) {
      const { data, error } = await client.rpc("day_review", {
        p_org: org,
        p_day: day,
      });
      if (error) throw new Error("query_error");
      return dayReview.parse(data).snapshot;
    },
    async products(period: Period) {
      const { data, error } = await client.rpc("intelligence_product_ranking", {
        p_org: org,
        p_from: period.from,
        p_to: period.to,
      });
      if (error) throw new Error("query_error");
      return z
        .array(
          z.object({
            product_id: z.uuid(),
            name: z.string().max(100),
            units: z.string().regex(/^\d+$/),
          }),
        )
        .max(5)
        .parse(data);
    },
    async differences(period: Period) {
      const query = () =>
        client
          .from("day_closures")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", org)
          .gte("day", period.from)
          .lte("day", period.to);
      const [present, missing] = await Promise.all([
        query().neq("cash_difference_minor", 0),
        query().is("cash_counted_minor", null),
      ]);
      if (
        present.error ||
        missing.error ||
        present.count === null ||
        missing.count === null
      )
        throw new Error("query_error");
      return { cashDifferences: present.count, missingCounts: missing.count };
    },
  };
}

export type AuthorizedReads = ReturnType<typeof authorizedReads>;
