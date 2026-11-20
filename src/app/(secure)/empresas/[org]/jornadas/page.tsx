import Link from "next/link";
import { notFound } from "next/navigation";
import { Empty, PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import {
  canManageOperations,
  operatingState,
  todayIn,
} from "@/modules/operations/model";

type Day = {
  day: string;
  closed_at: string | null;
  closing_requested_at: string | null;
};

export const metadata = { title: "Jornadas" };

export default async function OperatingDays({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { organization, client, role } = await organizationAccess(org);
  if (!canManageOperations(role)) notFound();
  const today = todayIn(organization.timezone);
  const { data, error } = await client
    .from("operating_days")
    .select("day,closed_at,closing_requested_at")
    .eq("organization_id", org)
    .order("day", { ascending: false })
    .limit(60)
    .returns<Day[]>();
  if (error) throw new Error("No se pudieron consultar las jornadas");
  const base = `/empresas/${org}/jornadas`;
  return (
    <>
      <PageHeading
        title="Jornadas operativas"
        description="Últimas 60 jornadas registradas de esta empresa."
        action={
          <Link className="button primary" href={`${base}/${today}`}>
            Ver jornada actual
          </Link>
        }
      />
      {data.length ? (
        <section className="surface list" aria-label="Historial de jornadas">
          {data.map((day) => {
            const state = day.closed_at
              ? "closed"
              : day.closing_requested_at
                ? "pending"
                : "open";
            return (
              <Link
                key={day.day}
                href={`${base}/${day.day}`}
                className="list-row sale-row"
              >
                <span aria-hidden="true">→</span>
                <strong>{day.day}</strong>
                <span
                  className={`status ${state === "closed" ? "success" : "warning"}`}
                >
                  {operatingState[state]}
                </span>
              </Link>
            );
          })}
        </section>
      ) : (
        <Empty icon="receipt" title="Todavía no hay jornadas registradas">
          Podés revisar los movimientos de la jornada actual.
        </Empty>
      )}
    </>
  );
}
