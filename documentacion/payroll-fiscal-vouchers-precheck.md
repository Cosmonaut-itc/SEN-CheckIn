# Payroll fiscal voucher precheck

Esta capa prepara snapshots fiscales internos por empleado y corrida de nómina.

Alcance explícito:

- No genera XML CFDI.
- No sella XML con CSD.
- No timbra con PAC.
- No valida aceptación SAT/PAC.
- No implementa cancelación ni sustitución.

El estado `READY_TO_STAMP` significa únicamente que el snapshot pasó las validaciones internas mínimas de pre-timbrado. No debe interpretarse como CFDI válido, sellado o aceptado por SAT/PAC.
