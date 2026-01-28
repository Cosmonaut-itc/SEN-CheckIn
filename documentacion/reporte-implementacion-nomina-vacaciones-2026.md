# Reporte de implementacion: Nomina y Vacaciones 2026

## Nomina (MX)

- Se agregaron resolvers por fecha para UMA, salario minimo, tablas ISR 2026, subsidio al empleo 2026 y tasas patronales C&V 2026.
- El calculo de impuestos ahora suma por dia los componentes dependientes de UMA (tope 25 UMA, excedente 3 UMA, cuota fija E&M, subsidio diario), permitiendo periodos que cruzan 01-feb-2026 sin romper el fixture 2025.
- La seleccion de tabla ISR usa la fecha de fin del periodo y se conserva el orden de redondeo por concepto.
- El warning de salario minimo se evalua con el minimo vigente segun fecha del periodo.

## Vacaciones

- Se implemento devengo lineal con dias reales del anio vacacional vigente y se expone `accruedDays` en el balance.
- La disponibilidad ahora usa `floor(accruedDays) - usados - pendientes` con clamp a cero.
- La validacion de solicitudes compara contra dias devengados al fin de la solicitud y ajusta el rango de anio vacacional al ultimo aniversario.

## Tipos y UI

- Se amplio `EmployeeVacationBalance` para incluir `accruedDays` y se actualizaron tooltips/labels en la web.
- La pantalla de nomina incluye un recordatorio con salario minimo, UMA, subsidio, ISR 2026 y C&V patronal 2026.

## Pruebas agregadas/actualizadas

- `apps/api/src/services/payroll-calculation.test.ts`: ISR 2026, subsidio enero vs febrero 2026 y switch UMA al 01-feb-2026.
- `apps/api/src/services/vacations.test.ts`: devengo lineal y formula de disponibilidad.

## Recordatorios

- Seguir `AGENTS.md`.
- Ejecutar `bun run lint` y `bun run check-types` (o comandos scoped si aplica).
