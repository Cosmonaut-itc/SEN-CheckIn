ALTER TABLE "organization_legal_branding"
	ADD COLUMN "acta_state" text,
	ADD COLUMN "acta_employer_treatment" text,
	ADD COLUMN "acta_employer_name" text,
	ADD COLUMN "acta_employer_position" text,
	ADD COLUMN "acta_employee_treatment" text;--> statement-breakpoint

UPDATE "organization_legal_template"
SET
	"status" = 'DRAFT',
	"updated_at" = now()
WHERE
	"kind"::text = 'ACTA_ADMINISTRATIVA'
	AND "status" = 'PUBLISHED';--> statement-breakpoint

INSERT INTO "organization_legal_template" (
	"id",
	"organization_id",
	"kind",
	"version_number",
	"status",
	"html_content",
	"variables_schema_snapshot",
	"branding_snapshot",
	"created_by_user_id",
	"published_by_user_id",
	"published_at",
	"created_at",
	"updated_at"
)
SELECT
	gen_random_uuid()::text,
	version_source.organization_id,
	version_source.kind,
	version_source.next_version_number,
	'PUBLISHED',
	$acta$
<div class="acta-admin" style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.4;">
  <h2 style="text-align:center; margin: 0 0 18px 0;">ACTA ADMINISTRATIVA</h2>

  <p>
    En la Ciudad de {{employee.locationName}}, {{acta.state}}, siendo las {{document.generatedTimeLabel}} horas del día {{document.generatedDateLong}}, en las oficinas de la empresa
    {{acta.companyName}} Sucursal {{employee.locationName}}, por una parte el(la) {{acta.employerTreatment}} {{acta.employerName}} en su carácter de
    {{acta.employerPosition}} por la parte patronal, además de los testigos Testigo 1: (nombre escrito a mano) y Testigo 2: (nombre escrito a mano) a quienes les constan
    los hechos siguientes ya que vieron y estuvieron en el lugar de los acontecimientos:
  </p>

  <p>
    Se levanta la presente Acta Administrativa con motivo de que usted {{acta.employeeTreatment}} {{employee.fullName}} ha incurrido
    en las siguientes faltas al Contrato Individual de Trabajo y/o Ley Federal del Trabajo y/o Reglamento Interior de Trabajo,
    mismas que se narran a continuación:
  </p>

  <p><strong>Hechos / Faltas:</strong></p>
  <p style="white-space: pre-line; margin-top: 6px;">{{disciplinary.reason}}</p>

  <p>
    La presente se redacta para constancia y para que surta sus efectos legales correspondientes como soporte para futuras
    acciones que se puedan entablar en contra del trabajador. El trabajador firma de conformidad la presente aceptando ser
    responsable del contenido de esta acta.
  </p>

  <p style="text-align:center; margin-top: 18px;">
    {{employee.locationName}}, {{acta.state}}, {{document.generatedDateLong}}
  </p>

  <p style="margin-top: 22px;"><strong>TRABAJADOR(A).</strong></p>
  <p>
    __________________________________<br>
    {{employee.fullName}}
  </p>

  <table style="width:100%; margin-top: 26px; border-collapse: collapse;">
    <tr>
      <td style="width:50%; vertical-align:top; padding-right: 12px;">
        <strong>Testigo.</strong><br><br>
        __________________________________<br>
        Testigo 1: (nombre escrito a mano)
      </td>
      <td style="width:50%; vertical-align:top; padding-left: 12px;">
        <strong>Testigo.</strong><br><br>
        __________________________________<br>
        Testigo 2: (nombre escrito a mano)
      </td>
    </tr>
  </table>
</div>
$acta$,
	'{"employee":{"fullName":"string","code":"string","rfc":"string|null","nss":"string|null","jobPositionName":"string|null","locationName":"string|null","hireDate":"string|null"},"document":{"generatedDate":"string","generatedDateLong":"string","generatedTimeLabel":"string"},"disciplinary":{"folio":"string","incidentDate":"string","reason":"string","outcome":"string","policyReference":"string|null","suspensionRange":"string|null"},"acta":{"companyName":"string","state":"string","employerTreatment":"string","employerName":"string","employerPosition":"string","employeeTreatment":"string"}}'::jsonb,
	jsonb_build_object(
		'displayName', branding.display_name,
		'headerText', branding.header_text,
		'actaState', branding.acta_state,
		'actaEmployerTreatment', branding.acta_employer_treatment,
		'actaEmployerName', branding.acta_employer_name,
		'actaEmployerPosition', branding.acta_employer_position,
		'actaEmployeeTreatment', branding.acta_employee_treatment
	),
	NULL,
	NULL,
	now(),
	now(),
	now()
FROM (
	SELECT
		template.organization_id,
		template.kind,
		MAX(template.version_number) + 1 AS next_version_number
	FROM "organization_legal_template" AS template
	WHERE template.kind::text = 'ACTA_ADMINISTRATIVA'
	GROUP BY template.organization_id, template.kind
) AS version_source
LEFT JOIN "organization_legal_branding" AS branding
	ON branding.organization_id = version_source.organization_id;--> statement-breakpoint
