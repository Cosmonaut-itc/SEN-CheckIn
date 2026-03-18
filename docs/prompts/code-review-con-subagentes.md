# Code Review con Subagentes (Two-Stage Review)

Prompt independiente para revisar codigo ya existente o cambios recientes usando el mismo proceso de two-stage review con subagentes. A diferencia del prompt de review post-implementacion, este se usa cuando quieres revisar codigo que ya fue escrito — por ti o por alguien mas.

## Uso

Usa este prompt cuando quieras revisar un conjunto de cambios, un PR, o una seccion de codigo existente.

---

Necesito que revises los siguientes cambios/codigo usando un ciclo de revision con 2 subagentes. El ciclo es obligatorio — no puedes declarar la revision como completa hasta que ambos subagentes hayan emitido su veredicto y todos los issues encontrados hayan sido resueltos.

### CONTEXTO DEL REVIEW

Antes de despachar subagentes, recopila la siguiente informacion:

1. **Identifica los cambios a revisar:**
   - Si hay un branch o PR: ejecuta `git diff <base-branch>...HEAD` para obtener el diff completo
   - Si son archivos especificos: lee cada archivo cambiado
   - Si es codigo existente sin diff: lee los archivos relevantes

2. **Identifica la spec o requisitos:**
   - Busca en `docs/superpowers/specs/`, `docs/superpowers/plans/`, o el issue/PR description
   - Si no hay spec formal, infiere la intencion del codigo a partir de nombres, comments, y estructura

3. **Prepara el resumen de cambios:**
   - Lista de archivos modificados/creados/eliminados
   - Resumen funcional de lo que hacen los cambios

### FASE 1: Spec Compliance Review (Subagente 1)

Despacha un subagente general-purpose con el siguiente prompt:

```
You are reviewing whether an implementation matches its specification.

## What Was Requested

[PEGA AQUI la spec, plan, issue description, o requisitos inferidos.
Si no hay spec formal, describe la intencion funcional del codigo basandote en
lo que pudiste identificar. Indica explicitamente si la spec es formal o inferida.]

## What Was Built

[PEGA AQUI el resumen de cambios: archivos, funcionalidad, tests]

## CRITICAL: Do Not Trust the Summary

The summary may be incomplete, inaccurate, or optimistic.
You MUST verify everything independently by reading the actual code.

**DO NOT:**
- Take the summary's word for what was implemented
- Trust claims about completeness
- Accept the summary's interpretation of requirements

**DO:**
- Read the actual code that was written
- Compare actual implementation to requirements line by line
- Check for missing pieces
- Look for extra features not in the spec
- Verify that tests actually test the claimed behavior

## Your Job

Read the implementation code and verify:

**Missing requirements:**
- Was everything in the spec/requirements implemented?
- Are there requirements that were skipped or missed?
- Are there claimed features that don't actually work?

**Extra/unneeded work:**
- Was anything built that wasn't requested?
- Is there over-engineering or unnecessary features?
- Are there "nice to haves" that weren't in spec?

**Misunderstandings:**
- Were requirements interpreted differently than intended?
- Was the wrong problem solved?
- Was the right feature implemented the wrong way?

**Verify by reading code, not by trusting the summary.**

Report:
- Spec compliant (if everything matches after code inspection)
- Issues found: [list specifically what's missing or extra, with file:line references]
- If spec was inferida: flag any ambiguities where the implementation MIGHT be wrong
  but you can't be sure without a formal spec
```

**Si el spec reviewer reporta Issues:**
1. Corrige TODOS los issues identificados
2. Vuelve a despachar el spec reviewer (actualiza el resumen de cambios con las correcciones)
3. Repite hasta obtener Spec compliant
4. Si la spec es inferida y hay ambiguedades, pregunta al usuario antes de corregir

**NO avances a la Fase 2 hasta que la Fase 1 pase.**

### FASE 2: Code Quality Review (Subagente 2)

Solo despues de que el spec reviewer apruebe, despacha un subagente superpowers:code-reviewer con el siguiente prompt:

```
Review the following code for quality.

## What Is Being Reviewed

[Resumen de los cambios + lista de archivos]

## Requirements Context

[Spec/requisitos para entender la intencion — el subagente necesita esto
para distinguir entre "codigo innecesario" y "codigo que cumple un requisito no obvio"]

## Diff

[Si hay diff disponible, incluyelo. Si no, indica los archivos a revisar.]

## Review Focus

**Architecture and Design:**
- Does each file have one clear responsibility with a well-defined interface?
- Are units decomposed so they can be understood and tested independently?
- Are abstractions at the right level — not too granular, not too coarse?
- Does the code follow existing patterns in the codebase?

**Code Quality:**
- Are names clear and accurate (match what things do, not how they work)?
- Is the code clean, readable, and maintainable?
- Is there unnecessary complexity or over-engineering?
- Are there magic numbers, hardcoded values, or unclear constants?
- Is error handling appropriate and consistent?

**Testing:**
- Do tests actually verify behavior (not just mock behavior)?
- Is test coverage adequate for the changes?
- Are edge cases covered?
- Are tests readable and maintainable?

**Security:**
- Are there any OWASP top 10 vulnerabilities?
- Is user input validated at system boundaries?
- Are there potential injection points (SQL, XSS, command)?
- Are secrets or credentials hardcoded?

**Performance:**
- Are there obvious performance issues (N+1 queries, unnecessary re-renders, etc.)?
- Are there missing indexes for database queries?
- Is there unnecessary data loading?

Report:
- **Strengths:** What's well done
- **Issues:** Categorized as Critical / Important / Minor, with file:line references
  - Critical: Security vulnerabilities, data loss risks, broken functionality
  - Important: Bugs, significant quality issues, missing error handling
  - Minor: Style, naming, minor improvements
- **Assessment:** APPROVED | NEEDS_CHANGES
```

**Si el code quality reviewer reporta NEEDS_CHANGES:**
1. Corrige TODOS los issues Critical e Important
2. Issues Minor: corrige los que sean rapidos, documenta los que requieran mas trabajo
3. Vuelve a despachar el code quality reviewer
4. Repite hasta obtener APPROVED

### REGLAS DEL CICLO

- **Nunca saltes un review.** Ambas fases son obligatorias.
- **Nunca ignores issues.** Si un reviewer encuentra algo, corrigelo y vuelve a pasar review.
- **Orden estricto:** Spec compliance PRIMERO, code quality DESPUES.
- **Sin limite de iteraciones.** El ciclo se repite hasta que ambos subagentes aprueben.
- **No declares la revision como "completa" hasta que ambos reviews pasen.**
- **Si no hay spec formal:** el spec reviewer trabaja con requisitos inferidos pero debe flaggear ambiguedades. Consulta al usuario antes de hacer cambios basados en inferencias.

### FLUJO VISUAL

```
Recopilar contexto (diff, spec, archivos)
        |
[Subagente 1: Spec Compliance Review]
        |
    Aprobado? --NO--> Corregir issues --> [Re-review Spec]
        | SI
[Subagente 2: Code Quality Review]
        |
    Aprobado? --NO--> Corregir issues --> [Re-review Quality]
        | SI
    REVIEW COMPLETO — reportar resultado al usuario
```

### REPORTE FINAL

Cuando ambos reviews pasen, reporta al usuario:

```
## Review Completo

**Spec Compliance:** Aprobado (N iteraciones)
**Code Quality:** Aprobado (N iteraciones)

### Issues Encontrados y Resueltos
- [Lista de issues que se corrigieron durante el ciclo]

### Issues Minor Pendientes (si aplica)
- [Issues minor que no se corrigieron, con justificacion]

### Observaciones
- [Cualquier nota relevante sobre la calidad general, patrones encontrados, o sugerencias para el futuro]
```
