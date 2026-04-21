# Dashboard V2 Redesign Spec

Fecha: 2026-04-21
Variant: B (Bold / Editorial)
Branch objetivo: `feat/dashboard-v2`
PR destino: `main`

## Objetivo

Reemplazar el dashboard actual basado en mapa full-bleed + panel lateral por un layout editorial scrollable que mantenga el mapa como pieza principal, pero agregue contexto operacional inmediato: hero stat, timeline de actividad, heatmap horario, estado de dispositivos y clima por ubicacion.

El resultado debe sentirse mas cercano a una portada editorial operativa que a un panel administrativo convencional. El mapa deja de ocupar toda la pantalla y pasa a formar parte de una composicion 2x2 jerarquizada.

## Direccion visual

- Tono: editorial, bold, refinado, operativo.
- Jerarquia: tipografia display grande para el encabezado, metricas mono para datos, cuerpo limpio y sobrio.
- Layout: grid 2x2 scrollable con separacion amplia y tarjetas con bordes redondeados.
- Paleta: Michoacan, con soporte light/dark.
- Sensacion: informacion densa pero elegante, alto contraste visual entre hero y tarjetas auxiliares.

## Tokens de referencia

- Fuente display: `Playfair Display` o la fuente display equivalente ya aprobada en el sistema.
- Fuente cuerpo: `DM Sans` o la fuente sans equivalente ya aprobada en el sistema.
- Fuente mono: `JetBrains Mono` o la fuente mono equivalente ya aprobada en el sistema.
- Radio principal: `20px` para tarjetas grandes, radios menores para controles internos.
- Sombras: suaves en light, mas profundas en dark.
- Colores semanticos:
  - Primary: barro / terracota
  - Success: verde
  - Warning: amarillo ocre
  - Destructive: rojo teja
  - Info: azul

## Layout principal

### Estructura general

El dashboard conserva la shell existente del producto, incluyendo sidebar, navegacion, autenticacion y layout global. Solo cambia el contenido de la vista `/dashboard`.

Dentro del area principal:

1. Contenedor scrollable vertical con padding generoso.
2. Header hero con dos columnas.
3. Grid 2x2:
   - Fila 1, columna 1: mapa operativo
   - Fila 1, columna 2: rail de ubicaciones
   - Fila 2, columna 1: timeline de actividad
   - Fila 2, columna 2: stack de tarjetas auxiliares (devices + weather)

### Header hero

Columna izquierda:

- Eyebrow en uppercase con fecha y hora actual.
- Titulo display multilinea:
  - `Todo el jale,`
  - `en un vistazo.`
- La palabra `jale` debe ir enfatizada en italica y color primary.
- Subtitulo: visibilidad en tiempo real de ubicaciones y empleados.

Columna derecha:

- `HeroStatCard` con fondo invertido:
  - foreground como fondo
  - background como texto
- Theme toggle junto a la tarjeta hero.

### Grid editorial

- Dos columnas:
  - `minmax(0, 2.3fr)`
  - `minmax(320px, 1fr)`
- Dos filas automaticas.
- Gap aproximado: `18px`.

## Bloques funcionales

### 1. HeroStatCard

Contenido:

- Numero principal en mono: `onTime / total`
- Label: `a tiempo hoy`
- Chips de resumen:
  - retardos
  - faltas
  - en campo

Estados:

- Loading: skeleton del bloque completo
- Datos: valores reales del dia

### 2. Map card

Encabezado interno:

- Eyebrow: `MAPA OPERATIVO`
- Titulo: `Presencia en vivo`
- Leyenda:
  - activa
  - sin actividad
  - checada reciente

Comportamiento:

- Mantener el mapa existente con carga lazy/dynamic.
- El mapa recibe datos de presencia actual por ubicacion.
- Debe admitir hover/focus sincronizado con `LocationRail`.
- En desktop funciona como tarjeta grande con borde redondeado.
- En mobile se convierte en el bloque hero con altura aproximada de `60vh`.

Popup de marcador:

- Nombre y codigo de la ubicacion
- Barra de progreso presente/total
- Tiempo relativo desde la ultima checada
- Estilo `rounded-xl` con sombra marcada

### 3. HourlyHeatmap

Se renderiza dentro de la tarjeta del mapa como un overlay inferior.

Requisitos:

- No usar librerias de charts.
- Strip horizontal de 15 columnas para horas 6-20.
- Barras verticales con intensidad variable usando `accent-primary`.
- Eje simplificado con marcas minimas: `6am`, `12pm`, `6pm`.
- Empty state textual si no hay datos.

### 4. LocationRail

Tarjeta lateral scrollable con:

- Eyebrow: `UBICACIONES`
- Titulo: `Por sucursal`
- Buscador
- Lista de cards por ubicacion

Cada card de ubicacion muestra:

- Numero grande `presentCount / employeeCount`
- Nombre
- Codigo
- Badge de estado:
  - `activa` si hay presencia
  - `sin actividad` si no la hay
- Chevron o affordance visual de seleccion

Estados visuales:

- Activa: borde primary y fondo entintado
- Hover: fondo `surface-2`

### 5. ActivityTimeline

Modo requerido por defecto: `Track`.

Composicion:

- Filtros tipo chip arriba:
  - Todos
  - Entradas
  - Retardos
  - En campo
- Track horizontal con eje X de horas.
- Pills posicionadas por timestamp real.
- Lanes asignados greedily para evitar traslape.
- Footer resumen:
  - `X entradas`
  - `Y retardos`
  - `Z en campo`

Pill:

- Dot circular de `16px` con iniciales
- Nombre abreviado
- Hora en tipografia mono
- Color por tipo:
  - verde: entrada normal
  - amarillo: retardo
  - azul: en campo

Estados:

- Loading con skeleton
- Empty con mensaje

### 6. DeviceStatusCard

Tarjeta auxiliar con:

- Eyebrow: `DISPOSITIVOS`
- Titulo: `Estado y bateria`
- Lista de dispositivos

Cada fila:

- Icono de smartphone
- Nombre o codigo
- Indicador visual de bateria
- Porcentaje o `N/D`
- Texto relativo de ultima sincronizacion

Semantica de bateria:

- >50%: success
- 20-50%: warning
- <20%: destructive
- null: muted / `N/D`

### 7. WeatherCard

Tarjeta auxiliar con:

- Eyebrow: `CLIMA`
- Titulo: `Por ubicacion`
- Grid o stack compacto por ubicacion

Cada registro:

- Icono segun condicion
- Nombre de ubicacion
- Temperatura actual
- Rango max/min en mono
- Humedad disponible para posibles extensiones

Fuente:

- OpenWeatherMap real desde API server
- Cache server-side con TTL 10 minutos
- Si falla la API: devolver arreglo vacio y mostrar empty state

## Datos y calculos

### Conteos principales

- `total`: empleados activos de la organizacion
- `onTime`: presentes de hoy no marcados como `isLate`
- `late`: eventos del timeline con `isLate=true`
- `absent`: `total - onTime - late - offsite`, acotado a minimo cero si hay discrepancias
- `offsite`: total de empleados `WORK_OFFSITE` del dia

### Capacidad por ubicacion

No se almacena en schema nuevo. Se deriva con:

- `COUNT(employees WHERE locationId = X AND status = 'ACTIVE')`

### Bateria de dispositivos

Se agrega columna `battery_level` a `device`.

El endpoint de heartbeat debe aceptar `batteryLevel` opcional y persistirlo.

## Endpoints requeridos

### Attendance timeline

`GET /attendance/timeline`

Devuelve eventos del dia con:

- empleado
- ubicacion
- timestamp ISO
- tipo de evento
- bandera `isLate`
- paginacion

### Attendance hourly

`GET /attendance/hourly`

Devuelve buckets de horas `0-23` con conteo de check-ins del dia.

### Devices status summary

`GET /devices/status-summary`

Devuelve:

- id
- code
- name
- status
- batteryLevel
- lastHeartbeat
- locationId
- locationName

### Weather

`GET /weather`

Devuelve por ubicacion:

- locationId
- locationName
- temperature
- condition
- high
- low
- humidity
- `cachedAt`

## Responsive

### Desktop

- Se mantiene el grid editorial 2x2.
- Hero completo en dos columnas.

### Mobile

- Hero con tipografia reducida.
- `HeroStatCard` debajo del copy principal.
- Stack de una sola columna:
  - mapa hero
  - rail de ubicaciones
  - timeline
  - devices
  - weather

## Loading y estados vacios

Cada bloque debe tener loading state propio y empty state en espanol usando `next-intl`.

El skeleton general del dashboard debe reflejar:

- hero header
- mapa
- rail
- timeline
- tarjetas auxiliares

## Accesibilidad y UX

- Mantener soporte light/dark.
- Estados activos y hover distinguibles.
- Contraste suficiente en tarjetas invertidas.
- Controles clicables con tamanos comodos.
- Inputs y filtros en espanol.

## No objetivos

- No cambiar sidebar global ni arquitectura de auth.
- No introducir librerias de charting para el heatmap.
- No endurecer dependencia del clima: debe degradar con elegancia si OpenWeatherMap falla.
