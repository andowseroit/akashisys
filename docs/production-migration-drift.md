# Production migration history drift

## Snapshot: 2026-09-05

Production Supabase project `flour-mgmt` has a substantially longer migration history than the repository's migration directory. The repository does not contain the complete set of production migration files.

This is a **repository synchronization problem**, not a database migration-history problem.

### Safety decision

- Do **not** run `supabase migration repair` to manufacture missing history.
- Do **not** rewrite historical migrations.
- Do **not** delete or reset production migration records.
- Treat the production migration table as authoritative for already-applied production changes.
- Every new schema change made during this hardening pass is represented by an exact-version migration file in this branch.

### Verified production tail

The pre-hardening production tail included:

- `20260903203055_add_admin_reopen_route_session`

This hardening pass then applied the following migrations:

- `20260904184356_harden_admin_reopen_and_stock_guard`
- `20260904184547_revoke_route_session_admin_membership`
- `20260904184730_tighten_route_session_admin_role`
- `20260904184744_grant_route_session_admin_auth_uid`
- `20260904184820_remove_admin_reopen_auth_dependency_v2`
- `20260904184832_harden_admin_reopen_identity_check`
- `20260904184852_secure_route_reopen_audit_write`
- `20260904185050_restore_correction_void_audit_action`

The repository contains matching files for these versions on the hardening branch. Some of the intermediate migrations were corrective iterations discovered during live verification; they are intentionally retained rather than rewritten because production migration history must remain truthful.

### Reconciliation strategy

The repository should eventually be synchronized from the actual remote schema using the normal Supabase migration workflow (for example, a controlled `supabase db pull`/schema review), followed by a careful review before merging. That synchronization work is separate from this security fix and must not be performed by falsifying the migration table.

Until that reconciliation is completed, maintainers must not assume that the local migration directory alone describes production.
