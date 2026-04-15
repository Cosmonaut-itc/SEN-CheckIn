# Prompt: Implementar Backlog de Nómina (4 ítems)

> **Instrucciones para el agente:** Este documento describe 4 tareas independientes del backlog de nómina. Cada una tiene su propio spec y plan de implementación. Deben ejecutarse en ramas independientes con PRs separados.

## Contexto del proyecto

Este es un sistema de nómina mexicano (SEN-CheckIn) con:
- **API:** Bun + Elysia en `apps/api/`
- **Web:** Next.js en `apps/web/`
- **Tests:** `bun run test:api:unit`, `bun run test:web:unit`
- **Types check:** `bun run check-types`
- **Monorepo:** Turborepo con `bun` como package manager

## Reglas generales para TODAS las tareas

1. **Rama independiente por tarea** — cada tarea crea su propia rama desde `main`
2. **TDD estricto** — escribir el test que falla ANTES de implementar
3. **Commits atómicos** — un commit por cambio lógico, mensajes descriptivos en inglés con prefijos convencionales (`feat:`, `fix:`, `test:`, `chore:`)
4. **Co-author en commits:** `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
5. **Verificar tests al final** — correr la suite completa antes de crear el PR
6. **Crear PR hacia main** — con título conciso y body detallado usando `gh pr create`
7. **Usar subagent-driven development** — ejecutar cada tarea como un subagente independiente usando la skill `superpowers:subagent-driven-development`

## Las 4 tareas

### Tarea 1: BUG-1 — Sábado no cuenta como día pagado en vacaciones

**Spec:** `docs/superpowers/specs/2026-04-14-bug1-saturday-vacation-pay-design.md`
**Plan:** `docs/superpowers/plans/2026-04-14-bug1-saturday-vacation-pay.md`
**Rama:** `fix/saturday-vacation-pay`
**Resumen:** Cuando `countSaturdayAsWorkedForSeventhDay` está activo y un empleado L-V toma vacaciones que abarcan sábado, ese sábado debe pagarse como bonus sin consumir saldo de vacaciones.
**Archivos clave:** `apps/api/src/services/vacations.ts`, `apps/api/src/services/payroll-calculation.ts`, `apps/api/src/routes/payroll.ts`

---

### Tarea 2: BUG-2 — Recibo muestra salario real como percepciones gravadas

**Spec:** `docs/superpowers/specs/2026-04-14-bug2-fiscal-receipt-display-design.md`
**Plan:** `docs/superpowers/plans/2026-04-14-bug2-fiscal-receipt-display.md`
**Rama:** `fix/fiscal-receipt-display`
**Resumen:** El recibo PDF y CSV de nómina muestran `grossPay` (real) como "percepciones gravadas" cuando dual payroll está activo. Debe mostrar `fiscalGrossPay` como gravable, `complementPay` como complemento, y `totalRealPay` como total.
**Archivos clave:** `apps/web/lib/payroll-receipts/build-payroll-receipt-pdf.ts`, `apps/web/app/(dashboard)/payroll/payroll-client.helpers.ts`, `apps/web/messages/es.json`

---

### Tarea 3: BUG-3 — Empleados sin días de vacaciones completos

**Spec:** `docs/superpowers/specs/2026-04-14-bug3-vacation-full-entitlement-design.md`
**Plan:** `docs/superpowers/plans/2026-04-14-bug3-vacation-full-entitlement.md`
**Rama:** `fix/vacation-full-entitlement`
**Resumen:** El sistema usa accrual lineal para vacaciones (los días se devangan gradualmente durante el año). Debe otorgar el 100% de los días al inicio de cada año de servicio. Cambio de una línea en `calculateVacationAccrual()`.
**Archivos clave:** `apps/api/src/services/vacations.ts`, `apps/api/src/services/vacations.test.ts`

---

### Tarea 4: FEAT-1 — Formato de descarga del checador por persona

**Spec:** `docs/superpowers/specs/2026-04-14-feat1-attendance-export-per-person-design.md`
**Plan:** `docs/superpowers/plans/2026-04-14-feat1-attendance-export-per-person.md`
**Rama:** `feat/attendance-export-per-person`
**Resumen:** Cambiar el CSV del checador de una fila por evento a una fila por empleado por día, con primera entrada, última salida y horas totales calculadas automáticamente.
**Archivos clave:** `apps/web/app/(dashboard)/attendance/attendance-client.tsx`, nueva `attendance-export-helpers.ts`

---

## Orden de ejecución sugerido

Las 4 tareas son **independientes entre sí** y pueden ejecutarse en paralelo. Si se ejecutan secuencialmente, el orden sugerido es:

1. **BUG-3** (más simple, una línea de cambio + tests)
2. **BUG-2** (cambios de frontend/PDF, complejidad media)
3. **FEAT-1** (feature nuevo, archivo nuevo, tests nuevos)
4. **BUG-1** (más complejo, toca API + routes + services)

## Cómo ejecutar

Para ejecutar todas las tareas en paralelo usando subagent-driven development:

```
Ejecuta las 4 tareas del backlog de nómina definidas en docs/superpowers/plans/2026-04-14-implement-all-payroll-backlog.md

Cada tarea tiene su propio plan detallado con pasos checkbox. Usa subagent-driven development para dispatch un agente por tarea. Cada agente debe:
1. Leer el plan correspondiente
2. Crear la rama desde main
3. Seguir el plan paso a paso (TDD, commits atómicos)
4. Crear el PR al final

Las 4 tareas son independientes y pueden ejecutarse en paralelo.
```

Para ejecutar una tarea individual:

```
Ejecuta la tarea BUG-3 del backlog de nómina.
Spec: docs/superpowers/specs/2026-04-14-bug3-vacation-full-entitlement-design.md
Plan: docs/superpowers/plans/2026-04-14-bug3-vacation-full-entitlement.md
Sigue el plan paso a paso usando TDD y commits atómicos.
```
