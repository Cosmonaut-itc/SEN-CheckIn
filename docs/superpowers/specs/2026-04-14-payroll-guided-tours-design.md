# FEAT: Recorridos guiados completos para Nómina, PTU y Aguinaldo

**Fecha:** 2026-04-14
**Rama:** `feat/interactive-guided-tours`
**PR destino:** `main`

## Contexto

La página de nómina ya tiene un tour base, pero hoy solo cubre una parte limitada de la corrida regular y deja fuera la mayor parte de la experiencia de `PTU` y `Aguinaldo`.

El usuario quiere que:

1. El tutorial principal de nómina explique mejor la página.
2. `PTU` y `Aguinaldo` tengan sub-recorridos propios.
3. El usuario cambie manualmente de pestaña.
4. Los sub-recorridos también se auto-lancen la primera vez que el usuario abra cada pestaña.

## Objetivo

Convertir la experiencia actual en un sistema de recorridos por secciones dentro de la misma página:

- `payroll`: recorrido principal de la pestaña de nómina regular.
- `payroll-ptu`: sub-recorrido de la pestaña PTU.
- `payroll-aguinaldo`: sub-recorrido de la pestaña Aguinaldo.

Cada recorrido debe persistir su progreso por separado para que se ejecute una sola vez por usuario y organización, con replay manual desde el botón de ayuda.

## Enfoque recomendado

### 1. Mantener un tour principal y agregar dos sub-recorridos reales

No conviene estirar el tour actual para que sobreviva a cambios de pestaña dentro de una sola sesión de Joyride. Eso haría frágil el flujo porque dependería de targets que existen solo en tabs no activas.

En su lugar:

- `payroll` cubre la pestaña principal.
- `payroll-ptu` se dispara cuando el usuario abre `PTU`.
- `payroll-aguinaldo` se dispara cuando el usuario abre `Aguinaldo`.

### 2. Controlar la pestaña activa desde `PayrollPageClient`

Hoy el `Tabs` de nómina usa `defaultValue="payroll"` y por eso la página no sabe de forma explícita qué tab está activa.

Se debe cambiar a estado controlado:

```tsx
const [activeTab, setActiveTab] = useState<'payroll' | 'ptu' | 'aguinaldo'>('payroll');
```

Luego:

- `useTour('payroll', activeTab === 'payroll')`
- `useTour('payroll-ptu', activeTab === 'ptu' && Boolean(settings?.ptuEnabled))`
- `useTour('payroll-aguinaldo', activeTab === 'aguinaldo' && Boolean(settings?.aguinaldoEnabled))`

Esto permite que el auto-lanzamiento ocurra exactamente cuando el usuario entra por primera vez a cada tab.

### 3. Botón de ayuda contextual

El botón de ayuda no debe seguir reiniciando siempre `payroll`.

Debe reiniciar el recorrido correspondiente a la pestaña activa:

- pestaña `payroll` -> `payroll`
- pestaña `ptu` -> `payroll-ptu`
- pestaña `aguinaldo` -> `payroll-aguinaldo`

Esto evita duplicar botones y mantiene una sola entrada manual coherente para replay.

## Diseño del recorrido

### Tour principal: `payroll`

Propósito: orientar al usuario en la estructura general de la página y en la corrida regular.

Pasos propuestos:

1. `payroll-tabs`
   Explica que la página se divide en Nómina, PTU y Aguinaldo.
2. `payroll-legal-rules`
   Explica el bloque de reglas legales y referencias operativas.
3. `payroll-insights`
   Explica los indicadores legales y de contexto usados para cálculo.
4. `payroll-process`
   Explica filtros, periodo y acciones para calcular/procesar.
5. `payroll-preview-table-container`
   Explica la vista previa / tabla principal de la corrida.
6. `payroll-run-history`
   Explica el historial de corridas y sus acciones.
7. `payroll-tab-ptu`
   Indica que al abrir PTU se iniciará un sub-recorrido específico.
8. `payroll-tab-aguinaldo`
   Indica que al abrir Aguinaldo se iniciará otro sub-recorrido.

### Sub-recorrido: `payroll-ptu`

Propósito: explicar el flujo completo de preparación, cálculo, revisión y seguimiento de PTU.

Pasos propuestos:

1. `payroll-tab-ptu`
   Confirma que el usuario está en la pestaña PTU.
2. `payroll-ptu-config`
   Explica año fiscal, fecha de pago, ingreso gravable, porcentaje, inactivos y SMG.
3. `payroll-ptu-actions`
   Explica calcular, guardar borrador, procesar y cancelar.
4. `payroll-ptu-summary`
   Explica totales, estatus y advertencias.
5. `payroll-ptu-table`
   Explica ajustes por empleado, elegibilidad, días, cuota y neto.
6. `payroll-ptu-history`
   Explica historial, descarga CSV, edición de borradores y recibos.

Nota: la alerta de exención de PTU no debe ser ancla obligatoria porque depende de configuración. Si aparece, seguirá siendo visible como contexto, pero no formará parte del camino base.

### Sub-recorrido: `payroll-aguinaldo`

Propósito: explicar el flujo completo de cálculo y operación de aguinaldo.

Pasos propuestos:

1. `payroll-tab-aguinaldo`
   Confirma que el usuario está en la pestaña Aguinaldo.
2. `payroll-aguinaldo-config`
   Explica año, fecha de pago, inclusión de inactivos y SMG.
3. `payroll-aguinaldo-actions`
   Explica calcular, guardar borrador, procesar y cancelar.
4. `payroll-aguinaldo-summary`
   Explica totales, estatus y advertencias.
5. `payroll-aguinaldo-table`
   Explica días, salario diario, política de días, importes y advertencias.
6. `payroll-aguinaldo-history`
   Explica historial, CSV, recibos y reapertura de borradores.

## Anclas UI necesarias

Se deben agregar `data-tour` estables a contenedores completos, no a controles internos volátiles.

### `payroll-client.tsx`

- `payroll-tabs` ya existe
- `payroll-tab-ptu` ya existe como `data-testid`; conviene agregar también `data-tour`
- `payroll-tab-aguinaldo` ya existe como `data-testid`; conviene agregar también `data-tour`
- `payroll-legal-rules`
- `payroll-insights`
- `payroll-process` ya existe
- `payroll-run-history`

### `ptu-tab.tsx`

- `payroll-ptu-config`
- `payroll-ptu-actions`
- `payroll-ptu-summary`
- `payroll-ptu-table`
- `payroll-ptu-history`

### `aguinaldo-tab.tsx`

- `payroll-aguinaldo-config`
- `payroll-aguinaldo-actions`
- `payroll-aguinaldo-summary`
- `payroll-aguinaldo-table`
- `payroll-aguinaldo-history`

## Traducciones

Se requieren nuevas llaves en `apps/web/messages/es.json`.

### Cambios esperados

- Expandir `Tours.payroll.step1...step8`
- Agregar `Tours.payrollPtu.step1...step6`
- Agregar `Tours.payrollAguinaldo.step1...step6`

Todo el copy debe seguir en español y orientado a la acción del usuario.

## Persistencia y comportamiento

- Cada `tourId` se guarda por separado en la API actual de progreso.
- Completar `payroll` no debe marcar `payroll-ptu` ni `payroll-aguinaldo`.
- Completar `payroll-ptu` no debe afectar `payroll-aguinaldo`.
- Si una pestaña está deshabilitada por settings (`ptuEnabled` o `aguinaldoEnabled`), su sub-recorrido no debe auto-lanzarse ni mostrarse en replay contextual.

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `apps/web/lib/tours/payroll.ts` | Expandir el tour principal de nómina. |
| `apps/web/lib/tours/payroll-ptu.ts` | **NUEVO.** Definir sub-recorrido PTU. |
| `apps/web/lib/tours/payroll-aguinaldo.ts` | **NUEVO.** Definir sub-recorrido Aguinaldo. |
| `apps/web/lib/tours/registry.ts` | Registrar ambos sub-recorridos. |
| `apps/web/lib/tours/registry.test.ts` | Cubrir los nuevos tours y anchors. |
| `apps/web/app/(dashboard)/payroll/payroll-client.tsx` | Controlar tab activa, auto-launch por tab, ayuda contextual, anchors del tour principal. |
| `apps/web/app/(dashboard)/payroll/ptu-tab.tsx` | Agregar anchors estables para el sub-recorrido PTU. |
| `apps/web/app/(dashboard)/payroll/aguinaldo-tab.tsx` | Agregar anchors estables para el sub-recorrido Aguinaldo. |
| `apps/web/app/(dashboard)/payroll/payroll-client.test.tsx` | Validar tab activa / ayuda contextual / puntos de entrada. |
| `apps/web/components/tour-provider.test.tsx` | Ajustar expectativas si cambian tours registrados o comportamiento de replay. |
| `apps/web/messages/es.json` | Agregar y expandir copy del tutorial. |

## Criterios de aceptación

- [ ] El tour principal de nómina explica la página completa de la corrida regular.
- [ ] Al abrir `PTU` por primera vez, se auto-lanza el sub-recorrido de PTU.
- [ ] Al abrir `Aguinaldo` por primera vez, se auto-lanza el sub-recorrido de Aguinaldo.
- [ ] El usuario cambia manualmente de pestaña; el tour no lo hace por él.
- [ ] El botón de ayuda reinicia el recorrido correspondiente a la pestaña activa.
- [ ] Los sub-recorridos persisten su progreso por separado.
- [ ] Si `PTU` o `Aguinaldo` están deshabilitados por configuración, su recorrido no se dispara.
- [ ] Todos los textos del tutorial están en español.
- [ ] Hay cobertura de tests para registry, tour wiring y puntos de entrada principales.

## Riesgos y decisiones

1. **Tabs deshabilitadas**
   Si una tab está deshabilitada, el recorrido no debe intentar anclarse a ella como siguiente paso automático.

2. **Targets ausentes por render condicional**
   Los anchors deben vivir en contenedores que siempre existan cuando la tab está activa; evitar mensajes vacíos o bloques que dependen de resultados calculados.

3. **Replay coherente**
   El replay contextual desde ayuda es parte del diseño; no se debe dejar un botón que reinicie siempre el tour principal porque rompería la expectativa del usuario dentro de PTU/Aguinaldo.
