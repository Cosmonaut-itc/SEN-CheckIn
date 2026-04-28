# Release 16 - Cobertura minima por puesto

## Resumen

Se agrega la configuracion de minimos de personal por sucursal y puesto, con consulta diaria de cobertura y estadisticas de los ultimos 30 dias para apoyar decisiones operativas.

## Migracion

- Nueva tabla `staffing_requirement` para guardar `organizationId`, `locationId`, `jobPositionId`, `minimumRequired` y timestamps.
- La migracion generada es `apps/api/drizzle/0053_oval_sandman.sql`.
- Antes de habilitar la funcionalidad en un ambiente, ejecutar las migraciones Drizzle con `bun run db:mig` usando `SEN_DB_URL`.

## Notas funcionales

- `CHECK_IN` y `WORK_OFFSITE` cuentan como llegada para cobertura.
- Los puestos sin minimo configurado no se marcan como incumplidos.
- La vista web permite configurar minimos desde Puestos de Trabajo y consultar cobertura en Dashboard.
