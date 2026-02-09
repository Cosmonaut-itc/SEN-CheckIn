# Actas administrativas laborales (México) — Guía y plantillas listas para usar (2026)

Última actualización: 2026-02-05  
Propósito: ayudarte a generar **actas administrativas laborales** con buena **fuerza probatoria** (orden, debido proceso interno, trazabilidad) y alineadas con obligaciones legales comunes en México.  
Aviso: esto **no es asesoría legal**. Un acta administrativa por sí sola **no garantiza** ganar un conflicto laboral; su valor depende del caso, del Reglamento Interior de Trabajo (RIT), del contrato/CCT, de la evidencia y del cumplimiento del procedimiento (incluyendo el aviso de rescisión cuando proceda).

---

## 1) Lo que SÍ y NO es un acta administrativa

### 1.1 Qué es (para tu motor/documentación)
Un **acta administrativa** es un documento interno en el que la empresa **hace constar hechos** (fecha/lugar/participantes), **recaba declaraciones** (trabajador y testigos) y deja evidencia de un **procedimiento disciplinario** o de investigación interna.

> En México, el acta administrativa no es una “figura única” con formato obligatorio en la LFT. Su valor práctico es ser **evidencia** (bien hecha) y demostrar **debido proceso** interno.

### 1.2 Qué NO es
- **No** es sustituto automático del **aviso de rescisión** cuando se termina la relación sin responsabilidad para el patrón.
- **No** es una sentencia ni un “castigo” por sí sola; las sanciones deben estar previstas en el **RIT/contrato/CCT**.

---

## 2) Base legal mínima que debes reflejar en el documento

### 2.1 Disciplina y derecho a ser oído (RIT) — LFT Art. 423 fracc. X
La LFT exige que el **Reglamento Interior de Trabajo** contenga:
- “Disposiciones disciplinarias y procedimientos para su aplicación”,  
- la suspensión como medida disciplinaria no puede exceder **8 días**, y  
- la persona trabajadora tiene **derecho a ser oída** antes de aplicar la sanción.  
Esto debe “vivir” en tu flujo de actas (dar audiencia y registro).  
Fuente: LFT Art. 423 fracción X. (ver compilación con última reforma DOF 21-02-2025 / reforma fracc. X DOF 19-12-2024).

### 2.2 Validez del RIT (depósito y publicidad) — LFT Arts. 424–425
- El RIT se formula por comisión mixta y se **deposita** ante el Centro Federal de Conciliación y Registro Laboral (CFCRL).  
- Surte efectos a partir del depósito; debe imprimirse/repartirse y fijarse en lugares visibles.  
Tu acta debe referir el RIT vigente (fecha de depósito y versión).

### 2.3 Si el caso escala a rescisión (terminación) — LFT Art. 47
Si la empresa busca rescindir la relación por causa justificada:
- Debe entregar **aviso escrito** que refiera claramente la conducta y fecha(s).  
- Debe entregarse personalmente al trabajador al momento del despido o, si no, comunicarlo al Tribunal competente dentro de 5 días hábiles para notificación personal.  
- La falta de aviso presume separación no justificada (salvo prueba en contrario).  
Esto es **separado** del acta, pero el acta puede ser evidencia que soporte hechos.

### 2.4 Datos personales (privacidad) — LFPDPPP (Particulares)
En un acta vas a tratar datos personales (identificación, hechos, testigos). Por eso:
- Limita datos a lo **necesario** para la finalidad (principios de licitud/finalidad/proporcionalidad).  
- Informa/soporta que existe un **aviso de privacidad** y que el tratamiento es para cumplir obligaciones derivadas de la relación laboral.  
Fuente: LFPDPPP (principios, licitud y aviso de privacidad).

---

## 3) Reglas de oro de redacción (para que el acta sea “defendible”)

1) **Hechos, no opiniones**: describe conductas observables (qué, cuándo, dónde, quién). Evita adjetivos (“irresponsable”, “conflictivo”).  
2) **Cronología**: usa una línea de tiempo; cada evento con fecha/hora aproximada.  
3) **Referencia a la norma interna**: cita el RIT/política aplicable (código y versión).  
4) **Audiencia / derecho de defensa**: incluye la sección de “manifestación del trabajador” y permite testigos de descargo.  
5) **Pruebas anexas**: integra evidencia (bitácoras, CCTV, correos). Enumera anexos.  
6) **Cierre limpio**: sin espacios en blanco; si hay correcciones, salvadas y firmadas.  
7) **Firma y constancia de entrega**: firma de comparecientes. Si se niega a firmar, deja constancia y firma con dos testigos.

---

## 4) Flujo recomendado (procedimiento) — “playbook” para tu agente

### 4.1 Preparación (antes del acta)
- Determina el **objetivo**: investigación / amonestación / suspensión / advertencia / cierre sin sanción.  
- Identifica el **hecho** y el **periodo** exacto.  
- Reúne evidencia mínima:
  - registro de asistencia, bitácora de acceso, tickets, órdenes, CCTV, fotografías, correos, etc.
- Verifica que el **RIT/política** contemple:
  - la conducta,
  - el tipo de sanción,
  - el procedimiento (incluye audiencia) y límites (máx. 8 días suspensión).
- Define quién instrumenta (RRHH / jefe inmediato) y quién será testigo (ideal: 2).

### 4.2 Levantamiento del acta
- Lee el propósito del acta y la referencia al RIT.  
- Da la palabra al trabajador para que:
  - declare lo que a su derecho convenga,
  - ofrezca testigos o evidencia,
  - firme de conformidad o asiente inconformidad.

### 4.3 Cierre y post-acta
- Determina (o propone) la medida: amonestación, suspensión (≤8 días), capacitación, plan correctivo, etc.  
- Entrega copia al trabajador (o deja constancia de negativa).  
- Resguarda original en expediente con control de acceso (datos personales).

---

## 5) Modelo de datos (machine-friendly) para tu sistema

```json
{
  "acta_id": "AA-2026-000145",
  "company": {
    "name": "EMPRESA SA DE CV",
    "rfc": "XXX000000XXX",
    "address": "DOMICILIO COMPLETO",
    "rit": {
      "version": "RIT-2025.02",
      "deposit_date": "2025-03-10",
      "cfcrl_folio": "FOLIO/EXPEDIENTE"
    }
  },
  "employee": {
    "employee_id": "E-00123",
    "full_name": "NOMBRE COMPLETO",
    "position": "PUESTO",
    "area": "ÁREA",
    "workplace": "CENTRO DE TRABAJO",
    "id_type": "INE|Pasaporte|Otro",
    "id_last4": "1234"
  },
  "acta": {
    "type": "investigation|warning|disciplinary",
    "date_time": "2026-02-05T10:30:00",
    "place": "SALA DE JUNTAS / UBICACIÓN",
    "purpose": "HACER CONSTAR HECHOS Y OÍR A LA PERSONA TRABAJADORA",
    "incident": {
      "incident_date_time_start": "2026-02-03T08:10:00",
      "incident_date_time_end": "2026-02-03T09:00:00",
      "location": "LUGAR DEL HECHO",
      "summary": "DESCRIPCIÓN NEUTRA DE HECHOS",
      "policies_breached": [
        {"policy_id":"RIT-5.2", "title":"Puntualidad", "sanction_range":"amonestación a suspensión"}
      ]
    },
    "participants": {
      "company_representative": {"name":"NOMBRE", "role":"RRHH/Jefe", "id":"INE..."},
      "secretary": {"name":"NOMBRE", "role":"Quien asienta el acta"},
      "witnesses_company": [{"name":"NOMBRE", "role":"Testigo de cargo 1"}, {"name":"NOMBRE", "role":"Testigo de cargo 2"}],
      "witnesses_employee": [{"name":"NOMBRE", "role":"Testigo de descargo 1"}]
    },
    "statements": {
      "employee_statement": "TEXTO",
      "witness_statements": [{"witness":"Testigo 1", "statement":"..."}]
    },
    "evidence": [
      {"type":"cctv|attendance|email|ticket|photo|other", "id":"ANEXO-1", "description":"..."}
    ],
    "resolution": {
      "outcome": "no_action|warning|suspension|termination_process",
      "sanction": {"type":"warning|suspension", "days": 0, "start_date": null, "end_date": null},
      "notes": "MEDIDAS CORRECTIVAS / FECHA DE REVISIÓN"
    },
    "signatures": {
      "employee_signed": true,
      "employee_refused_to_sign": false,
      "refusal_reason": null,
      "signatures": [{"name":"...", "role":"employee"}, {"name":"...", "role":"company_rep"}]
    },
    "delivery": {
      "copy_delivered_to_employee": true,
      "delivery_method": "handed|email|other",
      "delivery_proof": "acuse / evidencia"
    },
    "privacy": {
      "privacy_notice_reference": "AVISO DE PRIVACIDAD VIGENTE (URL o código interno)",
      "data_minimization_applied": true
    }
  }
}
```

---

## 6) Plantilla 1 — Acta Administrativa (general) en Markdown (lista para copiar/llenar)

> Consejo: imprime este documento en 2 tantos. Si lo gestionas digital, genera PDF con hash/folio y conserva logs.

---

# ACTA ADMINISTRATIVA LABORAL **[ACTA_ID]**

**Empresa:** [EMPRESA_NOMBRE] — RFC: [RFC]  
**Domicilio:** [DOMICILIO_EMPRESA]  
**Centro de trabajo:** [CENTRO_TRABAJO]  

**RIT/Política aplicable:** [RIT_VERSION] (Depósito: [RIT_FECHA_DEPOSITO] — Folio: [RIT_FOLIO])  
**Fecha y hora de levantamiento:** [FECHA_HORA_ACTA]  
**Lugar:** [LUGAR_ACTA]  

## I. Comparecientes
1) **Representante de la empresa:** [NOMBRE_REP], [CARGO], identificación: [TIPO_ID] [FOLIO/ULT4]  
2) **Persona trabajadora:** [NOMBRE_TRAB], [PUESTO], No. empleado: [NO_EMPLEADO], área: [AREA]  
3) **Quien asienta el acta (secretaría):** [NOMBRE_SECRETARIO], [CARGO]  
4) **Testigos de cargo (empresa):**
   - [TESTIGO_CARGO_1], [PUESTO/RELACIÓN]  
   - [TESTIGO_CARGO_2], [PUESTO/RELACIÓN]  
5) **Testigos de descargo (persona trabajadora, si desea):**
   - [TESTIGO_DESCARGO_1], [RELACIÓN]  
   - [TESTIGO_DESCARGO_2], [RELACIÓN]  

## II. Objeto del acta
Hacer constar los hechos ocurridos el día **[FECHA_HECHO]** en **[LUGAR_HECHO]**, así como **oír** a la persona trabajadora y recabar manifestaciones y evidencias, conforme al **Reglamento Interior de Trabajo** y a las disposiciones disciplinarias aplicables (incluyendo el derecho a ser oída previo a una sanción y el límite de suspensión).

## III. Relación de hechos (descripción objetiva)
**Contexto:** [DESCRIBE CONTEXTO SIN OPINIONES]  

**Hechos:**  
1. [HH:MM] — [DESCRIPCIÓN]  
2. [HH:MM] — [DESCRIPCIÓN]  
3. [HH:MM] — [DESCRIPCIÓN]  

**Norma interna/política relacionada:**  
- [RIT/POLÍTICA] — [ARTÍCULO/SECCIÓN] — [DESCRIPCIÓN BREVE]  

## IV. Evidencia (anexos)
Se hace constar la existencia de los siguientes anexos:
- **ANEXO 1:** [tipo] — [descripción]  
- **ANEXO 2:** [tipo] — [descripción]  
- **ANEXO 3:** [tipo] — [descripción]  

## V. Manifestación de la persona trabajadora (derecho de audiencia)
La persona trabajadora manifiesta (transcribir en primera persona, textual en lo posible):

> [DECLARACIÓN_TRABAJADOR]

¿Ofreció testigos/evidencia? [Sí/No]  
En caso afirmativo, se incorporan los testigos/evidencias descritos en los anexos.

## VI. Declaración de testigos
### Testigos de cargo
**[TESTIGO_CARGO_1]** declara:  
> [DECLARACIÓN]

**[TESTIGO_CARGO_2]** declara:  
> [DECLARACIÓN]

### Testigos de descargo (si aplica)
**[TESTIGO_DESCARGO_1]** declara:  
> [DECLARACIÓN]

## VII. Cierre, determinación y medidas
Con base en lo anterior, la empresa determina:

- **Resultado:** [SIN SANCIÓN / AMONESTACIÓN / SUSPENSIÓN / INVESTIGACIÓN ABIERTA]  
- **Medida disciplinaria (si aplica):**  
  - Tipo: [Amonestación verbal/escrita / Suspensión]  
  - En caso de suspensión: **[N] días** (no mayor a 8), del **[FECHA_INICIO]** al **[FECHA_FIN]**  
- **Medidas correctivas/no disciplinarias:** [CAPACITACIÓN / PLAN / SEGUIMIENTO]  
- **Fecha de revisión/seguimiento:** [FECHA]  

## VIII. Lectura, conformidad e inconformidad
Se lee la presente acta a todas las personas comparecientes, quienes manifiestan haberla entendido.

- La persona trabajadora: [CONFORME / INCONFORME] (si inconforme, asentar motivo):
  - Motivo: [MOTIVO_INCONFORMIDAD]

## IX. Entrega de copia
Se hace constar que se entrega copia simple de la presente acta a la persona trabajadora: **[Sí/No]**  
Medio de entrega: [Física / Correo / Otro] — Evidencia/acuse: [DESCRIPCIÓN]

## X. Protección de datos
Los datos personales asentados se tratarán conforme al **aviso de privacidad** de [EMPRESA_NOMBRE] y para finalidades vinculadas a la relación laboral, limitando el uso a lo necesario para este procedimiento.

## XI. Firmas
| Nombre | Calidad | Firma |
|---|---|---|
| [NOMBRE_TRAB] | Persona trabajadora | __________________ |
| [NOMBRE_REP] | Representante empresa | __________________ |
| [NOMBRE_SECRETARIO] | Quien asienta | __________________ |
| [TESTIGO_CARGO_1] | Testigo de cargo | __________________ |
| [TESTIGO_CARGO_2] | Testigo de cargo | __________________ |
| [TESTIGO_DESCARGO_1] | Testigo de descargo (si aplica) | __________________ |

---

## 7) Plantilla 2 — Constancia de negativa a firmar (anexo)

> Úsala si el trabajador se niega a firmar. No lo fuerces. Documenta la negativa y pide firma de testigos.

# CONSTANCIA DE NEGATIVA A FIRMAR — **[ACTA_ID]**

En [LUGAR], a [FECHA_HORA], se hace constar que la persona trabajadora **[NOMBRE_TRAB]** se negó a firmar el Acta Administrativa **[ACTA_ID]**.

Motivo expresado por la persona trabajadora (si lo indicó):  
> [MOTIVO]

Se deja constancia de que el acta fue leída y se ofreció copia, la cual: **[se entregó / se negó a recibir]**.

| Nombre | Calidad | Firma |
|---|---|---|
| [TESTIGO_1] | Testigo | __________________ |
| [TESTIGO_2] | Testigo | __________________ |
| [NOMBRE_SECRETARIO] | Quien asienta | __________________ |

---

## 8) Plantilla 3 — Citatorio (opcional, recomendado)

> No siempre es obligatorio, pero mejora el debido proceso y reduce alegatos de “no me enteré”.

# CITATORIO — **[ACTA_ID]**

**Para:** [NOMBRE_TRAB], No. empleado [NO_EMPLEADO]  
**Asunto:** Comparecencia para levantar acta administrativa / audiencia de hechos.  
**Fecha y hora:** [FECHA_HORA]  
**Lugar:** [LUGAR]  

Se le cita para que comparezca y manifieste lo que a su derecho convenga respecto a los hechos ocurridos el [FECHA_HECHO].  
Puede presentarse con testigos y/o evidencia.

**Emite:** [NOMBRE_REP], [CARGO] — Firma: __________________

---

## 9) Nota importante: cuando el acta puede escalar a rescisión (terminación)
Si el caso pretende usarse como base para rescindir (terminación sin responsabilidad para el patrón), verifica cumplimiento del **aviso de rescisión** con los requisitos del Art. 47 (conducta y fechas, entrega personal o vía Tribunal).  
El acta ayuda como evidencia, pero el aviso (y su notificación correcta) suele ser crítico.

---

## 10) Checklist final (para tu agente)
- [ ] ¿Cita RIT/política y versión vigente (depositada y publicada)?  
- [ ] ¿Incluye derecho de audiencia y declaración del trabajador?  
- [ ] ¿Hechos objetivos + cronología + anexos de evidencia?  
- [ ] ¿Sanción prevista en RIT y suspensión ≤ 8 días?  
- [ ] ¿Firmas completas o constancia de negativa?  
- [ ] ¿Constancia de entrega de copia?  
- [ ] ¿Minimización de datos + referencia a aviso de privacidad?

---

## Referencias (links)
- LFT (Cámara de Diputados): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFT.pdf  
- LFPDPPP (Cámara de Diputados): https://www.diputados.gob.mx/LeyesBiblio/pdf/LFPDPPP.pdf  

