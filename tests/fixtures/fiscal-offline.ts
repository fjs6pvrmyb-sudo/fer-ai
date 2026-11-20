export const fiscalFixture = {
  provenance: {
    code: "8310100000000",
    source_ref: "tests/fixtures/fiscal-offline.ts",
    source_version: "feria-6a-v1",
    description:
      "Código tomado del fixture exacto TE de Dojo para reproducir la forma del XML",
  },
  receiver: {
    name: "Receptor de prueba FER",
    identification: { type: "01", number: "199999991" },
    email: "receptor@feria.example",
    activity: "620100",
  },
  grossMinor: "113000",
  netUnit: "1000.00000",
  totals: { base: "1000.00000", iva: "130.00000", total: "1130.00000" },
};

export const syntheticIssuers = ["3999999991", "3999999992"].map(
  (number, index) => ({
    identification_type: "02",
    identification_number: number,
    legal_name: `Emisor ficticio FER ${index + 1}`,
    email: `emisor${index + 1}@feria.example`,
    province: "1",
    canton: "01",
    district: "01",
    address: "Dirección ficticia para pruebas offline",
  }),
);
