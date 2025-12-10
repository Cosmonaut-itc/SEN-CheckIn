# Release 11 - LFT Payroll Compliance (México)

## Summary

- Payroll applies Mexican labor law rules: shift-based limits, overtime double/triple, and Sunday premium.
- Minimum wage validation by geographic zone (GENERAL vs ZLFN) with warnings/blocking per org policy.
- Web UI shows detailed payroll breakdown, blocking alerts, and MXN currency formatting; forms updated for daily pay, shift type, and geographic zone.
- New LFT-aware scheduling module: reusable templates, per-employee exceptions, calendar view, and validation tied to overtime enforcement (WARN/BLOCK) and payroll week start day.

## Details

- API:
    - Added enums for `shiftType`, `geographicZone`, `overtimeEnforcement`, and `scheduleExceptionType`.
    - Payroll calc derives normal/OT hours, double/triple pay, Sunday premium, and minimum wage checks per location zone; blocks processing if org policy is `BLOCK`.
    - Job positions store `dailyPay`; employees store `shiftType` and optional `scheduleTemplateId`; locations store `geographicZone`; payroll settings store `weekStartDay` and `overtimeEnforcement`.
    - Scheduling endpoints: CRUD for `schedule-templates` with LFT validation (daily/weekly limits, overtime caps, rest-day checks), per-employee `schedule-exceptions` (DAY_OFF/MODIFIED/EXTRA_DAY), and `/scheduling` for calendar export, template assignment (syncs `employee_schedule` rows), and dry-run validation.
    - Calendar merges template days, manual `employee_schedule` rows, and exceptions across a date range; responses include day source (`template`/`manual`/`exception`/`none`) and exception type.
- Web:
    - Job positions form/table include daily pay.
    - Employees form includes shift type selector; table shows shift and template linkage.
    - Locations form/table include geographic zone (GENERAL/ZLFN).
    - Payroll page uses MXN formatting, shows breakdown, and blocks processing when limits are exceeded; legal info banner added.
    - Payroll settings form includes overtime enforcement (warn/block) and legal rules card; week start day feeds scheduling views.
    - New `Schedules` dashboard page (sidebar nav) with tabs:
        - Calendar: weekly/monthly view filtered by location or employee, showing template/manual/exception sources with exception badges.
        - Templates: create/edit templates with shift presets, LFT warnings, weekly totals banner, and assign-to-employees flow.
        - Exceptions: manage day off / modified hours / extra day entries with date range and employee filters.

## Workflow

- Configure payroll settings first: set `weekStartDay` and overtime enforcement (`WARN` to allow warnings, `BLOCK` to prevent saving overages).
- Create schedule templates with the Template dialog; shift presets set typical hours (diurna/nocturna/mixta) and validation shows daily/weekly overages and missing rest days.
- Assign templates to employees from the Templates tab; assignment writes `employee_schedule` rows and stores the template reference on the employee.
- Capture deviations in Exceptions tab (day off, modified times, extra day); validation rejects invalid time ranges or duplicate dates.
- Use the Calendar tab to review effective schedules across a week or month by location or by employee; day cards indicate whether hours come from a template, manual schedule, or exception.

## Notes

- DB: `0013_polite_calypso.sql` adds `schedule_template`, `schedule_template_day`, `schedule_exception`, and `employee.schedule_template_id` (apply with `bun run db:gen && bun run db:mig`). Prior `0012_late_thundra.sql` remains required.
- Quality: API `bun run lint`, `bun run check-types`; Web `bun run lint:web`, `bun run check-types:web`.
- Minimum wage (CONASAMI 2025): GENERAL $278.80, ZLFN $419.88. Overtime limits: max 3h/day (3 days/week), first 9h double, extra triple; Sunday premium +25%.
