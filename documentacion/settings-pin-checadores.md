# PIN de configuración de checadores

## Alcance

El PIN de configuración protege la entrada a la pantalla de configuración en la app móvil de checadores. La verificación es en línea contra la API; la app móvil no persiste el PIN ni un hash local.

La política puede operar en modo global para todos los checadores de una organización o en modo por dispositivo. En modo por dispositivo, un checador con PIN propio usa ese PIN; si no tiene override, usa el PIN global cuando exista.

## Migración

La funcionalidad usa las tablas `organization_device_settings_pin_config` y `device_settings_pin_override`. Antes de habilitarla en un ambiente nuevo, ejecutar las migraciones Drizzle del API.

## Nota operativa del rate limiter

El bloqueo por intentos fallidos de PIN usa memoria local del proceso API. En despliegues con varias réplicas, cada proceso conserva su propio contador, por lo que el presupuesto efectivo de intentos aumenta por instancia.

Mientras no exista un contador compartido en Redis o Postgres, operar este flujo con una sola réplica de API o asegurar afinidad de sesión para las solicitudes de verificación de PIN. Antes de escalar horizontalmente el API para este flujo, migrar el rate limiter a almacenamiento compartido.
