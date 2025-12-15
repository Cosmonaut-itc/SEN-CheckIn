# Release 10 - Payroll & Shifts

## Summary

- Added payroll calculation and processing with per-organization settings.
- Introduced employee weekly schedules for expected hours and attendance alignment.
- Extended job positions with hourly pay and payment frequency.

## Details

- API: new payroll routes (calculate/process, runs history) and payroll settings; job positions now store `hourlyPay` and `paymentFrequency`; employees track `lastPayrollDate` and schedules.
- Web: payroll page to calculate/review/process runs and view history; payroll settings page for week start; employees form now captures weekly schedules; job positions form shows pay fields; navigation updated.
- Data: new tables for payroll runs, run employees, payroll settings, and employee schedules.

## Notes

- Run `bun run db:gen` and `bun run db:mig` after pulling to apply schema changes.
- Quality checks: `bun run lint` and `bun run check-types` are currently passing.
