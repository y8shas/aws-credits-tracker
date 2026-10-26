# Changelog

## 1.0.0 — 2026-10-26
First public release.
- Dashboard: credits left, usage today / yesterday / 7 days / month / 30 days / overall, burn rate, projected run-out date, expiry budget, 14-day chart, top services.
- EC2 launch page: monthly (and hourly) On-Demand price badge beside every instance type, plus "days of credits" it would consume.
- Keys kept in `storage.session` by default; optional "remember on this device". Content scripts cannot read stored keys.
- Friendly error messages for the common IAM / billing / clock problems.
- Unit tests, including the official AWS SigV4 example.
