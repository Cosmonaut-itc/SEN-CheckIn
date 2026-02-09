---
name: Release 13.1 - Cierre feriados + aviso nomina
overview: Cerrar los pendientes de Release 13 para considerar la feature completa contra plan (conflictos UI, motivo obligatorio API, fallback ultimo aprobado, cobertura de pruebas y QA final E2E completo).
todos:
    - id: api-reason-required
      content: Hacer obligatorio `reason` en approve/reject de sync (`holidaySyncDecisionSchema`) y mantener validacion consistente con UI.
      status: pending
    - id: ui-conflict-panel
      content: Agregar panel de conflictos en Payroll Holidays UI con visibilidad de `conflictReason`, fuente y decision por corrida.
      status: pending
      dependencies:
          - api-reason-required
    - id: provider-fallback-last-approved
      content: Ajustar sync/fallback para garantizar que nomina use ultimo calendario aprobado cuando existan pendientes o falla de proveedor.
      status: pending
    - id: web-unit-holidays-depth
      content: Ampliar pruebas unitarias de `payroll-holidays-section` para filtros, estados, aprobacion/rechazo y errores parciales de import CSV.
      status: pending
      dependencies:
          - ui-conflict-panel
    - id: e2e-suite-stability
      content: Corregir spec existente `ptu-aguinaldo` (espera PDF vs ZIP) para que `bun run test:web:e2e` completo quede en verde.
      status: pending
    - id: qa-final-gate
      content: Ejecutar y documentar `bun run lint`, `bun run check-types`, `bun run test:api:unit`, `bun run test:api:contract`, `bun run test:web:unit`, `bun run test:web:e2e`.
      status: pending
      dependencies:
          - api-reason-required
          - ui-conflict-panel
          - provider-fallback-last-approved
          - web-unit-holidays-depth
          - e2e-suite-stability
---

# Release 13.1 - Pendientes de cierre

## Objetivo

- Cerrar los puntos faltantes para declarar completada la implementacion de feriados y aviso de feriado en nomina conforme al plan original.

## Pendientes funcionales

1. API debe exigir motivo en decisiones de aprobacion/rechazo (`approve/reject`) y no solo UI.
2. UI de ajustes debe mostrar conflictos importados (`conflictReason`) en una vista administrable de revision.
3. Motor de sync/calculo debe preservar el comportamiento "ultimo aprobado" ante pendientes o error de proveedor.

## Pendientes de calidad

1. Aumentar cobertura unitaria web del modulo de feriados en escenarios de filtros, estados, decisiones y CSV parcial.
2. Dejar verde la suite E2E completa (`test:web:e2e`) corrigiendo el caso PTU/Aguinaldo que hoy falla por formato esperado de descarga.

## Criterio de salida

- Todos los checks del gate en verde.
- PR con evidencia de pruebas y resumen de cambios de cierre.
