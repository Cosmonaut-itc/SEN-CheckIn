# Plan de Issues - SEN-CheckIn

> Generado: 2026-03-11
> Prioridad general: Horas Extra > Descuento Comida > Sabado 7mo Dia > Nomina Fiscal/Real > Descuentos Genericos

---

## Progreso General

- [x] **EPIC 1: Autorizacion de Horas Extra** (4/4 issues)
- [x] **EPIC 2: Descuento Automatico por Falta de Salida de Comida** (5/5 issues)
- [x] **EPIC 3: Sabado como Dia Trabajado para 7mo Dia** (3/3 issues)
- [ ] **EPIC 4: Nomina Fiscal vs Real** (0/4 issues)
- [ ] **EPIC 5: Sistema Generico de Descuentos** (0/4 issues)

---

## EPIC 1: Autorizacion de Horas Extra (PRIORIDAD ALTA)

### Contexto

Actualmente el sistema calcula horas extra automaticamente basandose en la diferencia entre horas trabajadas y el limite del turno (DIURNA=8, NOCTURNA=7, MIXTA=7.5). No existe ningun mecanismo de autorizacion. Las horas extra deben ser pre-aprobadas por un admin antes de que el empleado las trabaje. Si no estan aprobadas, se registran pero NO se pagan en nomina. Si se aprueban 2 horas y el empleado trabaja 3, solo se pagan las 2 aprobadas.

### Epic 1 - Progreso

- [x] Issue 1.1: Modelo de datos - Tabla `overtime_authorization`
- [x] Issue 1.2: API CRUD - Autorizaciones de horas extra
- [x] Issue 1.3: Modificar calculo de nomina para respetar autorizaciones
- [x] Issue 1.4: UI Web - Pantalla de autorizacion de horas extra

---

### Issue 1.1: Modelo de datos - Tabla `overtime_authorization`

**Tipo:** Backend (Schema + Migration)
**Status:** - [x] Completada

**Descripcion:**
Crear tabla `overtime_authorization` en el schema de Drizzle para registrar pre-aprobaciones de horas extra.

**Campos:**

- `id` (text, PK)
- `organizationId` (text, FK -> organization)
- `employeeId` (text, FK -> employee)
- `dateKey` (text, YYYY-MM-DD) - dia especifico autorizado
- `authorizedHours` (numeric 5,2) - horas extra autorizadas para ese dia
- `authorizedByUserId` (text, FK -> user) - admin que autorizo
- `status` (enum: PENDING, ACTIVE, CANCELLED) - ACTIVE = vigente, CANCELLED = revocada antes del dia
- `notes` (text, nullable) - razon/justificacion
- `createdAt` / `updatedAt` (timestamps)

**Indices:**

- Unique: `(employeeId, dateKey)` - solo una autorizacion por empleado por dia
- Index: `(organizationId, dateKey)` para consultas por fecha
- Index: `(employeeId, status)` para consultas por empleado

**Archivos a modificar:**

- `apps/api/src/db/schema.ts` - agregar tabla y enum
- Nueva migracion Drizzle

**Pasos de implementacion:**

- [x] Crear enum `overtimeAuthorizationStatus` en schema.ts
- [x] Crear tabla `overtime_authorization` con todos los campos
- [x] Agregar foreign keys hacia employee, organization, user
- [x] Crear indice unique (employeeId, dateKey)
- [x] Crear indices secundarios (organizationId+dateKey, employeeId+status)
- [x] Generar migracion con `drizzle-kit generate`
- [x] Aplicar migracion en base de datos local
- [x] Verificar que la migracion es reversible / no rompe datos existentes

---

### Issue 1.2: API CRUD - Autorizaciones de horas extra

**Tipo:** Backend (API Routes)
**Status:** - [x] Completada

**Descripcion:**
Crear endpoints para gestionar autorizaciones de horas extra. Solo el rol admin puede crear/modificar autorizaciones.

**Endpoints:**

1. `POST /api/organizations/:orgId/overtime-authorizations` - Crear autorizacion
    - Body: `{ employeeId, dateKey, authorizedHours, notes? }`
    - Validacion: dateKey debe ser hoy o futuro, authorizedHours > 0 y <= 3 (LFT limit diario, o warning si > 3)
    - Solo admin

2. `GET /api/organizations/:orgId/overtime-authorizations` - Listar autorizaciones
    - Query params: `employeeId?`, `startDate?`, `endDate?`, `status?`
    - Paginacion

3. `PUT /api/organizations/:orgId/overtime-authorizations/:id` - Modificar autorizacion
    - Puede cambiar horas o cancelar (status -> CANCELLED)
    - Solo antes de que pase el dia autorizado

4. `DELETE /api/organizations/:orgId/overtime-authorizations/:id` - Cancelar autorizacion
    - Soft delete: cambiar status a CANCELLED

**Archivos a modificar:**

- Nuevo archivo: `apps/api/src/routes/overtime-authorizations.ts`
- `apps/api/src/routes/index.ts` - registrar nueva ruta

**Pasos de implementacion:**

- [x] Crear archivo `apps/api/src/routes/overtime-authorizations.ts`
- [x] Implementar POST - crear autorizacion
    - [x] Validar rol admin
    - [x] Validar que dateKey sea hoy o futuro
    - [x] Validar authorizedHours > 0
    - [x] Validar que no exista duplicado (employeeId + dateKey)
    - [x] Warning si authorizedHours > 3 (limite LFT)
- [x] Implementar GET - listar autorizaciones
    - [x] Filtros: employeeId, startDate, endDate, status
    - [x] Paginacion
- [x] Implementar PUT - modificar autorizacion
    - [x] Solo si dateKey no ha pasado
    - [x] Permitir cambiar horas y status
- [x] Implementar DELETE - soft delete (status -> CANCELLED)
- [x] Registrar ruta en `apps/api/src/routes/index.ts`
- [x] Probar endpoints manualmente o con tests

---

### Issue 1.3: Modificar calculo de nomina para respetar autorizaciones

**Tipo:** Backend (Logica de negocio)
**Status:** - [x] Completada

**Descripcion:**
Modificar `payroll-calculation.ts` para que las horas extra solo se paguen si existe una autorizacion ACTIVE para ese dia. Las horas extra no autorizadas se registran en el payroll_run_employee pero con pago $0.

**Logica:**

1. Al calcular horas extra de un empleado para un dia:
    - Buscar `overtime_authorization` con status ACTIVE para ese `(employeeId, dateKey)`
    - Si NO existe autorizacion:
        - `overtimeDoubleHours` / `overtimeTripleHours` se registran normalmente (contabilidad)
        - `overtimeDoublePay` / `overtimeTriplePay` = 0 (no se pagan)
        - Agregar warning: `OVERTIME_NOT_AUTHORIZED`
    - Si existe autorizacion:
        - Las horas extra pagadas se limitan al minimo entre horas trabajadas y `authorizedHours`
        - Horas excedentes sobre la autorizacion: se registran pero no se pagan
        - Si horas trabajadas > authorizedHours, agregar warning: `OVERTIME_EXCEEDED_AUTHORIZATION`

2. Agregar campos nuevos a `payroll_run_employee`:
    - `authorizedOvertimeHours` (numeric) - total de horas extra autorizadas en el periodo
    - `unauthorizedOvertimeHours` (numeric) - total de horas extra NO autorizadas (registradas pero no pagadas)

**Archivos a modificar:**

- `apps/api/src/services/payroll-calculation.ts` - logica principal
- `apps/api/src/db/schema.ts` - campos nuevos en payroll_run_employee
- Nueva migracion

**Pasos de implementacion:**

- [x] Agregar campos `authorizedOvertimeHours` y `unauthorizedOvertimeHours` a payroll_run_employee en schema
- [x] Generar y aplicar migracion
- [x] Agregar warnings `OVERTIME_NOT_AUTHORIZED` y `OVERTIME_EXCEEDED_AUTHORIZATION` al enum/constantes de warnings
- [x] Modificar funcion de calculo de horas extra en payroll-calculation.ts:
    - [x] Fetch de autorizaciones activas para el periodo del empleado
    - [x] Para cada dia con horas extra: buscar autorizacion correspondiente
    - [x] Si no hay autorizacion: registrar horas, poner pago en $0, agregar warning
    - [x] Si hay autorizacion: limitar pago al min(horasReales, horasAutorizadas)
    - [x] Si horasReales > horasAutorizadas: agregar warning EXCEEDED
- [x] Calcular totales authorizedOvertimeHours y unauthorizedOvertimeHours
- [x] Verificar que IMSS/ISR NO incluyen overtime pay no autorizado
- [x] Escribir tests unitarios:
    - [x] Test: empleado con horas extra sin autorizacion -> pago $0
    - [x] Test: empleado con autorizacion parcial (2h aprobadas, 3h trabajadas) -> paga 2h
    - [x] Test: empleado con autorizacion completa -> paga todo
    - [x] Test: empleado sin horas extra -> sin cambios
    - [x] Test: multiples dias con mezcla de autorizado/no autorizado

---

### Issue 1.4: UI Web - Pantalla de autorizacion de horas extra

**Tipo:** Frontend (Web)
**Status:** - [x] Completada

**Descripcion:**
Crear pantalla en el portal admin para gestionar autorizaciones de horas extra.

**Componentes:**

1. **Vista de calendario/lista** - Mostrar autorizaciones existentes por fecha
    - Filtros: empleado, rango de fechas, status
    - Vista rapida de quien tiene autorizacion para cada dia

2. **Formulario de creacion** - Seleccionar empleado, fecha, horas autorizadas
    - Selector de empleado (busqueda)
    - Date picker (solo fechas futuras o hoy)
    - Input de horas (numeric, max sugerido 3 con warning si > 3)
    - Campo de notas opcional

3. **Indicadores en nomina** - En la vista de payroll run, mostrar columnas:
    - Horas extra autorizadas vs no autorizadas
    - Highlight visual cuando hay horas extra no autorizadas
    - Warning badges

**Archivos a crear/modificar:**

- Nueva pagina: `apps/web/app/(dashboard)/overtime-authorizations/page.tsx`
- Componentes en: `apps/web/components/overtime/`
- Modificar vista de payroll run para mostrar indicadores

**Pasos de implementacion:**

- [x] Crear pagina `apps/web/app/(dashboard)/overtime-authorizations/page.tsx`
- [x] Crear componente de listado de autorizaciones
    - [x] Tabla con columnas: empleado, fecha, horas, status, creado por
    - [x] Filtros: empleado, rango de fechas, status
    - [x] Paginacion
- [x] Crear formulario/modal de creacion de autorizacion
    - [x] Selector de empleado con busqueda
    - [x] Date picker (solo futuro/hoy)
    - [x] Input numerico de horas con warning si > 3
    - [x] Campo de notas
- [x] Accion de cancelar autorizacion desde la lista
- [x] Agregar link en navegacion/sidebar del dashboard
- [x] Modificar vista de payroll run:
    - [x] Agregar columnas: HE Autorizadas / HE No Autorizadas
    - [x] Highlight visual (rojo/amarillo) en filas con HE no autorizadas
    - [x] Warning badge en el resumen del run
- [x] Verificar que solo admins ven la seccion

---

## EPIC 2: Descuento Automatico por Falta de Salida de Comida

### Contexto

Actualmente los empleados marcan CHECK_OUT y CHECK_IN y el sistema calcula horas trabajadas por los intervalos. Si un empleado NO marca salida de comida, el sistema cuenta como si hubiera trabajado de corrido. Se necesita: (1) actualizar la app movil para que al hacer check-out se pueda seleccionar el motivo (comida, personal), y (2) si no existe un check-out de tipo "comida" en el dia, descontar automaticamente un tiempo configurable.

### Epic 2 - Progreso

- [x] Issue 2.1: Nuevo enum y campo - Tipo de salida autorizada
- [x] Issue 2.2: Configuracion de tiempo de comida por organizacion
- [x] Issue 2.3: Actualizar app movil - Selector de motivo de salida
- [x] Issue 2.4: Logica de descuento automatico en calculo de nomina
- [x] Issue 2.5: UI Web - Configuracion y visibilidad del descuento de comida

---

### Issue 2.1: Nuevo enum y campo - Tipo de salida autorizada

**Tipo:** Backend (Schema + Migration)
**Status:** - [x] Completada

**Descripcion:**
Agregar un campo al `attendance_record` para diferenciar el tipo de CHECK_OUT.

**Cambios:**

1. Crear enum `checkOutReason`: `REGULAR`, `LUNCH_BREAK`, `PERSONAL`
2. Agregar campo `checkOutReason` (enum, nullable) a `attendance_record`
    - Solo aplica cuando `type` = CHECK_OUT o CHECK_OUT_AUTHORIZED
    - Default: null (para registros existentes/compatibilidad)

**Archivos a modificar:**

- `apps/api/src/db/schema.ts` - enum y campo nuevo
- Nueva migracion

**Pasos de implementacion:**

- [x] Crear enum `checkOutReason` en schema.ts (REGULAR, LUNCH_BREAK, PERSONAL)
- [x] Agregar campo `checkOutReason` a tabla `attendance_record` como nullable
- [x] Generar migracion con `drizzle-kit generate`
- [x] Aplicar migracion y verificar que registros existentes quedan con null
- [x] Verificar que no se rompe ningun query existente de attendance

---

### Issue 2.2: Configuracion de tiempo de comida por organizacion

**Tipo:** Backend (Schema + API)
**Status:** - [x] Completada

**Descripcion:**
Agregar campo de configuracion de tiempo de comida a `payroll_setting`.

**Cambios:**

1. Agregar a `payroll_setting`:
    - `lunchBreakMinutes` (integer, default 60) - minutos de comida a descontar
    - `autoDeductLunchBreak` (boolean, default false) - habilitar/deshabilitar descuento automatico
    - `lunchBreakThresholdHours` (numeric 4,2, default 6.0) - minimo de horas trabajadas para que aplique el descuento (LFT: jornadas > 6 horas continuas)

2. Actualizar endpoint PUT de payroll-settings para aceptar estos campos

**Archivos a modificar:**

- `apps/api/src/db/schema.ts` - campos nuevos en payroll_setting
- `apps/api/src/routes/payroll-settings.ts` - actualizar GET/PUT
- Nueva migracion

**Pasos de implementacion:**

- [x] Agregar campos `lunchBreakMinutes`, `autoDeductLunchBreak`, `lunchBreakThresholdHours` a payroll_setting
- [x] Generar y aplicar migracion
- [x] Actualizar endpoint GET de payroll-settings para retornar nuevos campos
- [x] Actualizar endpoint PUT de payroll-settings para aceptar nuevos campos
- [x] Agregar validacion: lunchBreakMinutes entre 15 y 120
- [x] Agregar validacion: lunchBreakThresholdHours entre 4 y 10
- [x] Verificar que defaults se aplican correctamente para orgs existentes

---

### Issue 2.3: Actualizar app movil - Selector de motivo de salida

**Tipo:** Frontend (Mobile - Expo)
**Status:** - [x] Completada

**Descripcion:**
Cuando un empleado hace CHECK_OUT desde la app movil o el kiosko, mostrar un selector preguntando el motivo de salida.

**Flujo:**

1. Empleado presiona "Salida" (check-out)
2. Se muestra modal/pantalla: "Motivo de salida"
    - Comida (LUNCH_BREAK)
    - Personal (PERSONAL)
    - Fin de jornada (REGULAR)
3. Se envia el `checkOutReason` junto con el registro de asistencia

**Archivos a modificar:**

- `apps/mobile/` - pantalla/componente de check-out
- `apps/api/src/routes/attendance.ts` - aceptar campo checkOutReason en el POST

**Pasos de implementacion:**

- [x] Modificar endpoint POST de attendance para aceptar campo `checkOutReason`
    - [x] Validar que solo se envie cuando type = CHECK_OUT o CHECK_OUT_AUTHORIZED
    - [x] Guardar en attendance_record
- [x] Crear componente modal/bottom-sheet de seleccion de motivo en app movil
    - [x] Opcion: Comida (LUNCH_BREAK)
    - [x] Opcion: Personal (PERSONAL)
    - [x] Opcion: Fin de jornada (REGULAR)
- [x] Integrar modal en flujo de check-out existente
    - [x] Mostrar modal ANTES de enviar el request
    - [x] Si cancela el modal, no se registra el check-out
- [x] Verificar que check-in NO muestra el selector
- [x] Probar flujo completo: seleccionar motivo -> check-out -> verificar en BD

---

### Issue 2.4: Logica de descuento automatico en calculo de nomina

**Tipo:** Backend (Logica de negocio)
**Status:** - [x] Completada

**Descripcion:**
Modificar el calculo de horas trabajadas para descontar automaticamente el tiempo de comida si el empleado no registro una salida de tipo LUNCH_BREAK.

**Logica:**

1. Para cada dia trabajado del empleado en el periodo:
    - Buscar si existe un `attendance_record` con `checkOutReason = LUNCH_BREAK` para ese dia
    - Si NO existe Y `autoDeductLunchBreak` esta habilitado:
        - Si las horas trabajadas continuas > `lunchBreakThresholdHours`:
            - Restar `lunchBreakMinutes` del total de minutos trabajados del dia
            - Agregar flag/warning: `LUNCH_BREAK_AUTO_DEDUCTED`
    - Si SI existe:
        - El gap entre CHECK_OUT(LUNCH_BREAK) y siguiente CHECK_IN ya se descuenta naturalmente (comportamiento actual)
        - No se aplica descuento adicional

2. Agregar campo a `payroll_run_employee`:
    - `lunchBreakAutoDeductedDays` (integer) - dias en los que se aplico descuento automatico
    - `lunchBreakAutoDeductedMinutes` (integer) - total de minutos descontados

**Archivos a modificar:**

- `apps/api/src/services/payroll-calculation.ts` - logica de descuento
- `apps/api/src/db/schema.ts` - campos en payroll_run_employee
- Nueva migracion

**Pasos de implementacion:**

- [x] Agregar campos `lunchBreakAutoDeductedDays` y `lunchBreakAutoDeductedMinutes` a payroll_run_employee
- [x] Generar y aplicar migracion
- [x] Agregar warning `LUNCH_BREAK_AUTO_DEDUCTED` a constantes de warnings
- [x] Modificar logica de calculo de horas trabajadas en payroll-calculation.ts:
    - [x] Para cada dia: consultar attendance_records del dia buscando checkOutReason = LUNCH_BREAK
    - [x] Si no existe y autoDeductLunchBreak = true:
        - [x] Verificar que horas trabajadas > lunchBreakThresholdHours
        - [x] Restar lunchBreakMinutes de los minutos trabajados del dia
        - [x] Incrementar contadores (days, minutes)
        - [x] Agregar warning
    - [x] Si existe LUNCH_BREAK: no descontar (gap ya se maneja)
- [x] Escribir tests unitarios:
    - [x] Test: autoDeductLunchBreak = false -> sin descuento
    - [x] Test: sin LUNCH_BREAK checkout, jornada > threshold -> descuento aplicado
    - [x] Test: con LUNCH_BREAK checkout -> sin descuento extra
    - [x] Test: jornada < threshold -> sin descuento aunque no haya LUNCH_BREAK
    - [x] Test: multiples dias con mezcla de escenarios

---

### Issue 2.5: UI Web - Configuracion y visibilidad del descuento de comida

**Tipo:** Frontend (Web)
**Status:** - [x] Completada

**Descripcion:**

1. En la pantalla de configuracion de nomina (payroll settings), agregar seccion para configurar el descuento de comida
2. En la vista de payroll run, mostrar indicadores de dias con descuento automatico

**Componentes:**

- Toggle: "Descontar tiempo de comida automaticamente"
- Input: Minutos de comida (default 60)
- Input: Umbral de horas para descuento (default 6)
- En payroll run: columna o tooltip mostrando dias con descuento aplicado

**Pasos de implementacion:**

- [x] Agregar seccion "Descuento de comida" en pantalla de payroll settings
    - [x] Toggle: autoDeductLunchBreak
    - [x] Input numerico: lunchBreakMinutes (visible solo si toggle = on)
    - [x] Input numerico: lunchBreakThresholdHours (visible solo si toggle = on)
- [x] Conectar con API PUT de payroll settings
- [x] Modificar vista de payroll run:
    - [x] Agregar columna/tooltip: "Dias con descuento comida" / "Minutos descontados"
    - [x] Mostrar warning badge si hay dias con descuento automatico
- [x] Verificar que la configuracion se refleja en el siguiente calculo de nomina

---

## EPIC 3: Sabado como Dia Trabajado para 7mo Dia

### Contexto

El 7mo dia (septimo dia) paga al empleado un dia adicional si trabajo los 6 dias de la semana. Algunos empleados tienen jornada de lunes a viernes y descansan sabado, pero la empresa quiere que el sabado cuente como trabajado para efectos del 7mo dia. Esto es configurable por organizacion.

### Epic 3 - Progreso

- [x] Issue 3.1: Configuracion - Contar sabado como dia trabajado
- [x] Issue 3.2: Modificar logica del 7mo dia
- [x] Issue 3.3: UI Web - Toggle en configuracion

---

### Issue 3.1: Configuracion - Contar sabado como dia trabajado

**Tipo:** Backend (Schema + API)
**Status:** - [x] Completada

**Descripcion:**
Agregar campo a `payroll_setting` para permitir que el sabado cuente como dia trabajado aunque el empleado descanse.

**Cambios:**

1. Agregar a `payroll_setting`:
    - `countSaturdayAsWorkedForSeventhDay` (boolean, default false)

2. Actualizar endpoint de payroll settings

**Archivos a modificar:**

- `apps/api/src/db/schema.ts`
- `apps/api/src/routes/payroll-settings.ts`
- Nueva migracion

**Pasos de implementacion:**

- [x] Agregar campo `countSaturdayAsWorkedForSeventhDay` (boolean, default false) a payroll_setting
- [x] Generar y aplicar migracion
- [x] Actualizar endpoint GET para retornar el nuevo campo
- [x] Actualizar endpoint PUT para aceptar el nuevo campo
- [x] Verificar que el default false no afecta orgs existentes

---

### Issue 3.2: Modificar logica del 7mo dia

**Tipo:** Backend (Logica de negocio)
**Status:** - [x] Completada

**Descripcion:**
Modificar el calculo del septimo dia en `payroll-calculation.ts` para considerar la nueva configuracion.

**Logica actual:**

- El 7mo dia se paga si `enableSeventhDayPay = true` y el empleado trabajo todos los dias programados de la semana.

**Logica nueva:**

- Si `countSaturdayAsWorkedForSeventhDay = true`:
    - Al evaluar si el empleado cumplio los 6 dias de la semana, contar el sabado como "trabajado" aunque no haya asistencia registrada
    - Esto aplica SOLO si el sabado NO esta en el schedule del empleado (es decir, es su dia de descanso)
    - Si el sabado SI esta en su schedule y no asistio, sigue siendo falta

**Edge cases:**

- Empleado con horario de martes a sabado: el sabado ya esta en su schedule, esta config no aplica
- Empleado con horario de lunes a viernes: el sabado se cuenta como trabajado
- Empleado que falto un dia entre lunes y viernes: no se paga 7mo dia aunque el sabado cuente

**Archivos a modificar:**

- `apps/api/src/services/payroll-calculation.ts` - logica del septimo dia

**Pasos de implementacion:**

- [x] Localizar logica de calculo del 7mo dia en payroll-calculation.ts
- [x] Agregar lectura de `countSaturdayAsWorkedForSeventhDay` del payroll setting
- [x] Modificar evaluacion de dias trabajados en la semana:
    - [x] Si config = true y sabado NO esta en schedule del empleado: contar sabado como trabajado
    - [x] Si config = true y sabado SI esta en schedule: no modificar (falta real)
    - [x] Si config = false: comportamiento identico al actual
- [x] Escribir tests unitarios:
    - [x] Test: config = false -> sin cambios en comportamiento
    - [x] Test: config = true, empleado L-V, trabajo 5 dias -> recibe 7mo dia
    - [x] Test: config = true, empleado L-V, falto 1 dia -> NO recibe 7mo dia
    - [x] Test: config = true, empleado M-S (sabado en schedule), falto sabado -> NO recibe 7mo dia
    - [x] Test: config = true, empleado L-V, trabajo 5 dias + sabado extra -> recibe 7mo dia (sabado no duplica)

---

### Issue 3.3: UI Web - Toggle en configuracion

**Tipo:** Frontend (Web)
**Status:** - [x] Completada

**Descripcion:**
Agregar toggle en la pantalla de configuracion de nomina.

**Pasos de implementacion:**

- [x] Agregar toggle en seccion de 7mo dia de payroll settings
    - [x] Label: "Contar sabado como dia trabajado para calculo de 7mo dia"
    - [x] Descripcion: "Empleados con jornada L-V tendran el sabado contado como trabajado"
    - [x] Visible solo si `enableSeventhDayPay = true`
- [x] Conectar con API PUT de payroll settings
- [x] Verificar que toggle deshabilitado cuando enableSeventhDayPay = false

---

## EPIC 4: Nomina Fiscal vs Real (Complemento Salarial)

### Contexto

Cada empleado tiene un salario real (dailyPay actual) y un salario fiscal registrado ante el SAT/IMSS. La diferencia se paga como complemento. El sistema debe calcular la nomina fiscal (con IMSS, ISR, etc.) sobre el salario fiscal, y mostrar la diferencia como complemento solo visible para admins. Esto debe ser una feature configurable (opt-in por organizacion).

### Epic 4 - Progreso

- [ ] Issue 4.1: Configuracion y campo fiscal por empleado
- [ ] Issue 4.2: Modificar calculo de nomina para usar salario fiscal
- [ ] Issue 4.3: API - Gestionar salario fiscal por empleado
- [ ] Issue 4.4: UI Web - Configuracion y campo de salario fiscal

---

### Issue 4.1: Configuracion y campo fiscal por empleado

**Tipo:** Backend (Schema + Migration)
**Status:** - [ ] Completada

**Descripcion:**

1. Agregar a `payroll_setting`:
    - `enableDualPayroll` (boolean, default false) - habilita la funcionalidad de nomina dual

2. Agregar a `employee`:
    - `fiscalDailyPay` (numeric 10,4, nullable) - salario diario fiscal
    - Cuando es null y dualPayroll esta habilitado, se usa dailyPay (sin complemento)
    - Cuando tiene valor, la nomina fiscal se calcula sobre este monto

**Logica de negocio:**

- `complemento = dailyPay - fiscalDailyPay` (por dia)
- Si fiscalDailyPay >= dailyPay, no hay complemento
- Si fiscalDailyPay es null, no hay complemento

**Archivos a modificar:**

- `apps/api/src/db/schema.ts`
- Nueva migracion

**Pasos de implementacion:**

- [ ] Agregar campo `enableDualPayroll` (boolean, default false) a payroll_setting
- [ ] Agregar campo `fiscalDailyPay` (numeric 10,4, nullable) a employee
- [ ] Generar y aplicar migracion
- [ ] Verificar que empleados existentes quedan con fiscalDailyPay = null
- [ ] Verificar que orgs existentes quedan con enableDualPayroll = false

---

### Issue 4.2: Modificar calculo de nomina para usar salario fiscal

**Tipo:** Backend (Logica de negocio)
**Status:** - [ ] Completada

**Descripcion:**
Cuando `enableDualPayroll = true`, el calculo de nomina debe usar `fiscalDailyPay` (si existe) en lugar de `dailyPay` para todos los calculos fiscales (IMSS, ISR, SBC).

**Cambios en payroll-calculation.ts:**

1. Si `enableDualPayroll = true` y empleado tiene `fiscalDailyPay`:
    - Usar `fiscalDailyPay` para:
        - Calculo de SBC (Salario Base de Cotizacion)
        - Calculo de IMSS (employer + employee)
        - Calculo de ISR
        - Calculo de horas extra (rate basado en salario fiscal)
        - Premios dominicales y de dia de descanso obligatorio
    - Usar `dailyPay` para:
        - Calculo del pago TOTAL real al empleado
    - Calcular complemento:
        - `dailyComplement = dailyPay - fiscalDailyPay`
        - `periodComplement = dailyComplement * diasTrabajados`

2. Agregar campos a `payroll_run_employee`:
    - `fiscalDailyPay` (numeric, nullable) - snapshot del salario fiscal usado
    - `fiscalGrossPay` (numeric, nullable) - pago bruto fiscal del periodo
    - `complementPay` (numeric, nullable) - pago complemento del periodo
    - `totalRealPay` (numeric, nullable) - pago total real (fiscal + complemento)

3. Si `enableDualPayroll = false`: comportamiento actual sin cambios

**Archivos a modificar:**

- `apps/api/src/services/payroll-calculation.ts`
- `apps/api/src/db/schema.ts`
- Nueva migracion

**Pasos de implementacion:**

- [ ] Agregar campos `fiscalDailyPay`, `fiscalGrossPay`, `complementPay`, `totalRealPay` a payroll_run_employee
- [ ] Generar y aplicar migracion
- [ ] Modificar payroll-calculation.ts:
    - [ ] Leer `enableDualPayroll` del payroll setting
    - [ ] Si enabled y empleado tiene fiscalDailyPay:
        - [ ] Sustituir dailyPay por fiscalDailyPay para calculo de SBC
        - [ ] Sustituir para calculo de IMSS (employee + employer)
        - [ ] Sustituir para calculo de ISR
        - [ ] Sustituir para rate de horas extra
        - [ ] Sustituir para premios dominicales y descanso obligatorio
    - [ ] Calcular pago real total con dailyPay original
    - [ ] Calcular complementPay = totalRealPay - fiscalGrossPay
    - [ ] Guardar snapshots en payroll_run_employee
- [ ] Verificar que enableDualPayroll = false no cambia nada
- [ ] Escribir tests unitarios:
    - [ ] Test: dual payroll OFF -> calculo identico al actual
    - [ ] Test: dual payroll ON, fiscalDailyPay = null -> calculo identico (usa dailyPay)
    - [ ] Test: dual payroll ON, fiscalDailyPay < dailyPay -> IMSS/ISR sobre fiscal, pago total sobre real
    - [ ] Test: complemento = dailyPay - fiscalDailyPay calculado correctamente
    - [ ] Test: fiscalDailyPay >= dailyPay -> complemento = 0

---

### Issue 4.3: API - Gestionar salario fiscal por empleado

**Tipo:** Backend (API)
**Status:** - [ ] Completada

**Descripcion:**
Actualizar el endpoint de empleados para aceptar y retornar `fiscalDailyPay`.

**Cambios:**

1. `PUT /api/organizations/:orgId/employees/:id` - aceptar `fiscalDailyPay`
2. `GET /api/organizations/:orgId/employees/:id` - retornar `fiscalDailyPay` SOLO si el user es admin
3. `GET /api/organizations/:orgId/employees` (lista) - incluir `fiscalDailyPay` SOLO para admin

**Archivos a modificar:**

- `apps/api/src/routes/employees.ts`

**Pasos de implementacion:**

- [ ] Modificar PUT de employees para aceptar fiscalDailyPay
    - [ ] Validar que solo admin puede setear este campo
    - [ ] Validar que fiscalDailyPay < dailyPay si se proporciona
- [ ] Modificar GET de employee individual para incluir fiscalDailyPay
    - [ ] Solo retornar si el user tiene rol admin
- [ ] Modificar GET de lista de employees para incluir fiscalDailyPay
    - [ ] Solo retornar si el user tiene rol admin
- [ ] Registrar cambio en employee_audit_event cuando fiscalDailyPay cambia
- [ ] Actualizar endpoint PUT de payroll settings para aceptar enableDualPayroll

---

### Issue 4.4: UI Web - Configuracion y campo de salario fiscal

**Tipo:** Frontend (Web)
**Status:** - [ ] Completada

**Descripcion:**

1. En payroll settings: toggle "Habilitar nomina dual (fiscal/real)"
2. En formulario de empleado: campo "Salario diario fiscal" (visible solo si dual payroll habilitado)
3. En payroll run (vista admin): columnas adicionales mostrando fiscal vs complemento
    - Solo visible para admins
    - Columnas: Pago Fiscal | Complemento | Total Real

**Pasos de implementacion:**

- [ ] Agregar toggle "Habilitar nomina dual" en payroll settings
- [ ] En formulario de edicion de empleado:
    - [ ] Agregar campo "Salario diario fiscal" (visible solo si enableDualPayroll = true)
    - [ ] Mostrar complemento calculado en tiempo real (dailyPay - fiscalDailyPay)
    - [ ] Validacion visual: fiscalDailyPay debe ser menor a dailyPay
- [ ] En vista de payroll run (solo admin):
    - [ ] Agregar columnas: Pago Fiscal | Complemento | Total Real
    - [ ] Estas columnas solo aparecen si enableDualPayroll = true
    - [ ] Totales en el footer de la tabla
- [ ] Verificar que miembros no-admin NO ven:
    - [ ] El campo fiscalDailyPay en perfil de empleado
    - [ ] Las columnas fiscal/complemento en payroll run
    - [ ] El toggle en payroll settings

---

## EPIC 5: Sistema Generico de Descuentos (INFONAVIT, Pensiones, Otros)

### Contexto

Se necesita un sistema flexible de descuentos que soporte: INFONAVIT (3 tipos de calculo), pensiones alimenticias (% neto o monto fijo, multiples por empleado), y cualquier otro descuento futuro (FONACOT, prestamos, cuotas sindicales, adelantos). Los descuentos pueden ser recurrentes (se aplican cada periodo) o puntuales (una sola vez o en N cuotas).

### Epic 5 - Progreso

- [ ] Issue 5.1: Modelo de datos - Tabla `employee_deduction`
- [ ] Issue 5.2: API CRUD - Descuentos por empleado
- [ ] Issue 5.3: Integrar descuentos en calculo de nomina
- [ ] Issue 5.4: UI Web - Gestion de descuentos

---

### Issue 5.1: Modelo de datos - Tabla `employee_deduction`

**Tipo:** Backend (Schema + Migration)
**Status:** - [ ] Completada

**Descripcion:**
Crear tabla generica de descuentos por empleado.

**Tabla `employee_deduction`:**

- `id` (text, PK)
- `organizationId` (text, FK)
- `employeeId` (text, FK)
- `type` (enum: INFONAVIT, ALIMONY, FONACOT, LOAN, UNION_FEE, ADVANCE, OTHER)
- `label` (text) - nombre legible (ej: "Credito INFONAVIT 123456", "Pension alimenticia - Juzgado 3ro")
- `calculationMethod` (enum: PERCENTAGE_SBC, PERCENTAGE_NET, PERCENTAGE_GROSS, FIXED_AMOUNT, VSM_FACTOR)
    - PERCENTAGE_SBC: % del Salario Base de Cotizacion (INFONAVIT tipo 1)
    - PERCENTAGE_NET: % del salario neto despues de impuestos (pensiones)
    - PERCENTAGE_GROSS: % del salario bruto
    - FIXED_AMOUNT: monto fijo en pesos por periodo
    - VSM_FACTOR: factor x salario minimo (INFONAVIT tipo 3)
- `value` (numeric 10,4) - el porcentaje (ej: 20.00 = 20%) o monto fijo, o factor VSM
- `frequency` (enum: RECURRING, ONE_TIME, INSTALLMENTS)
    - RECURRING: se aplica cada periodo de nomina indefinidamente
    - ONE_TIME: se aplica una sola vez en la siguiente nomina
    - INSTALLMENTS: se aplica en N cuotas
- `totalInstallments` (integer, nullable) - numero total de cuotas (solo para INSTALLMENTS)
- `completedInstallments` (integer, default 0) - cuotas ya aplicadas
- `totalAmount` (numeric 12,2, nullable) - monto total del prestamo/deuda (para referencia)
- `remainingAmount` (numeric 12,2, nullable) - monto restante
- `status` (enum: ACTIVE, PAUSED, COMPLETED, CANCELLED)
- `startDateKey` (text, YYYY-MM-DD) - fecha desde la que aplica
- `endDateKey` (text, nullable) - fecha hasta la que aplica (null = indefinido)
- `referenceNumber` (text, nullable) - numero de credito INFONAVIT, expediente judicial, etc.
- `satDeductionCode` (text, nullable) - codigo SAT c_TipoDeduccion para futura compatibilidad CFDI
- `notes` (text, nullable)
- `createdByUserId` (text, FK)
- `createdAt` / `updatedAt` (timestamps)

**Indices:**

- `(employeeId, status)` - descuentos activos por empleado
- `(organizationId, type)` - descuentos por tipo
- `(employeeId, type, status)` - consulta especifica

**Archivos a modificar:**

- `apps/api/src/db/schema.ts`
- Nueva migracion

**Pasos de implementacion:**

- [ ] Crear enum `deductionType` (INFONAVIT, ALIMONY, FONACOT, LOAN, UNION_FEE, ADVANCE, OTHER)
- [ ] Crear enum `deductionCalculationMethod` (PERCENTAGE_SBC, PERCENTAGE_NET, PERCENTAGE_GROSS, FIXED_AMOUNT, VSM_FACTOR)
- [ ] Crear enum `deductionFrequency` (RECURRING, ONE_TIME, INSTALLMENTS)
- [ ] Crear enum `deductionStatus` (ACTIVE, PAUSED, COMPLETED, CANCELLED)
- [ ] Crear tabla `employee_deduction` con todos los campos
- [ ] Incluir campo `satDeductionCode` para compatibilidad futura con CFDI
- [ ] Agregar foreign keys hacia employee, organization, user
- [ ] Crear indices: (employeeId, status), (organizationId, type), (employeeId, type, status)
- [ ] Generar migracion con `drizzle-kit generate`
- [ ] Aplicar migracion

---

### Issue 5.2: API CRUD - Descuentos por empleado

**Tipo:** Backend (API Routes)
**Status:** - [ ] Completada

**Descripcion:**
Endpoints para gestionar descuentos.

**Endpoints:**

1. `POST /api/organizations/:orgId/employees/:empId/deductions` - Crear descuento
    - Validar que el tipo de calculo sea compatible con el tipo de descuento
    - Solo admin

2. `GET /api/organizations/:orgId/employees/:empId/deductions` - Listar descuentos del empleado
    - Query: `status?`, `type?`

3. `PUT /api/organizations/:orgId/employees/:empId/deductions/:id` - Modificar descuento
    - Puede pausar (PAUSED), reactivar (ACTIVE), cancelar (CANCELLED)
    - Puede modificar value, notes

4. `GET /api/organizations/:orgId/deductions` - Listar todos los descuentos de la org
    - Para vista administrativa global
    - Query: `type?`, `status?`, `employeeId?`

**Validaciones especificas por tipo:**

- INFONAVIT: calculationMethod debe ser PERCENTAGE_SBC, FIXED_AMOUNT, o VSM_FACTOR
- ALIMONY: calculationMethod debe ser PERCENTAGE_NET o FIXED_AMOUNT
- LOAN/ADVANCE: frequency debe ser INSTALLMENTS o ONE_TIME

**Archivos a crear/modificar:**

- Nuevo: `apps/api/src/routes/employee-deductions.ts`
- `apps/api/src/routes/index.ts`

**Pasos de implementacion:**

- [ ] Crear archivo `apps/api/src/routes/employee-deductions.ts`
- [ ] Implementar POST - crear descuento
    - [ ] Validar rol admin
    - [ ] Validar compatibilidad type + calculationMethod
    - [ ] Validar que value > 0
    - [ ] Validar que totalInstallments > 0 si frequency = INSTALLMENTS
    - [ ] Validar startDateKey formato YYYY-MM-DD
- [ ] Implementar GET por empleado - listar descuentos
    - [ ] Filtros: status, type
    - [ ] Ordenar por createdAt desc
- [ ] Implementar PUT - modificar descuento
    - [ ] Permitir cambiar: value, notes, status, endDateKey
    - [ ] No permitir cambiar type o calculationMethod (crear nuevo descuento si cambia)
    - [ ] Validar transiciones de status validas (ACTIVE->PAUSED, PAUSED->ACTIVE, \*->CANCELLED)
- [ ] Implementar GET global de org - listar todos los descuentos
    - [ ] Filtros: type, status, employeeId
    - [ ] Paginacion
    - [ ] Join con employee para mostrar nombre
- [ ] Registrar ruta en `apps/api/src/routes/index.ts`
- [ ] Probar endpoints

---

### Issue 5.3: Integrar descuentos en calculo de nomina

**Tipo:** Backend (Logica de negocio)
**Status:** - [ ] Completada

**Descripcion:**
Modificar `payroll-calculation.ts` para aplicar descuentos activos de cada empleado.

**Logica de calculo:**

1. Para cada empleado en el periodo:
    - Obtener todos los `employee_deduction` con status ACTIVE
    - Filtrar por fecha: `startDateKey <= periodEnd` y (`endDateKey >= periodStart` o endDateKey es null)
    - Para cada descuento:
        - Calcular monto segun `calculationMethod`:
            - `PERCENTAGE_SBC`: `value/100 * SBC_diario * dias_periodo`
            - `PERCENTAGE_NET`: `value/100 * (grossPay - IMSS_employee - ISR)` (se calcula despues de impuestos)
            - `PERCENTAGE_GROSS`: `value/100 * grossPay`
            - `FIXED_AMOUNT`: `value` (ajustado proporcionalmente si periodo parcial)
            - `VSM_FACTOR`: `value * salarioMinimoDiario * dias_periodo`
        - Restar del pago neto
    - Si frequency = ONE_TIME: marcar como COMPLETED despues de aplicar
    - Si frequency = INSTALLMENTS: incrementar completedInstallments, marcar COMPLETED si llega a totalInstallments
    - Actualizar remainingAmount si aplica

2. Agregar a `payroll_run_employee`:
    - `deductionsBreakdown` (JSON) - array con cada descuento aplicado
    - `totalDeductions` (numeric) - suma total de descuentos aplicados

3. Orden de calculo:
    1. Salario bruto (normal + horas extra autorizadas + premios)
    2. IMSS empleado
    3. ISR
    4. Descuentos PERCENTAGE_NET (sobre el neto post-impuestos)
    5. Otros descuentos (FIXED_AMOUNT, PERCENTAGE_SBC, PERCENTAGE_GROSS, VSM_FACTOR)
    6. Pago neto final = bruto - IMSS - ISR - descuentos

**Archivos a modificar:**

- `apps/api/src/services/payroll-calculation.ts`
- `apps/api/src/db/schema.ts`
- Nueva migracion

**Pasos de implementacion:**

- [ ] Agregar campos `deductionsBreakdown` (json) y `totalDeductions` (numeric) a payroll_run_employee
- [ ] Generar y aplicar migracion
- [ ] Crear funcion auxiliar `calculateDeductionAmount(deduction, context)`:
    - [ ] Implementar calculo PERCENTAGE_SBC
    - [ ] Implementar calculo PERCENTAGE_NET
    - [ ] Implementar calculo PERCENTAGE_GROSS
    - [ ] Implementar calculo FIXED_AMOUNT (con ajuste proporcional)
    - [ ] Implementar calculo VSM_FACTOR
- [ ] Integrar en payroll-calculation.ts:
    - [ ] Fetch descuentos activos del empleado para el periodo
    - [ ] Filtrar por rango de fechas (startDateKey/endDateKey)
    - [ ] Calcular cada descuento en orden correcto (PERCENTAGE_NET despues de impuestos)
    - [ ] Construir deductionsBreakdown JSON
    - [ ] Sumar totalDeductions
    - [ ] Restar del pago neto
- [ ] Logica post-calculo:
    - [ ] Marcar ONE_TIME como COMPLETED
    - [ ] Incrementar completedInstallments en INSTALLMENTS
    - [ ] Marcar COMPLETED si completedInstallments >= totalInstallments
    - [ ] Actualizar remainingAmount
- [ ] Validar que pago neto >= 0 (cap con warning si descuentos exceden el neto)
- [ ] Escribir tests unitarios:
    - [ ] Test: empleado sin descuentos -> sin cambios
    - [ ] Test: INFONAVIT PERCENTAGE_SBC -> monto correcto
    - [ ] Test: ALIMONY PERCENTAGE_NET -> se calcula post-impuestos
    - [ ] Test: FIXED_AMOUNT con periodo parcial -> ajuste proporcional
    - [ ] Test: VSM_FACTOR -> usa salario minimo correcto
    - [ ] Test: ONE_TIME -> se marca COMPLETED despues de aplicar
    - [ ] Test: INSTALLMENTS 3/10 -> incrementa a 4/10
    - [ ] Test: INSTALLMENTS 10/10 -> se marca COMPLETED
    - [ ] Test: descuento PAUSED -> no se aplica
    - [ ] Test: multiples descuentos -> se aplican todos, orden correcto
    - [ ] Test: descuentos exceden neto -> cap a 0 con warning

---

### Issue 5.4: UI Web - Gestion de descuentos

**Tipo:** Frontend (Web)
**Status:** - [ ] Completada

**Descripcion:**

1. En perfil de empleado: seccion "Descuentos" con lista y formulario de creacion
2. Vista global de descuentos por organizacion (para admin)
3. En payroll run: columna de descuentos con tooltip mostrando desglose

**Componentes:**

- Formulario de descuento con campos dinamicos segun tipo seleccionado
- Lista de descuentos activos/historicos por empleado
- Badge de estado (ACTIVE/PAUSED/COMPLETED/CANCELLED)
- Progress bar para descuentos en cuotas (3/10 cuotas)
- Vista de payroll con desglose de descuentos

**Pasos de implementacion:**

- [ ] Crear seccion "Descuentos" en pagina de perfil de empleado
    - [ ] Lista de descuentos con columnas: tipo, label, metodo, valor, status, progreso
    - [ ] Badge de status con colores (verde=ACTIVE, amarillo=PAUSED, gris=COMPLETED, rojo=CANCELLED)
    - [ ] Progress bar para descuentos INSTALLMENTS (ej: "3/10 cuotas - $1,500 restante")
- [ ] Crear formulario/modal de creacion de descuento
    - [ ] Selector de tipo (INFONAVIT, ALIMONY, FONACOT, etc.)
    - [ ] Campos dinamicos segun tipo:
        - [ ] INFONAVIT: metodo (% SBC / fijo / VSM), valor, numero de credito
        - [ ] ALIMONY: metodo (% neto / fijo), valor, expediente judicial
        - [ ] LOAN/ADVANCE: monto total, numero de cuotas, valor por cuota
        - [ ] OTHER: label personalizado, metodo, valor
    - [ ] Fecha inicio y fecha fin (opcional)
    - [ ] Campo de notas
- [ ] Acciones en lista: pausar, reactivar, cancelar
- [ ] Crear vista global de descuentos (admin)
    - [ ] Tabla con todos los descuentos de la organizacion
    - [ ] Filtros: tipo, status, empleado
    - [ ] Totales agregados por tipo
- [ ] Modificar vista de payroll run:
    - [ ] Agregar columna "Descuentos" con monto total
    - [ ] Tooltip/expandible con desglose por tipo
    - [ ] Indicador si hay descuentos que excedieron el neto
- [ ] Verificar que solo admins tienen acceso a crear/modificar descuentos

---

## Orden de Implementacion Sugerido

- [ ] **Semana 1-2: EPIC 1 (Horas Extra)**
    - [ ] Issue 1.1 -> 1.2 -> 1.3 -> 1.4
- [ ] **Semana 3: EPIC 2 (Descuento Comida)**
    - [ ] Issue 2.1 -> 2.2 -> 2.3 -> 2.4 -> 2.5
- [ ] **Semana 4: EPIC 3 (Sabado 7mo Dia)**
    - [ ] Issue 3.1 -> 3.2 -> 3.3
- [ ] **Semana 5-6: EPIC 5 (Descuentos Genericos)**
    - [ ] Issue 5.1 -> 5.2 -> 5.3 -> 5.4
- [ ] **Semana 7: EPIC 4 (Nomina Dual)**
    - [ ] Issue 4.1 -> 4.2 -> 4.3 -> 4.4

> La nomina dual se deja al final porque es la mas delicada legalmente y requiere que los demas calculos esten estables.

---

## Dependencias entre Epics

```
EPIC 1 (Horas Extra) -----> EPIC 4 (Nomina Dual)
  Las horas extra autorizadas deben calcularse
  sobre el salario fiscal si dual payroll esta activo

EPIC 2 (Comida) ----------> Independiente
  No depende de otros epics

EPIC 3 (Sabado) ----------> Independiente
  Solo depende de enableSeventhDayPay existente

EPIC 5 (Descuentos) ------> EPIC 4 (Nomina Dual)
  INFONAVIT se calcula sobre SBC que puede
  ser fiscal si dual payroll esta activo
```

---

## Notas Tecnicas Transversales

- [ ] **Migraciones:** Cada issue de schema genera su propia migracion. Ejecutar en orden.
- [ ] **Compatibilidad CFDI futura:** Los descuentos de INFONAVIT y pensiones deben almacenar metadata compatible con el catalogo SAT (c_TipoDeduccion). Campo `satDeductionCode` incluido en Issue 5.1.
- [ ] **Audit trail:** Todos los cambios a descuentos y autorizaciones deben registrarse. Considerar extender `employee_audit_event` o crear tablas de audit especificas.
- [ ] **Tests:** Cada issue de logica de negocio (1.3, 2.4, 3.2, 4.2, 5.3) necesita tests unitarios con edge cases documentados.
- [ ] **Precision numerica:** Todos los calculos monetarios en numeric(10,4) o superior. Nunca usar float.
