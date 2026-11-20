import {
  buildClave,
  buildExactFacturaXml,
  buildExactTiqueteXml,
  calculateExactFe,
  calculateExactTe,
  validateDocumentXml,
  type ExactFeInput,
  type ExactTeInput,
} from "@dojocoding/hacienda-sdk";
import { decimalAmount, parseAmount } from "../shared/money";
import { reservation } from "./contract";

const xmlRoots = { "01": "FacturaElectronica", "04": "TiqueteElectronico" };

export async function renderFiscalOffline(input: unknown) {
  const reserved = reservation.parse(input);
  const {
    kind,
    issued_at,
    branch,
    terminal,
    sequence,
    security_code,
    snapshot,
  } = reserved;
  const { issuer, receiver } = snapshot;
  const clave = buildClave({
    date: new Date(issued_at),
    taxpayerId: issuer.number,
    branch,
    pos: terminal,
    documentType: kind,
    sequence,
    situation: "1",
    securityCode: security_code,
  });
  const consecutive =
    branch + terminal + kind + String(sequence).padStart(10, "0");

  const source = {
    clave,
    numeroConsecutivo: consecutive,
    fechaEmision: issued_at,
    proveedorSistemas: snapshot.supplierId,
    codigoActividadEmisor: snapshot.activity,
    emisor: {
      nombre: issuer.name,
      identificacion: { tipo: issuer.type, numero: issuer.number },
      ubicacion: {
        provincia: issuer.province,
        canton: issuer.canton,
        distrito: issuer.district,
        otrasSenas: issuer.address,
      },
      correoElectronico: [issuer.email],
    },
    condicionVenta: "01",
    codigoTipoMoneda: { codigoMoneda: "CRC", tipoCambio: "1" },
    detalleServicio: snapshot.lines.map((line, i) => ({
      numeroLinea: i + 1,
      codigoCabys: line.cabys,
      cantidad: line.quantity,
      unidadMedida: line.unit,
      detalle: line.name,
      precioUnitario: line.netUnit,
      esServicio: line.service,
      impuesto: [{ codigo: "01", codigoTarifaIVA: "08", tarifa: "13" }],
    })),
    medioPago: snapshot.payments.map(({ code, minor }) => ({
      tipoMedioPago: code,
      totalMedioPago: decimalAmount(minor, 2),
    })),
  } satisfies Omit<ExactTeInput, "caseCode">;

  if ((kind === "01") !== Boolean(receiver))
    throw new Error("fiscal_invalid_receiver");
  const draft = receiver
    ? factura({
        ...source,
        caseCode: "FE-domestic-ordinary-iva13-v1",
        codigoActividadReceptor: receiver.activity,
        receptor: {
          nombre: receiver.name,
          identificacion: {
            tipo: receiver.identification.type,
            numero: receiver.identification.number,
          },
          correoElectronico: receiver.email,
        },
      })
    : tiquete({ ...source, caseCode: "TE-domestic-ordinary-iva13-v1" });

  if (
    parseAmount(draft.totals.totalComprobante, 5) !==
      BigInt(snapshot.grossMinor) * 1000n ||
    draft.lines.some(
      ({ montoTotalLinea }, i) =>
        parseAmount(montoTotalLinea, 5) !==
        BigInt(snapshot.lines[i].grossMinor) * 1000n,
    )
  )
    throw new Error("fiscal_amount_mismatch");

  const xml = draft.buildXml();
  const verdict = await validateDocumentXml(xml);
  if (
    !verdict.valid ||
    verdict.hasSignature ||
    verdict.rootElement !== xmlRoots[kind]
  )
    throw new Error("fiscal_invalid_offline_xml");

  return {
    clave,
    consecutive,
    xml,
    totals: {
      base: draft.totals.totalVentaNeta,
      iva: draft.totals.totalImpuesto,
      total: draft.totals.totalComprobante,
    },
  };
}

function factura(source: ExactFeInput) {
  const calculated = calculateExactFe(source);
  return {
    lines: calculated.detalleServicio,
    totals: calculated.resumenFactura,
    buildXml: () => buildExactFacturaXml(source),
  };
}

function tiquete(source: ExactTeInput) {
  const calculated = calculateExactTe(source);
  return {
    lines: calculated.detalleServicio,
    totals: calculated.resumenFactura,
    buildXml: () => buildExactTiqueteXml(source),
  };
}
