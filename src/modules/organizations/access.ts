import { cache } from "react";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireSession } from "@/modules/auth/session";

export const roles = ["admin", "manager", "operator"] as const;
export type Role = (typeof roles)[number];
export const roleLabels: Record<Role, string> = {
  admin: "Administrador",
  manager: "Gerente",
  operator: "Operador",
};
export type Organization = {
  id: string;
  name: string;
  currency: string;
  scale: number;
  timezone: string;
};

export const organizationAccess = cache(async (org: string) => {
  if (!z.uuid().safeParse(org).success) notFound();
  const session = await requireSession();
  const { client, user } = session;
  const [company, membership] = await Promise.all([
    client
      .from("organizations")
      .select("id,name,currency,scale,timezone")
      .eq("id", org)
      .maybeSingle<Organization>(),
    client
      .from("memberships")
      .select("role")
      .eq("organization_id", org)
      .eq("user_id", user.id)
      .eq("active", true)
      .maybeSingle<{ role: Role }>(),
  ]);
  if (company.error || membership.error)
    throw new Error("No se pudo consultar la organización");
  if (!company.data || !membership.data) notFound();
  return { ...session, organization: company.data, role: membership.data.role };
});
