# Production migration history drift

## Snapshot: 2026-09-05

Production Supabase project `flour-mgmt` reports **71 applied migrations**. The Git repository's `supabase/migrations` directory does not contain the complete set of those production migration files.

This is a **repository synchronization problem**, not a database migration-history problem.

### Safety decision

- Do **not** run `supabase migration repair` to manufacture missing history.
- Do **not** rewrite historical migrations.
- Do **not** delete or reset production migration records.
- Treat the production schema and migration table as authoritative for already-applied production changes.
- New schema changes must be additive migrations committed to Git with the exact migration version recorded in production.

### Verified production tail

The last pre-hardening production migration was:

- `20260903203055_add_admin_reopen_route_session`

The hardening migration was applied as:

- `20260904184356_harden_admin_reopen_and_stock_guard`

The latter version is intentionally the exact version recorded by the production migration runner, so Git and production agree on the new migration identity.

### Reconciliation strategy

The repository should eventually be synchronized from the actual remote schema using the normal Supabase migration workflow (for example, a controlled `supabase db pull`/schema review), then the resulting historical representation should be reviewed before merging. That synchronization work is separate from this security fix and must not be performed by falsifying the migration table.

Until that reconciliation is completed, maintainers must not assume that the local migration directory alone describes production.
