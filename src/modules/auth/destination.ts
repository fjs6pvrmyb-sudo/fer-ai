export function companySelectionPath(forSale: boolean) {
  return forSale ? "/empresas?destino=venta" : "/empresas";
}
