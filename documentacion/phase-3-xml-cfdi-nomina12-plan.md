# Fase 3 — XML CFDI 4.0 + Complemento Nómina 1.2

## Objetivo

Construir XML CFDI Nómina determinístico, validable y listo para sellado/PAC a partir del snapshot fiscal preparado. Esta fase debe producir XML correcto estructuralmente, con totales consistentes, namespaces correctos, formato exacto de fechas/montos y sin filtrar datos de nómina dual.

Esta fase no debe depender de datos vivos que puedan cambiar después del cálculo. Debe usar snapshots fiscales inmutables generados por Fase 1/PR #89.

## Alcance v1

Soportar:

- `cfdi:Comprobante Version="4.0"`.
- `TipoDeComprobante="N"`.
- `Moneda="MXN"`.
- `Exportacion="01"`.
- `MetodoPago="PUE"`.
- `cfdi:Receptor UsoCFDI="CN01"`.
- `nomina12:Nomina Version="1.2"`.
- Nómina ordinaria `TipoNomina="O"`.
- Un CFDI por empleado por corrida/pago.
- Percepciones ordinarias con breakdown real.
- Deducciones ordinarias con mapping SAT.
- Subsidio para el empleo conforme a Decreto DOF 01-may-2024:
    - `OtroPago TipoOtroPago="002"`
    - `OtroPago Importe="0.00"`
    - `SubsidioAlEmpleo SubsidioCausado="<monto causado>"`

Bloquear:

- Nómina extraordinaria.
- Corridas con percepciones agregadas sin breakdown.
- Conceptos sin mapping SAT.
- Montos negativos.
- Totales inconsistentes.
- Datos fiscales incompletos.
- Intentos de generar XML con `realPayrollComplementPay`.

## Fuentes mínimas

- SAT Recibo de nómina:
    - https://wwwmat.sat.gob.mx/consultas/97722/comprobante-de-nomina
- RMF 2026:
    - https://www.sat.gob.mx/minisitio/NormatividadRMFyRGCE/documentos2026/rmf/rmf/RMF_2026-DOF-28122025.pdf
- XSD CFDI 4.0:
    - https://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd
- XSD Nómina 1.2:
    - https://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd
- XSD Timbre Fiscal Digital:
    - https://www.sat.gob.mx/sitio_internet/cfd/TimbreFiscalDigital/TimbreFiscalDigitalv11.xsd

Usar siempre un `FiscalArtifactManifest` por ejercicio/ambiente/PAC. No hardcodear reglas fiscales variables solo en código.

---

# Datos de referencia del XML real

No commitear el XML real. Crear fixture redacted.

Estructura observada en el XML real:

```xml
<cfdi:Comprobante
  Version="4.0"
  Fecha="2026-04-17T09:01:05"
  Moneda="MXN"
  TipoDeComprobante="N"
  Exportacion="01"
  MetodoPago="PUE"
  Serie="2026"
  Folio="16"
  LugarExpedicion="45030"
  SubTotal="2205.28"
  Total="2205.28">

  <cfdi:Emisor
    RegimenFiscal="601"
    Rfc="[RFC_EMISOR]"
    Nombre="[NOMBRE_EMISOR]" />

  <cfdi:Receptor
    Rfc="[RFC_RECEPTOR]"
    Nombre="[NOMBRE_RECEPTOR]"
    DomicilioFiscalReceptor="45020"
    RegimenFiscalReceptor="605"
    UsoCFDI="CN01" />

  <cfdi:Conceptos>
    <cfdi:Concepto
      ClaveProdServ="84111505"
      Cantidad="1"
      ClaveUnidad="ACT"
      Descripcion="Pago de nómina"
      ObjetoImp="01"
      ValorUnitario="2205.28"
      Importe="2205.28" />
  </cfdi:Conceptos>

  <cfdi:Complemento>
    <nomina12:Nomina
      Version="1.2"
      TipoNomina="O"
      FechaPago="2026-04-18"
      FechaInicialPago="2026-04-13"
      FechaFinalPago="2026-04-19"
      NumDiasPagados="7.000"
      TotalPercepciones="2205.28"
      TotalOtrosPagos="0.00">

      <nomina12:Emisor RegistroPatronal="[REGISTRO_PATRONAL]" />

      <nomina12:Receptor
        Curp="[CURP]"
        NumSeguridadSocial="[NSS]"
        FechaInicioRelLaboral="2015-05-18"
        Antigüedad="P570W"
        TipoContrato="01"
        Sindicalizado="Sí"
        TipoJornada="01"
        TipoRegimen="02"
        NumEmpleado="A05"
        Departamento="Ninguno"
        Puesto="AUXILIAR ADMINISTRATIVO"
        RiesgoPuesto="1"
        PeriodicidadPago="02"
        CuentaBancaria="[CUENTA_REDACTED]"
        SalarioBaseCotApor="333.17"
        SalarioDiarioIntegrado="315.04"
        ClaveEntFed="JAL" />

      <nomina12:Percepciones
        TotalSueldos="2205.28"
        TotalGravado="2205.28"
        TotalExento="0.00">
        <nomina12:Percepcion
          TipoPercepcion="001"
          Clave="001"
          Concepto="Sueldo"
          ImporteGravado="1890.24"
          ImporteExento="0.00" />
        <nomina12:Percepcion
          TipoPercepcion="001"
          Clave="003"
          Concepto="Séptimo día"
          ImporteGravado="315.04"
          ImporteExento="0.00" />
      </nomina12:Percepciones>

      <nomina12:OtrosPagos>
        <nomina12:OtroPago
          TipoOtroPago="002"
          Clave="035"
          Concepto="Subs al Empleo mes"
          Importe="0.00">
          <nomina12:SubsidioAlEmpleo SubsidioCausado="123.34" />
        </nomina12:OtroPago>
      </nomina12:OtrosPagos>
    </nomina12:Nomina>
  </cfdi:Complemento>
</cfdi:Comprobante>
```

La versión timbrada agrega dentro de `cfdi:Complemento` el nodo `tfd:TimbreFiscalDigital`. Ese nodo no debe existir antes de la respuesta del PAC.

---

# Diseño técnico

## Tipos principales

Crear `apps/api/src/services/payroll-cfdi-xml.ts`.

```ts
export interface PayrollCfdiBuildInput {
	voucherId: string;
	fiscalSnapshotHash: string;
	issuer: PayrollCfdiIssuerSnapshot;
	receiver: PayrollCfdiReceiverSnapshot;
	payroll: PayrollCfdiPayrollSnapshot;
	perceptions: PayrollCfdiPerceptionLine[];
	deductions: PayrollCfdiDeductionLine[];
	otherPayments: PayrollCfdiOtherPaymentLine[];
	totals: PayrollCfdiTotals;
	series: string;
	folio: string;
	issuedAt: Date;
	fiscalArtifactManifest: FiscalArtifactManifest;
}

export interface PayrollCfdiBuildResult {
	voucherId: string;
	fiscalSnapshotHash: string;
	xmlWithoutSeal: string;
	xmlHash: string;
	validation: PayrollCfdiXmlValidationResult;
}
```

Si se implementa sellado local en esta fase:

```ts
export interface PayrollCfdiSealInput {
	xmlWithoutSeal: string;
	csdCertificatePemOrDer: Buffer;
	csdPrivateKeyPem: Buffer;
	csdPrivateKeyPassword: string;
}

export interface PayrollCfdiSealResult {
	sealedXml: string;
	noCertificado: string;
	certificadoBase64: string;
	sello: string;
	cadenaOriginal: string;
	sealedXmlHash: string;
}
```

Si el PAC elegido firma/sella internamente, dejar `CfdiSealer` como interfaz y mock en tests, pero el XML final estándar requiere `Sello`, `NoCertificado` y `Certificado` antes de timbrarse.

## Artifact manifest

Crear tipo:

```ts
export interface FiscalArtifactManifest {
	exerciseYear: number;
	cfdiVersion: '4.0';
	payrollComplementVersion: '1.2';
	source: 'SAT' | 'PAC';
	sourceName: string;
	sourcePublishedAt: string | null;
	cfdXsdUrl: string;
	payrollXsdUrl: string;
	tfdXsdUrl: string;
	catalogVersion: string;
	validationMatrixVersion: string;
	generatedAt: string;
}
```

Guardar este manifest junto al XML generado. Si un XML fue construido con catálogos/matriz antiguos, debe poder auditarse.

---

# Reglas de construcción XML

## 1. Orden de nodos

Respetar el orden XSD:

```txt
cfdi:Comprobante
  cfdi:Emisor
  cfdi:Receptor
  cfdi:Conceptos
    cfdi:Concepto
  cfdi:Complemento
    nomina12:Nomina
      nomina12:Emisor
      nomina12:Receptor
      nomina12:Percepciones
      nomina12:Deducciones       // solo si aplica
      nomina12:OtrosPagos        // si aplica, incluido subsidio causado con importe 0
      nomina12:Incapacidades     // futuro
```

No generar nodos vacíos.

## 2. Namespaces

Root mínimo antes de timbrado:

```xml
<cfdi:Comprobante
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xmlns:cfdi="http://www.sat.gob.mx/cfd/4"
  xmlns:nomina12="http://www.sat.gob.mx/nomina12"
  xsi:schemaLocation="http://www.sat.gob.mx/cfd/4 http://www.sat.gob.mx/sitio_internet/cfd/4/cfdv40.xsd http://www.sat.gob.mx/nomina12 http://www.sat.gob.mx/sitio_internet/cfd/nomina/nomina12.xsd">
```

Después del timbrado, el PAC agregará `tfd:TimbreFiscalDigital` con su namespace/schemaLocation.

## 3. Formatos

Crear helpers:

```ts
formatMoney(value): string       // 2 decimales exactos, no negativos.
formatPayrollDays(value): string // 3 decimales exactos.
formatDateKey(value): string     // YYYY-MM-DD.
formatCfdiDate(date): string     // YYYY-MM-DDTHH:mm:ss sin timezone suffix.
```

Reglas:

- No usar floats para totales finales. Usar integer cents o decimal library.
- No usar `toLocaleString`.
- No permitir `NaN`, `Infinity`, `-0.00` ni negativos.
- Moneda MXN: dos decimales.
- `NumDiasPagados`: tres decimales.
- Atributos opcionales se omiten si no aplican; no poner `""`.

## 4. Totales CFDI

```ts
nominaTotalPercepciones = sum(perception.taxedAmount + perception.exemptAmount);
nominaTotalDeducciones = sum(deductions.amount);
nominaTotalOtrosPagos = sum(otherPayments.amount);

cfdiSubTotal = nominaTotalPercepciones + nominaTotalOtrosPagos;
cfdiDescuento = nominaTotalDeducciones;
cfdiTotal = cfdiSubTotal - cfdiDescuento;
```

XML:

- `cfdi:Comprobante@SubTotal = cfdiSubTotal`.
- `cfdi:Comprobante@Descuento = cfdiDescuento` solo si `cfdiDescuento > 0`.
- `cfdi:Comprobante@Total = cfdiTotal`.
- `cfdi:Concepto@ValorUnitario = cfdiSubTotal`.
- `cfdi:Concepto@Importe = cfdiSubTotal`.
- `cfdi:Concepto@Descuento = cfdiDescuento` solo si `cfdiDescuento > 0`.

Validar:

```ts
SubTotal === TotalPercepciones + TotalOtrosPagos
Total === SubTotal - Descuento
Concepto.Importe === SubTotal
Concepto.Descuento === Descuento, si aplica
```

## 5. Concepto CFDI base

Generar exactamente:

```xml
<cfdi:Concepto
  ClaveProdServ="84111505"
  Cantidad="1"
  ClaveUnidad="ACT"
  Descripcion="Pago de nómina"
  ObjetoImp="01"
  ValorUnitario="{cfdiSubTotal}"
  Importe="{cfdiSubTotal}" />
```

Agregar `Descuento` solo si hay deducciones.

## 6. Nómina root

```xml
<nomina12:Nomina
  Version="1.2"
  TipoNomina="O"
  FechaPago="{paymentDateKey}"
  FechaInicialPago="{periodStartDateKey}"
  FechaFinalPago="{periodEndDateKey}"
  NumDiasPagados="{daysPaid}"
  TotalPercepciones="{totalPerceptions}"
  TotalDeducciones="{totalDeductions if > 0}"
  TotalOtrosPagos="{totalOtherPayments if otherPayments node exists or amount > 0}">
```

Para subsidio causado con `Importe=0.00`, sí debe existir `TotalOtrosPagos="0.00"` si existe nodo `OtrosPagos`.

## 7. Nómina emisor

```xml
<nomina12:Emisor RegistroPatronal="{employerRegistrationNumber}" />
```

V1 requiere `RegistroPatronal`. No generar XML sin ese dato.

## 8. Nómina receptor

Mapear desde `EmployeeFiscalProfile` snapshot:

```xml
<nomina12:Receptor
  Curp="{curp}"
  NumSeguridadSocial="{nss}"
  FechaInicioRelLaboral="{employmentStartDateKey}"
  Antigüedad="{computedSeniority}"
  TipoContrato="{contractTypeCode}"
  Sindicalizado="{unionized}"
  TipoJornada="{workdayTypeCode}"
  TipoRegimen="{payrollRegimeTypeCode}"
  NumEmpleado="{employeeNumber}"
  Departamento="{department}"
  Puesto="{position}"
  RiesgoPuesto="{riskPositionCode}"
  PeriodicidadPago="{paymentFrequencyCode}"
  CuentaBancaria="{bankAccount if present}"
  SalarioBaseCotApor="{salaryBaseContribution}"
  SalarioDiarioIntegrado="{integratedDailySalary}"
  ClaveEntFed="{federalEntityCode}" />
```

### Antigüedad

Implementar función:

```ts
computePayrollSeniority({
  employmentStartDateKey,
  periodEndDateKey,
}): string
```

Para el fixture de referencia:

```txt
employmentStartDateKey = 2015-05-18
periodEndDateKey = 2026-04-19
resultado esperado = P570W
```

Regla v1 segura:

```ts
inclusiveDays = differenceInCalendarDays(periodEnd, start) + 1;

if (inclusiveDays % 7 === 0) {
	return `P${inclusiveDays / 7}W`;
}

return `P${inclusiveDays}D`;
```

Justificación: el atributo acepta duración ISO 8601 en semanas o en años/meses/días. El ejemplo real usa semanas y el periodo inclusivo produce exactamente 570 semanas. Para casos donde no hay múltiplo exacto de 7, usar días evita redondear de más o de menos. Antes de producción, validar esta regla con el PAC elegido para reingresos, antigüedad menor a una semana y empleados asimilados.

## 9. Percepciones

No usar una sola percepción agregada si existen conceptos reales. El XML debe preservar breakdown:

```xml
<nomina12:Percepciones
  TotalSueldos="{sum salary perceptions}"
  TotalGravado="{sum taxed}"
  TotalExento="{sum exempt}">
  <nomina12:Percepcion
    TipoPercepcion="{satTypeCode}"
    Clave="{employerCode}"
    Concepto="{conceptLabel}"
    ImporteGravado="{taxedAmount}"
    ImporteExento="{exemptAmount}" />
</nomina12:Percepciones>
```

Reglas:

- `ImporteGravado + ImporteExento > 0`.
- No permitir ambos en cero.
- No permitir negativos.
- `TotalGravado` suma `ImporteGravado`.
- `TotalExento` suma `ImporteExento`.
- Para sueldo ordinario y séptimo día del fixture:
    - `Sueldo`: `TipoPercepcion=001`, `Clave=001`, `Gravado=1890.24`, `Exento=0.00`.
    - `Séptimo día`: `TipoPercepcion=001`, `Clave=003`, `Gravado=315.04`, `Exento=0.00`.

Si la corrida solo tiene `fiscalGrossPay` agregado y no tiene breakdown, bloquear:

```txt
PERCEPTION_BREAKDOWN_REQUIRED_FOR_XML
```

## 10. Deducciones

Generar solo si hay deducciones.

```xml
<nomina12:Deducciones
  TotalOtrasDeducciones="{sum non-ISR deductions if > 0}"
  TotalImpuestosRetenidos="{sum ISR deductions if > 0}">
  <nomina12:Deduccion
    TipoDeduccion="{satTypeCode}"
    Clave="{employerCode}"
    Concepto="{conceptLabel}"
    Importe="{amount}" />
</nomina12:Deducciones>
```

Reglas:

- `TipoDeduccion="002"` ISR cuenta para `TotalImpuestosRetenidos`.
- Las demás deducciones cuentan para `TotalOtrasDeducciones`.
- Omitir atributos de totales si el valor es cero, salvo que XSD/PAC exija presencia.
- Ninguna deducción sin mapping SAT.
- Ningún importe negativo.

## 11. OtrosPagos y subsidio

Para subsidio causado:

```xml
<nomina12:OtrosPagos>
  <nomina12:OtroPago
    TipoOtroPago="002"
    Clave="035"
    Concepto="Subsidio para el empleo del Decreto que otorga el subsidio para el empleo (DOF 1 de mayo de 2024)"
    Importe="0.00">
    <nomina12:SubsidioAlEmpleo SubsidioCausado="123.34" />
  </nomina12:OtroPago>
</nomina12:OtrosPagos>
```

Reglas:

- `Importe` debe ser `0.00` para subsidio causado conforme al criterio SAT del Decreto 2024.
- `SubsidioCausado` debe ser el monto calculado por el servicio fiscal.
- `TotalOtrosPagos` debe sumar el atributo `Importe`, por lo tanto puede ser `0.00`.
- No sumar `SubsidioCausado` al neto del CFDI.

---

# Validaciones antes de generar XML

Crear:

```ts
validatePayrollCfdiXmlInput(input: PayrollCfdiBuildInput): FiscalIssue[]
```

Bloquear con errores:

```txt
XML_ISSUER_RFC_REQUIRED
XML_ISSUER_NAME_REQUIRED
XML_ISSUER_REGIME_REQUIRED
XML_EXPEDITION_POSTAL_CODE_REQUIRED
XML_RECEIVER_RFC_REQUIRED
XML_RECEIVER_NAME_REQUIRED
XML_RECEIVER_POSTAL_CODE_REQUIRED
XML_RECEIVER_REGIME_REQUIRED
XML_RECEIVER_CURP_REQUIRED
XML_RECEIVER_NSS_REQUIRED
XML_EMPLOYMENT_START_DATE_REQUIRED
XML_EMPLOYER_REGISTRATION_REQUIRED
XML_PAYMENT_DATE_REQUIRED
XML_PERIOD_DATES_REQUIRED
XML_DAYS_PAID_REQUIRED
XML_PERCEPTION_BREAKDOWN_REQUIRED
XML_UNMAPPED_CONCEPT
XML_NEGATIVE_AMOUNT
XML_TOTALS_MISMATCH
XML_SUBSIDY_AMOUNT_MUST_BE_ZERO
XML_REAL_PAYROLL_COMPLEMENT_FORBIDDEN
XML_UNSUPPORTED_PAYROLL_TYPE
XML_CATALOG_CODE_INVALID
```

Condición crítica:

```ts
if ('realPayrollComplementPay' in input || containsDualPayrollFields(input)) {
  throw/block XML_REAL_PAYROLL_COMPLEMENT_FORBIDDEN;
}
```

---

# Persistencia

Crear tabla separada para artefactos XML, no sobrecargar `payroll_fiscal_voucher`:

```sql
CREATE TABLE payroll_cfdi_xml_artifact (
  id text PRIMARY KEY NOT NULL,
  payroll_fiscal_voucher_id text NOT NULL REFERENCES payroll_fiscal_voucher(id) ON DELETE cascade,
  organization_id text NOT NULL REFERENCES organization(id) ON DELETE cascade,
  employee_id text NOT NULL REFERENCES employee(id) ON DELETE cascade,
  artifact_kind text NOT NULL, -- XML_WITHOUT_SEAL | SEALED_XML | STAMPED_XML
  fiscal_snapshot_hash text NOT NULL,
  xml_hash text NOT NULL,
  xml text NOT NULL,
  fiscal_artifact_manifest jsonb NOT NULL,
  validation_errors jsonb DEFAULT '[]'::jsonb NOT NULL,
  generated_at timestamp DEFAULT now() NOT NULL,
  created_at timestamp DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX payroll_cfdi_xml_artifact_unique
ON payroll_cfdi_xml_artifact(payroll_fiscal_voucher_id, artifact_kind, fiscal_snapshot_hash);
```

Reglas:

- Si el snapshot fiscal cambia, el hash cambia y se debe regenerar XML.
- Si el voucher ya está `STAMPED`, no regenerar ni mutar.
- Si existe un `SEALED_XML` para el mismo hash, reutilizarlo idempotentemente.
- `STampedXml` devuelto por PAC puede seguir en `payroll_fiscal_voucher.stamped_xml`, pero guardar también artefacto para auditoría.

---

# Servicios

## `buildPayrollCfdiXml`

```ts
export async function buildPayrollCfdiXml(args: {
	voucher: PayrollFiscalVoucherForStamping;
	profiles: PayrollFiscalProfilesSnapshot;
	sequence: { series: string; folio: string };
	issuedAt: Date;
	fiscalArtifactManifest: FiscalArtifactManifest;
}): Promise<PayrollCfdiBuildResult>;
```

Debe:

1. Validar input.
2. Calcular totales.
3. Construir XML con builder XML, no concatenación manual.
4. Formatear atributos.
5. Calcular hash SHA-256 del XML canonical-ish output.
6. Validar XML básico parseable.
7. Retornar errores si hay mismatch.

## `sealPayrollCfdiXml`

Si se implementa sellado local:

```ts
export async function sealPayrollCfdiXml(args: {
	xmlWithoutSeal: string;
	csdSecretRef: string;
}): Promise<PayrollCfdiSealResult>;
```

Debe:

1. Cargar CSD/cert/llave desde secret manager.
2. Generar cadena original usando XSLT SAT vigente.
3. Firmar con SHA256 + llave privada CSD.
4. Inyectar:
    - `Sello`
    - `NoCertificado`
    - `Certificado`
5. Validar que el XML sellado sea parseable y listo para PAC.

No loggear:

- Password CSD.
- Llave privada.
- XML con datos personales en logs normales.

---

# Endpoints de Fase 3

## Generar XML pre-PAC

```http
POST /payroll/runs/:runId/fiscal-vouchers/:voucherId/xml
```

Permisos: payroll fiscal.

Body:

```json
{
	"issuedAt": "2026-04-17T09:01:05",
	"forceRegenerate": false
}
```

Respuesta:

```json
{
  "data": {
    "voucherId": "...",
    "artifactKind": "XML_WITHOUT_SEAL",
    "xmlHash": "...",
    "status": "VALID" | "BLOCKED",
    "errors": [],
    "warnings": []
  }
}
```

No devolver XML completo por default. Agregar endpoint separado de descarga con permisos.

## Descargar XML

```http
GET /payroll/runs/:runId/fiscal-vouchers/:voucherId/xml?kind=XML_WITHOUT_SEAL
```

Permisos: payroll fiscal.

- `Content-Type: application/xml`
- No disponible para usuarios sin permiso fiscal.
- No incluir complemento real.

---

# Tests obligatorios

## Unit tests de formato

- `formatMoney(2205.28) -> "2205.28"`
- `formatMoney(0) -> "0.00"`
- `formatMoney(-1)` bloquea.
- `formatPayrollDays(7) -> "7.000"`
- `formatCfdiDate(new Date(...))` no agrega timezone suffix.

## Unit tests de totales

Caso sin deducciones, con subsidio causado:

```txt
Percepciones = 2205.28
Deducciones = 0.00
OtrosPagos.Importe = 0.00
SubTotal = 2205.28
Total = 2205.28
Nomina.TotalOtrosPagos = 0.00
SubsidioCausado = 123.34
```

Caso con deducciones:

```txt
Percepciones = 3000.00
Deducciones ISR = 100.00
Deducciones IMSS = 50.00
OtrosPagos = 0.00
SubTotal = 3000.00
Descuento = 150.00
Total = 2850.00
Deducciones.TotalImpuestosRetenidos = 100.00
Deducciones.TotalOtrasDeducciones = 50.00
```

## Golden test derivado del XML real

Crear fixture sintético:

```ts
weeklyOrdinaryPayrollXmlFixture;
```

Validar:

- `cfdi:Comprobante@Version === "4.0"`
- `TipoDeComprobante === "N"`
- `MetodoPago === "PUE"`
- `Exportacion === "01"`
- `Moneda === "MXN"`
- `cfdi:Receptor@UsoCFDI === "CN01"`
- `cfdi:Concepto@ClaveProdServ === "84111505"`
- `cfdi:Concepto@ClaveUnidad === "ACT"`
- `cfdi:Concepto@ObjetoImp === "01"`
- `nomina12:Nomina@TipoNomina === "O"`
- `FechaPago === "2026-04-18"`
- `FechaInicialPago === "2026-04-13"`
- `FechaFinalPago === "2026-04-19"`
- `NumDiasPagados === "7.000"`
- `TotalPercepciones === "2205.28"`
- `TotalOtrosPagos === "0.00"`
- Two perceptions exist:
    - `Clave=001`, `Concepto=Sueldo`, `Gravado=1890.24`
    - `Clave=003`, `Concepto=Séptimo día`, `Gravado=315.04`
- One `OtroPago` exists:
    - `TipoOtroPago=002`
    - `Importe=0.00`
    - child `SubsidioCausado=123.34`
- No `tfd:TimbreFiscalDigital` before PAC.

## Negative tests

- Missing receiver CP blocks.
- Missing RegistroPatronal blocks.
- Missing perception breakdown blocks.
- `SubsidioCausado > 0` with `Importe != 0` blocks.
- Deducción sin SAT mapping blocks.
- Montos negativos block.
- `realPayrollComplementPay` in payload blocks.
- `TipoNomina=E` blocks in v1.
- XML generation after `STAMPED` blocks unless only downloading existing artifact.

## Optional XSD/PAC validation

Agregar script:

```bash
bun run fiscal:validate-payroll-xml -- apps/api/test-fixtures/payroll/weekly-redacted.xml
```

Este script debe:

1. Parsear XML.
2. Validar XSD si el entorno tiene validador.
3. Validar reglas internas.
4. Imprimir errores con paths de XML.

No hacer que CI falle por falta de herramienta externa si aún no está provisionada; sí correr validación interna siempre.

---

# Seguridad y privacidad

- No loggear XML completo en logs de producción.
- No loggear RFC/CURP/NSS/cuenta completa.
- No almacenar CSD private key ni password en DB común.
- No exponer XML a roles sin permiso fiscal.
- No incluir `realPayrollComplementPay` en ningún artefacto XML.
- No commitear XML/PDF real del usuario.

---

# Criterios de aceptación de Fase 3

- [ ] Existe builder XML determinístico.
- [ ] XML generado conserva namespaces/schemaLocation CFDI 4.0 + Nómina 1.2.
- [ ] XML generado usa breakdown real de percepciones.
- [ ] Subsidio causado usa `Importe="0.00"` y `SubsidioCausado`.
- [ ] Totales CFDI y Nómina amarran.
- [ ] XML no contiene datos dual-payroll reales.
- [ ] `tfd:TimbreFiscalDigital` no aparece antes del PAC.
- [ ] Se guardan artefactos XML con hash y manifest fiscal.
- [ ] Se bloquea si faltan datos fiscales.
- [ ] Se bloquea si hay conceptos no soportados.
- [ ] Tests golden y negativos pasan.
- [ ] No se usa fixture real con PII.

## Comandos finales

```bash
bun run lint:api
bun run check-types:api
bun run test:api:unit
bun run test:api:contract
git diff --check
```

## Nota operativa

Antes de producción, correr al menos un XML generado por esta fase contra sandbox del PAC elegido. El XML que pase tests internos pero falle PAC no debe considerarse fiscalmente listo.
