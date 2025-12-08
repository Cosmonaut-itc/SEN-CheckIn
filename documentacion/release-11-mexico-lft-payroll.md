# Release 11 - LFT Payroll Compliance (México)

## Summary

- Payroll now applies Mexican labor law rules: shift-based limits, overtime double/triple, and Sunday premium.
- Minimum wage validation by geographic zone (GENERAL vs ZLFN) with warnings/blocking per org policy.
- Web UI shows detailed payroll breakdown, blocking alerts, and MXN currency formatting; forms updated for daily pay, shift type, and geographic zone.

## Details

- API:
    - Added enums for `shiftType`, `geographicZone`, and `overtimeEnforcement`.
    - Payroll calc now derives normal/OT hours, double/triple pay, Sunday premium, and minimum wage checks per location zone; blocks processing if org policy is `BLOCK`.
    - Job positions store `dailyPay`; employees store `shiftType`; locations store `geographicZone`; payroll settings store `overtimeEnforcement`.
    - Payroll runs persist detailed breakdown fields.
- Web:
    - Job positions form/table include daily pay.
    - Employees form includes shift type selector; table shows shift.
    - Locations form/table include geographic zone (GENERAL/ZLFN).
    - Payroll page uses MXN formatting, shows breakdown, and blocks processing when limits are exceeded; legal info banner added.
    - Payroll settings form includes overtime enforcement (warn/block) and legal rules card.

## Notes

- DB: `bun run db:gen && bun run db:mig` applied (0012_late_thundra.sql).
- Quality: API `bun run lint`, `bun run check-types`; Web `bun run lint:web`, `bun run check-types:web`.
- Minimum wage (CONASAMI 2025): GENERAL $278.80, ZLFN $419.88. Overtime limits: max 3h/day (3 days/week), first 9h double, extra triple; Sunday premium +25%.
