import Link from "next/link";
import { MutationForm } from "@/components/form";
import { Icon } from "@/components/icon";
import { Empty, PageHeading } from "@/components/ui";
import { organizationAccess } from "@/modules/organizations/access";
import { saveProduct } from "@/modules/catalog/actions";
import { catalog, type Product } from "@/modules/catalog/data";
import { decimalAmount, formatMoney } from "@/modules/shared/money";

export const metadata = { title: "Catálogo" };

export default async function CatalogPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org } = await params;
  const { client, organization, role } = await organizationAccess(org);
  const products = await catalog(client, org);
  const edit = role === "admin";
  const fields = (product?: Product) => (
    <>
      <label>
        Nombre
        <input
          name="name"
          maxLength={100}
          required
          defaultValue={product?.name}
        />
      </label>
      <label>
        Precio ({organization.currency})
        <input
          name="amount"
          inputMode="decimal"
          maxLength={30}
          required
          defaultValue={
            product
              ? decimalAmount(product.amount_minor, organization.scale)
              : ""
          }
        />
      </label>
      <label className="check-label">
        <input
          name="active"
          type="checkbox"
          defaultChecked={product?.active ?? true}
        />{" "}
        Disponible para venta
      </label>
    </>
  );
  return (
    <>
      <PageHeading
        title="Catálogo"
        description="Productos y precios vigentes de esta empresa."
      />
      {edit && (
        <details className="surface edit-panel">
          <summary>
            <Icon name="plus" size={19} /> Agregar producto
          </summary>
          <MutationForm
            action={saveProduct.bind(null, org, null)}
            submit="Guardar producto"
          >
            {fields()}
          </MutationForm>
        </details>
      )}
      {products.length ? (
        <section className="surface list" aria-label="Productos">
          {products.map((product) => (
            <article className="catalog-item" key={product.id}>
              <div className="list-row">
                <span className="icon-tile compact">
                  <Icon name="box" size={18} />
                </span>
                <div>
                  <Link
                    className="text-link"
                    href={`/empresas/${org}/catalogo/${product.id}`}
                  >
                    {product.name}
                  </Link>
                  <span
                    className={`status ${product.active ? "success" : "neutral"}`}
                  >
                    {product.active ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <strong>
                  {formatMoney(
                    product.amount_minor,
                    organization.currency,
                    organization.scale,
                  )}
                </strong>
              </div>
              {edit && (
                <details className="inline-edit">
                  <summary>Editar {product.name}</summary>
                  <MutationForm
                    action={saveProduct.bind(null, org, product.id)}
                    submit="Guardar cambios"
                  >
                    {fields(product)}
                  </MutationForm>
                </details>
              )}
            </article>
          ))}
        </section>
      ) : (
        <Empty icon="box" title="Este catálogo está vacío">
          Los productos aparecerán aquí cuando se agreguen a la empresa.
        </Empty>
      )}
    </>
  );
}
