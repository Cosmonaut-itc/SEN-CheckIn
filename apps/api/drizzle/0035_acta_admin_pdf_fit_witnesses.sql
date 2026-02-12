UPDATE "organization_legal_template"
SET
	"html_content" =
$acta_pdf_fit$
<div class="acta-admin" style="font-family: Arial, sans-serif; font-size: 16px; line-height: 1.2; color: #000; width: 100%; margin: 0 auto;">
  <p style="margin: 0 0 66px 0; text-align: center; font-weight: 700; font-size: 16px;">ACTA ADMINISTRATIVA</p>

  <p style="margin: 0 0 30px 0; text-align: center;">
    En la Ciudad de {{employee.locationName}} {{acta.state}}, siendo las {{document.generatedTimeLabel}} horas del día {{document.generatedDateLong}}, en las oficinas de la empresa {{acta.companyName}} Sucursal {{employee.locationName}} por una parte el {{acta.employerTreatment}} {{acta.employerName}} en su carácter de {{acta.employerPosition}} por la parte patronal, además de los testigos Testigo 1: (nombre escrito a mano) y Testigo 2: (nombre escrito a mano) a quienes les constan los hechos siguientes ya que vieron y estuvieron en el lugar de los acontecimientos:
  </p>

  <p style="margin: 0 0 30px 0; text-align: center;">
    Se levanta la presente Acta administrativa con motivo de que usted {{acta.employeeTreatment}} {{employee.fullName}} ha incurrido en las siguientes faltas al Contrato Individual de Trabajo y/o Ley Federal del Trabajo y/o Reglamento Interior de trabajo, mismas que se narran a continuación:
  </p>

  <p style="margin: 0 0 34px 0; text-align: center; white-space: pre-line;">-{{disciplinary.reason}}</p>

  <p style="margin: 0 0 48px 0; text-align: center;">
    La presente que se redacta para Constancia y surta sus efectos legales correspondientes como soporte para futuras acciones que se puedan entablar en contra del trabajador. El trabajador firma de conformidad la presente aceptando ser responsable del contenido de esta acta.
  </p>

  <p style="margin: 0 0 45px 0; text-align: center; font-weight: 700;">
    {{employee.locationName}} {{acta.state}}, {{document.generatedDateLong}}
  </p>

  <p style="margin: 0 0 28px 0; text-align: center;">TRABAJADOR.</p>
  <p style="margin: 0 0 8px 0; text-align: center;">__________________________________</p>
  <p style="margin: 0; text-align: center;">{{employee.fullName}}</p>

  <table style="width: 100%; margin-top: 16px; border-collapse: collapse;">
    <tr>
      <td style="width: 50%; vertical-align: top; text-align: left;">Testigo.</td>
      <td style="width: 50%; vertical-align: top; text-align: right;">Testigo.</td>
    </tr>
    <tr>
      <td style="padding-top: 18px; padding-right: 16px;">
        <div style="border-top: 1px solid #000; width: 86%;"></div>
      </td>
      <td style="padding-top: 18px; padding-left: 16px; text-align: right;">
        <div style="border-top: 1px solid #000; width: 86%; margin-left: auto;"></div>
      </td>
    </tr>
    <tr>
      <td style="padding-top: 8px; padding-right: 16px;">Testigo 1: (nombre escrito a mano)</td>
      <td style="padding-top: 8px; padding-left: 16px; text-align: right;">Testigo 2: (nombre escrito a mano)</td>
    </tr>
  </table>
</div>
$acta_pdf_fit$,
	"updated_at" = now()
WHERE
	"kind"::text = 'ACTA_ADMINISTRATIVA'
	AND "html_content" LIKE '%line-height: 1.22; color: #000; width: 100%; margin: 0 auto;%'
	AND "html_content" LIKE '%margin: 0 0 88px 0; text-align: center; font-weight: 700;%'
	AND "html_content" LIKE '%margin-top: 64px; border-collapse: collapse;%'
	AND "html_content" LIKE '%Testigo 1: (nombre escrito a mano)%'
	AND "html_content" LIKE '%Testigo 2: (nombre escrito a mano)%';
