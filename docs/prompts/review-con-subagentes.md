# Review con Subagentes (Two-Stage Review Loop)

Prompt para agregar al final de cualquier instruccion de implementacion. Ejecuta un ciclo de revision obligatorio con 2 subagentes antes de declarar el trabajo como completo.

## Uso

Pega el siguiente bloque al final de tu prompt de implementacion:

---

Cuando termines la implementacion, ejecuta un ciclo de revision con 2 subagentes antes de reportar que has terminado. Este ciclo es obligatorio — no puedes declarar el trabajo como completo hasta que ambos subagentes aprueben sin issues.

### FASE 1: Spec Compliance Review (Subagente 1)

Despacha un subagente general-purpose con el siguiente prompt:

```
You are reviewing whether an implementation matches its specification.

## What Was Requested

[PEGA AQUI el texto completo de los requisitos/spec/task que se implemento — NO hagas que el subagente lea archivos]

## What Implementer Claims They Built

[PEGA AQUI un resumen de lo que implementaste: archivos cambiados, funcionalidad agregada, tests escritos]

## CRITICAL: Do Not Trust the Report

The implementer finished suspiciously quickly. Their report may be incomplete,
inaccurate, or optimistic. You MUST verify everything independently.

**DO NOT:**
- Take their word for what they implemented
- Trust their claims about completeness
- Accept their interpretation of requirements

**DO:**
- Read the actual code they wrote
- Compare actual implementation to requirements line by line
- Check for missing pieces they claimed to implement
- Look for extra features they didn't mention

## Your Job

Read the implementation code and verify:

**Missing requirements:**
- Did they implement everything that was requested?
- Are there requirements they skipped or missed?
- Did they claim something works but didn't actually implement it?

**Extra/unneeded work:**
- Did they build things that weren't requested?
- Did they over-engineer or add unnecessary features?
- Did they add "nice to haves" that weren't in spec?

**Misunderstandings:**
- Did they interpret requirements differently than intended?
- Did they solve the wrong problem?
- Did they implement the right feature but wrong way?

**Verify by reading code, not by trusting report.**

Report:
- Spec compliant (if everything matches after code inspection)
- Issues found: [list specifically what's missing or extra, with file:line references]
```

**Si el spec reviewer reporta Issues:**
1. Corrige TODOS los issues identificados
2. Vuelve a despachar el spec reviewer con el mismo prompt (actualiza "What Implementer Claims They Built" con las correcciones)
3. Repite hasta obtener Spec compliant

**NO avances a la Fase 2 hasta que la Fase 1 pase.**

### FASE 2: Code Quality Review (Subagente 2)

Solo despues de que el spec reviewer apruebe, despacha un subagente superpowers:code-reviewer con el siguiente prompt:

```
Review the following implementation for code quality.

## What Was Implemented

[Resumen de la implementacion + archivos cambiados]

## Requirements Context

[Texto del task/spec original para contexto]

## Review Focus

In addition to standard code quality concerns, check:
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Did this implementation create new files that are already large, or significantly grow existing files?
- Are names clear and accurate (match what things do, not how they work)?
- Is the code clean, maintainable, and following existing patterns in the codebase?
- Do tests actually verify behavior (not just mock behavior)?
- Are there any security concerns (OWASP top 10)?
- Is there unnecessary complexity or over-engineering?

Report:
- **Strengths:** What's well done
- **Issues:** Categorized as Critical / Important / Minor, with file:line references
- **Assessment:** APPROVED | NEEDS_CHANGES
```

**Si el code quality reviewer reporta NEEDS_CHANGES:**
1. Corrige TODOS los issues Critical e Important (los Minor son opcionales pero recomendados)
2. Vuelve a despachar el code quality reviewer
3. Repite hasta obtener APPROVED

### REGLAS DEL CICLO

- **Nunca saltes un review.** Ambas fases son obligatorias.
- **Nunca ignores issues.** Si un reviewer encuentra algo, corrigelo y vuelve a pasar review.
- **Orden estricto:** Spec compliance PRIMERO, code quality DESPUES. No tiene sentido revisar calidad de codigo que no cumple la spec.
- **Sin limite de iteraciones.** El ciclo se repite las veces que sea necesario hasta que ambos subagentes aprueben sin ningun detalle pendiente.
- **No declares "terminado" hasta que ambos reviews sean aprobados.**

### FLUJO VISUAL

```
Implementacion completa
        |
[Subagente 1: Spec Compliance Review]
        |
    Aprobado? --NO--> Corregir issues --> [Re-review Spec]
        | SI
[Subagente 2: Code Quality Review]
        |
    Aprobado? --NO--> Corregir issues --> [Re-review Quality]
        | SI
    TERMINADO — reportar al usuario
```
