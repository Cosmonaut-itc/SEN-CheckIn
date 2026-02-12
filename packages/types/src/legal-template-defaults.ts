/**
 * Legal template kinds supported by default HTML builders.
 */
export type DefaultLegalTemplateKind =
	| 'CONTRACT'
	| 'NDA'
	| 'ACTA_ADMINISTRATIVA'
	| 'CONSTANCIA_NEGATIVA_FIRMA';

const DEFAULT_CONTRACT_TEMPLATE_HTML = `
<h1>Contrato Laboral</h1>
<p>Empleado: {{employee.fullName}}</p>
<p>Código: {{employee.code}}</p>
<p>Puesto: {{employee.jobPositionName}}</p>
<p>Ubicación: {{employee.locationName}}</p>
<p>RFC: {{employee.rfc}}</p>
<p>NSS: {{employee.nss}}</p>
<p>Fecha de ingreso: {{employee.hireDate}}</p>
<p>Fecha de generación: {{document.generatedDate}}</p>
`.trim();

const DEFAULT_NDA_TEMPLATE_HTML = `
<h1>Convenio de Confidencialidad (NDA)</h1>
<p>Empleado: {{employee.fullName}}</p>
<p>Código: {{employee.code}}</p>
<p>Puesto: {{employee.jobPositionName}}</p>
<p>RFC: {{employee.rfc}}</p>
<p>NSS: {{employee.nss}}</p>
<p>Fecha de generación: {{document.generatedDate}}</p>
`.trim();

const DEFAULT_ACTA_TEMPLATE_HTML = `
<div class="acta-admin" data-layout="acta-classic-v1" style="font-family: Helvetica, Arial, sans-serif; font-size: 16px; line-height: 1.25; color: #000; width: 100%; margin: 0 auto;">
  <p data-acta-role="title" style="margin: 0 0 66px 0; text-align: center; font-weight: 700; font-size: 16px;">ACTA ADMINISTRATIVA</p>

  <p data-acta-role="intro" style="margin: 0 0 30px 0; text-align: center;">
    En la Ciudad de {{employee.locationName}} {{acta.state}}, siendo las {{document.generatedTimeLabel}} horas del día {{document.generatedDateLong}}, en las oficinas de la empresa {{acta.companyName}} Sucursal {{employee.locationName}} por una parte el {{acta.employerTreatment}} {{acta.employerName}} en su carácter de {{acta.employerPosition}} por la parte patronal, además de los testigos ____________________ y ____________________ a quienes les constan los hechos siguientes ya que vieron y estuvieron en el lugar de los acontecimientos:
  </p>

  <p data-acta-role="notice" style="margin: 0 0 30px 0; text-align: center;">
    Se levanta la presente Acta administrativa con motivo de que usted {{acta.employeeTreatment}} {{employee.fullName}} ha incurrido en las siguientes faltas al Contrato Individual de Trabajo y/o Ley Federal del Trabajo y/o Reglamento Interior de trabajo, mismas que se narran a continuación:
  </p>

  <p data-acta-role="reason" style="margin: 0 0 34px 0; text-align: center; white-space: pre-line;">-{{disciplinary.reason}}</p>

  <p data-acta-role="closing" style="margin: 0 0 48px 0; text-align: center;">
    La presente que se redacta para Constancia y surta sus efectos legales correspondientes como soporte para futuras acciones que se puedan entablar en contra del trabajador. El trabajador firma de conformidad la presente aceptando ser responsable del contenido de esta acta.
  </p>

  <p data-acta-role="date" style="margin: 0 0 45px 0; text-align: center; font-weight: 700;">
    {{employee.locationName}} {{acta.state}}, {{document.generatedDateLong}}
  </p>

  <p data-acta-role="worker-label" style="margin: 0 0 28px 0; text-align: center;">TRABAJADOR.</p>
  <p data-acta-role="worker-name" style="margin: 0 0 24px 0; text-align: center;">{{employee.fullName}}</p>
  <p data-acta-role="witness-left-label" style="margin: 0; text-align: left;">Testigo.</p>
  <p data-acta-role="witness-right-label" style="margin: 0; text-align: right;">Testigo.</p>
  <p data-acta-role="witness-left-name" style="margin: 12px 0 0 0; text-align: left;"></p>
  <p data-acta-role="witness-right-name" style="margin: 12px 0 0 0; text-align: right;"></p>
</div>
`.trim();

const DEFAULT_NEGATIVE_SIGNATURE_TEMPLATE_HTML = `
<h1>Constancia de Negativa de Firma</h1>
<p>Folio de medida: {{disciplinary.folio}}</p>
<p>Empleado: {{employee.fullName}}</p>
<p>Código: {{employee.code}}</p>
<p>Motivo del acta: {{disciplinary.reason}}</p>
<p>Resultado aplicado: {{disciplinary.outcome}}</p>
<p>Fecha del incidente: {{disciplinary.incidentDate}}</p>
<p>Fecha de generación: {{document.generatedDate}}</p>
`.trim();

const DEFAULT_TEMPLATE_BY_KIND: Record<DefaultLegalTemplateKind, string> = {
	CONTRACT: DEFAULT_CONTRACT_TEMPLATE_HTML,
	NDA: DEFAULT_NDA_TEMPLATE_HTML,
	ACTA_ADMINISTRATIVA: DEFAULT_ACTA_TEMPLATE_HTML,
	CONSTANCIA_NEGATIVA_FIRMA: DEFAULT_NEGATIVE_SIGNATURE_TEMPLATE_HTML,
};

/**
 * Returns the canonical default HTML template by legal document kind.
 *
 * @param kind - Legal document kind
 * @returns Default HTML template
 */
export function buildDefaultLegalTemplateHtml(kind: DefaultLegalTemplateKind): string {
	return DEFAULT_TEMPLATE_BY_KIND[kind];
}
