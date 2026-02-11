# Release 13: Actas administrativas por empleado

Fecha: 2026-02-09  
Estado: Implementado (API + Web + migración + pruebas base)

## Alcance funcional

- Se agrega un módulo disciplinario independiente del onboarding documental.
- Se soporta flujo completo por empleado:
  - alta y edición de medida disciplinaria,
  - generación de acta administrativa,
  - carga de acta firmada físicamente,
  - flujo de negativa de firma con constancia,
  - adjuntos de evidencia,
  - cierre e inmutabilidad de la medida.
- Se mantiene separado el checklist de onboarding (`documentProgressPercent` / `documentMissingCount`) sin contaminación con documentos disciplinarios.
- Se agrega KPI operativo en dashboard disciplinario y tab por empleado.
- Se integra feature flag por organización (`enableDisciplinaryMeasures`) para habilitación controlada.
- Se agrega integración de escalación a borrador de terminación cuando outcome = `termination_process`.

## Endpoints nuevos/actualizados

### Nómina / feature flag

- `GET /payroll-settings`
- `PUT /payroll-settings`

Campos nuevos:
- `enableDisciplinaryMeasures: boolean`

### Dominio disciplinario

- `GET /disciplinary-measures`
- `GET /disciplinary-measures/kpis`
- `POST /disciplinary-measures`
- `GET /disciplinary-measures/:id`
- `PUT /disciplinary-measures/:id`
- `POST /disciplinary-measures/:id/generate-acta`
- `POST /disciplinary-measures/:id/signed-acta/presign`
- `POST /disciplinary-measures/:id/signed-acta/confirm`
- `POST /disciplinary-measures/:id/refusal/generate`
- `POST /disciplinary-measures/:id/refusal/presign`
- `POST /disciplinary-measures/:id/refusal/confirm`
- `POST /disciplinary-measures/:id/attachments/presign`
- `POST /disciplinary-measures/:id/attachments/confirm`
- `DELETE /disciplinary-measures/:id/attachments/:attachmentId`
- `POST /disciplinary-measures/:id/close`
- `GET /disciplinary-measures/:id/documents/:documentVersionId/url`

### Empleados / terminación

- `GET /employees/:id/termination/draft`
- Confirmación de baja: marca draft en estado `CONSUMED` cuando aplica.

## Reglas legales aplicadas

Basado en `/Users/cosmonaut/VSCODE/PROJECTS/SEN-CheckIn/documentacion/actas-administrativas.md`:

- Procedimiento disciplinario con derecho de audiencia previo (alineado con LFT Art. 423 fr. X).
- Límite de suspensión: máximo 8 días.
- Separación entre acta administrativa y aviso de rescisión (Art. 47) para escalaciones de terminación.
- Trazabilidad documental y constancia de negativa de firma cuando la persona trabajadora no firma.
- Tratamiento de evidencia y datos personales bajo minimización y finalidad laboral.

## Migración y rollout

### Migración

- Script: `apps/api/drizzle/0028_disciplinary_measures.sql`
- Cambios:
  - Nuevos enums disciplinarios.
  - Nuevas tablas:
    - `organization_disciplinary_folio_counter`
    - `employee_disciplinary_measure`
    - `employee_disciplinary_document_version`
    - `employee_disciplinary_attachment`
    - `employee_termination_draft`
  - Columna nueva:
    - `payroll_setting.enable_disciplinary_measures boolean not null default false`

### Rollout recomendado

1. Desplegar migración con flag en `false`.
2. Verificar `GET /payroll-settings` en organizaciones críticas.
3. Publicar/revisar plantillas disciplinarias por organización.
4. Habilitar flag por organización (owner/admin) de forma gradual.
5. Monitorear KPIs disciplinarios y errores de upload/documentación.

## Riesgos heredados del merge #42 y mitigaciones

### Riesgo 1: regresión en flujo NDA/Contrato

- Mitigación:
  - Restricción explícita para impedir `sign-digital` en `ACTA_ADMINISTRATIVA` y `CONSTANCIA_NEGATIVA_FIRMA`.
  - Tests de no regresión en documentos de empleados.
  - Separación de dominios (onboarding vs disciplinario) en rutas y tipos.

### Riesgo 2: acoplamiento de checklist con medidas disciplinarias

- Mitigación:
  - No se modifica `employee_document_requirement_key` para flujo disciplinario.
  - Documentos disciplinarios viven en tablas dedicadas y no alteran progreso onboarding.

### Riesgo 3: cierre inconsistente sin soporte documental

- Mitigación:
  - Cierre exige evidencia documental según firma:
    - `signed_physical` requiere acta firmada,
    - `refused_to_sign` requiere constancia de negativa.
  - Estado `CLOSED` inmutable.

### Riesgo 4: dependencia de infraestructura de bucket

- Mitigación:
  - Validaciones tempranas de tipo/tamaño.
  - Errores normalizados cuando faltan dependencias bucket/AWS SDK.
  - Pruebas de contrato con mock de bucket para validar flujo lógico de API.
