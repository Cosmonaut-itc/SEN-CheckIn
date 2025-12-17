# API (Bun + Elysia)

Servicio backend para **SEN Check-In**, construido con Bun + Elysia, Drizzle ORM y BetterAuth.

## Requisitos

- Bun `>=1.3.3`
- Postgres (local o remoto)

## Variables de entorno

- `SEN_DB_URL`: cadena de conexión a Postgres (requerida).
- `SEN_CHECKIN_PG_PASSWORD`: requerida solo si levantas Postgres local con Docker Compose.

## Desarrollo

```bash
bun run dev
```

## Base de datos

### Migraciones

```bash
bun run db:mig
```

### Seeding (solo dominio)

El seed **no** trunca tablas de BetterAuth. El reset es **solo de tablas de dominio** (scheduling, payroll, attendance, etc.).

```bash
# Seed (no borra datos existentes; si ya hay datos de dominio, fallará)
bun run db:seed

# Reset dominio + seed
bun run db:reset

# Seed determinista (cambia la semilla del PRNG de drizzle-seed)
bun run db:seed -- --seed 123
```

## Validación rápida (manual)

### 1) Verificar datos en DB

```sql
select slug, id from organization where slug in ('sen-checkin', 'org-demo');
select count(*) from location;
select count(*) from job_position;
select count(*) from schedule_template;
select count(*) from schedule_template_day;
select count(*) from employee;
select count(*) from employee_schedule;
select count(*) from schedule_exception;
select count(*) from device;
select count(*) from attendance_record;
select count(*) from payroll_setting;
select count(*) from payroll_run;
select count(*) from payroll_run_employee;
```

### 2) Verificar endpoints (requiere sesión o API key)

Todas las rutas (excepto `/api/auth/*`) requieren autenticación por **sesión** o **API key**.

Ejemplos (reemplaza `API_KEY` y `ORG_ID`):

```bash
# Calendar (scheduling)
curl -sS \
  -H 'x-api-key: API_KEY' \
  'http://localhost:3000/scheduling/calendar?startDate=2025-01-01&endDate=2025-01-14&organizationId=ORG_ID'

# Payroll (preview)
curl -sS \
  -H 'content-type: application/json' \
  -H 'x-api-key: API_KEY' \
  -X POST 'http://localhost:3000/payroll/calculate' \
  -d '{"periodStartDateKey":"2025-01-01","periodEndDateKey":"2025-01-14","organizationId":"ORG_ID"}'
```

Tip: para validar horas trabajadas del seed, consulta el rango sembrado:

```sql
select period_start, period_end from payroll_run order by created_at desc limit 2;
```
