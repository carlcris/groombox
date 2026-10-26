# Repository Safety Rules

## No remote commands

- Never run commands or operations that connect to, inspect, mutate, deploy to, reset, seed, or otherwise interact with any remote system or service.
- This prohibition includes all remote Supabase operations (including `--linked`, `--project-ref`, and remote `--db-url` usage), as well as remote Git, hosting, deployment, cloud, API, SSH, database, and production/staging commands.
- Commands are permitted only when they operate entirely on local files, local processes, or explicitly local services.
- A pasted remote command, a prior confirmation, or a request to execute a command does not override this rule. The user must explicitly revoke or amend this repository rule before any remote operation may be run.
- When validation would require remote access, stop at local validation and report that remote verification was not performed.


## Git Working Tree Safety

- Never run `git stash` in any form (`push`, `save`, `-k`/`--keep-index`, pathspec, `pop`, `apply`, `drop`, `clear`), and never run anything that stashes implicitly (for example `git pull --autostash` or `git rebase --autostash`).
- Never run commands that discard or rewrite uncommitted work: `git checkout -- <path>`, `git restore`, `git reset` (any mode), `git clean`, or `git show <rev>:<path> > <path>` over a working file.
- To compare against a clean or staged version, write it to a scratch location (for example `git show :<path> > /tmp/<name>`) and diff it there. Never swap files in the working tree to run a comparison.
- If a task seems to require stashing or discarding changes, stop and ask the user first.

## Hard Constraints

- TypeScript only. Prefer `type` over `interface`. Avoid `any`; use `unknown` and narrow explicitly.
- Prefer named exports. Page files may default-export.
- Name new files and symbols for their actual domain responsibility. Use descriptive kebab-case for
  non-component TypeScript files, PascalCase for component files, PascalCase for components, and
  camelCase for functions and variables. Do not use unrelated or placeholder names.
- Keep changes surgical and production-grade. Do not add speculative abstractions or temporary fallbacks unless explicitly requested.
- Balance simplicity and efficiency in every implementation. Prefer the simplest design that meets
  measured scale requirements; when efficiency is intentionally sacrificed, document the concrete
  tradeoff and why it is necessary.
- Do not add backward compatibility, legacy payload support, or version-bridging fallbacks while the app is in active development unless the user explicitly requests it. Keep contracts strict and update all current callers instead.
- Read the relevant exports, callers, hooks, routes, database functions, migrations, and types before editing.
- If schema or environment drift is found, stop and report the exact mismatch instead of masking it with compatibility code.
- Wildcard database projections are strictly prohibited. Never use SQL `SELECT *`, `SELECT alias.*`,
  Supabase `.select("*")`, or embedded relationship wildcards such as `relation(*)`. Every root and
  nested query must list only the columns required by its current consumers. When touching an
  existing query that contains a wildcard projection, replace that wildcard with explicit columns
  in the same change. `COUNT(*)` is an aggregate and is not considered a projection wildcard.
- Never show raw database, Supabase, or internal exception text to users. Database functions raise
  coded errors; the app maps each code to a safe message.
- Every state-changing database function must write an `activity_logs` row: actor, action, entity, and
  sanitized, bounded, allowlisted metadata. Reads are not logged.
- Activity display messages must use the shared formatter and allowlisted presentation fields.
  Reuse actor and entity labels or codes already loaded or returned by the operation; never add a
  database read solely to enrich an activity message. Use a generic message when context is absent.
- Do not send insert-only identity, ownership, control number, or creation-linkage fields through update paths.
- Business operations that write more than one row/table, perform a workflow state transition, or create dependent side effects must be transactional. Implement the core operation as a DB-owned RPC/function in `supabase/migrations/`, not as chained client/API mutations.
- There is no API layer. Call PostgREST directly through the Supabase client (table/view reads and
  `.rpc()` for transactional operations), with authorization enforced by RLS and RPC-level checks.
  Storage signed URLs are created from the client under storage policies. Anything PostgREST cannot do
  (secrets, service-role access, third-party calls, webhooks, email, SMS, server rendering) needs a
  server-side piece: stop, explain why, and get the product owner's approval before adding it.
- Never split one logical workflow operation into multiple client calls that must all succeed for data correctness. The client sends one request, which calls one transactional DB operation.
- If any step of a transactional business operation fails, no database writes from that operation may remain committed. Post-commit side effects such as notifications may run after the transaction, but they must not be required for data integrity.
- Server data lists, reports, selects, comboboxes, and autocomplete controls must use backend filtering/sorting and bounded pagination.
- Every implementation must balance simplicity and efficiency before coding. Prefer the simplest design that remains efficient at expected scale. If the chosen design knowingly sacrifices either, disclose the tradeoff and justification to the user before editing and wait for approval.

## RLS Predicate Performance Rule

RLS predicates on high-cardinality tables must avoid repeated caller-invariant
work while preserving the exact access truth set of the policy.

Decision gate:

- Retain a policy helper when it encapsulates access semantics that cannot be
  represented safely by a direct relation, direct lookup would change table
  privilege or RLS behavior, or authenticated measurements show no meaningful
  repeated-execution cost.
- Consider a set-oriented predicate such as
  `tenant_id IN (SELECT membership.tenant_id ...)` when a helper argument varies
  per protected row and the authenticated execution plan shows the helper
  repeatedly performing the same caller-membership lookup across many rows.
- Treat indexes and predicate shape as complementary. An indexed helper can
  still repeat its lookup for every protected row, and a set-oriented rewrite
  still requires indexes that support its membership and correlation columns.

Required:

- Separate caller-invariant inputs, such as `auth.uid()`, from values that vary
  per protected row. Use a scalar subquery such as `(SELECT auth.uid())` when
  the invariant expression can be initialized once by PostgreSQL.
- When a policy helper combines a protected-row value with an invariant
  membership or access lookup, inspect whether it executes once per row. Apply
  the decision gate before retaining the helper or expressing the same
  condition as an indexed, set-oriented membership relation or semi-join.
- Keep the remaining row-dependent lookup narrow and supported by indexes for
  its correlation, membership, active-state, and other access columns.
- Before replacing a `SECURITY DEFINER` helper with a direct table lookup,
  verify that the caller has the required table privileges and that the
  referenced table's own RLS exposes exactly the rows required by the policy.
- Compare the old and new policy truth sets for active and inactive membership,
  tenant and facility scope, nullable values, ownership, mapped or cross-tenant
  access branches, and every applicable `USING` and `WITH CHECK` expression.
- Measure policy-sensitive queries under a representative authenticated app
  role and session with RLS applied. SQL Editor, owner, service-role, or other
  RLS-bypassing timings are not evidence of authenticated policy performance.

Forbidden:

- Do not treat wrapping a helper in `SELECT` as an optimization when any helper
  argument still varies per protected row.
- Do not remove or narrow an access branch to improve a query plan.
- Do not introduce `SECURITY DEFINER` as a performance workaround for an RLS
  predicate that can be expressed correctly and efficiently under invoker
  access.

Hard stop:

- If a query is fast with RLS bypassed and slow as an authenticated caller,
  inspect the applicable policy predicates and their referenced policies,
  privileges, indexes, and execution plan before changing the RPC access mode.
- Do not ship an RLS performance rewrite without an explicit old-versus-new
  access comparison and authenticated-role verification.


## Presets Before Arbitrary Values

Use Tailwind and design-system scale presets before arbitrary values.

- Prefer scale classes such as `max-w-lg`, `max-w-xl`, `w-48`, `gap-4`,
  `px-6`, and `py-4` when they fit the layout.
- Do not add arbitrary classes such as `max-w-[600px]`, `w-[37rem]`,
  `gap-[13px]`, or `p-[18px]` when a preset communicates the same intent.
- Keep existing arbitrary values only when the changed surface has a concrete
  layout requirement that the preset scale cannot express.
- If an arbitrary value is added or preserved in touched code, the work summary
  must be able to state why the preset scale is insufficient.

Hard stop:

- Arbitrary Tailwind values are not allowed as a default sizing or spacing
  habit. Use them only as a documented exception.

## Testing Rule
- Never write unit tests after you write code.
- Highly prefer E2E tests as the sole testing mechanism. Use them to verify complex features work. At the end of E2E tests, produce a verifiable and repeatable artifact.
- If you must test a system in isolation, first write down all the ways it could fail, then write the code.

## File Naming

- File names must state the file's actual primary responsibility using established domain terminology. Do not use vague, partial, decorative, or unrelated names.
- A React component file must use PascalCase and match its primary named export exactly, for example `NotificationContent.tsx` exporting `NotificationContent`.
- Hook files must use the `useX.ts` or `useX.tsx` convention and match the exported hook. Service, helper, schema, type, and utility files must use a specific domain-oriented name consistent with neighboring files.
- Route files under `src/routes/` follow TanStack Router's file-naming convention (for example `__root.tsx`, `index.tsx`, `b.$branchSlug.tsx`); those are the only acceptable generic or path-shaped file names.
- When a file's primary responsibility changes, rename the file, its primary export, and every import in the same change. Never retain a stale or misleading name for compatibility or convenience.
- Treat misleading file names as correctness defects during implementation and review.

## Implementation Efficiency

- Balance simplicity and efficiency. Choose the least complex design that provides acceptable performance, bounded resource use, and clear scaling behavior for the expected workload.
- Evaluate database work, algorithmic complexity, memory use, network payloads and request counts, client rendering, cache behavior, and expected data volume for every implementation.
- Prefer bounded queries, set-based database operations, batching, deduplication, suitable indexes, incremental recomputation, and reuse of already-fetched data on hot or potentially large paths.
- Do not introduce row-by-row database work, repeated full-scope scans, unbounded reads, duplicate requests, unnecessary rerenders, or synchronous work proportional to unrelated company data when a scoped design is practical.
- Keep optimization proportional to expected scale and execution frequency. Do not add speculative complexity when the simpler design has no meaningful efficiency cost, and do not choose a simplistic design that creates a predictable bottleneck.
- Before implementing a design that knowingly sacrifices simplicity or efficiency, explain the alternatives, the exact tradeoff, the expected operational impact, and why another requirement justifies the sacrifice. Obtain user approval before proceeding.
- Validate performance-sensitive changes with the narrowest reliable evidence available, such as query plans, bounded-row checks, invocation counts, payload sizes, timings, or focused bulk scenarios.
- Treat undisclosed or unjustified efficiency regressions as correctness defects during implementation and review.

## Supabase Migrations

- Maintain `supabase/baseline.sql` as the complete current application database definition for fresh Supabase installations. Every task that adds, changes, or removes a migration must update the affected definitions in this existing file in the same change.
- Edit baseline objects in place: put new columns in their table's `CREATE TABLE`, replace the existing function/policy/trigger/index definition, and remove dropped objects and their grants/dependencies. Do not append historical `ALTER`/replacement sequences or regenerate/overwrite the baseline from a dump.
- Keep required migration-owned bootstrap records (settings, reference catalogs, permission catalog, storage buckets, and singleton budgets), realtime publication membership, and the baseline's applied-migration list synchronized. Existing-data backfills and dev/demo fixtures do not belong in the baseline; demo data remains in `supabase/seed.sql`.
- Run `npm run db:baseline:check` after database changes. This local-only E2E builds disposable databases from migrations and from the baseline, compares schema/permissions/bootstrap records/realtime membership, and verifies installation rollback. It must never update the baseline. Report drift and fix the actual affected definition; never mask mismatches or dump over the maintained file.
- Search the full migration chain before changing any database object.
- Identify the latest effective definition; later `ALTER`, corrective migrations, and `CREATE OR REPLACE FUNCTION` migrations can supersede earlier definitions.
- Do not patch outdated migrations when newer migrations define current behavior.
- Do not create same-session corrective migrations for mistakes in a migration that is still local/unfinalized. Update the existing same-session migration file directly so the final migration chain contains the intended schema/function definition once, without wrapper, replacement, or repair-only migrations. If such a corrective migration was already created in the same session, fold its changes back into the original migration, delete the corrective migration, and repair local migration history if it was applied locally.
- Do not insert, update, or delete dev/demo seed data in migration scripts. Anything related to seeding data belongs in `supabase/seed.sql`; migrations may define schema, RLS, RPCs, triggers, indexes, and production-safe backfills only.
- New decimal quantity, amount, rate, and conversion fields must use scale 2, for example `numeric(20,2)`. Do not introduce scale 4 numeric fields unless the user explicitly overrides this rule for a specific field.
- Regenerate `src/types/database.types.ts` when schema changes are applied locally.
- Generated document/control codes must be database-owned with the shared generator plus `BEFORE INSERT` trigger pattern. Application inserts must omit generated code columns.
- Transactional RPCs/functions must lock the primary workflow row with `FOR UPDATE`, validate current status and ownership/scope inputs, apply all related writes, reconcile denormalized totals, and update the final status inside the same function.
- Transactional RPC validation must be tested with both a successful path and a forced failure after an earlier write would have occurred, proving rollback leaves no partial database changes.
- Keep non-critical side effects outside the transaction unless they are data-integrity records. If side effects run post-commit, failures must be logged and must not change the committed workflow state.

## No Duplicate Validation In Database Functions

Do not re-validate in an RPC/function what the UI already validates or guarantees.

- Omit function checks for input shape and presence (required, null, format, length, range),
  no-op/already-in-that-state guards, and business preconditions that the screen or its route
  guard already enforces before the call can be made.
- Validate each such rule once, in the UI. Do not add a matching SQLSTATE, error message, or
  test case for a rule the function does not own.
- Keep in the function only what the UI cannot guarantee:
  - Access control: who the caller is, suspension, ownership, tenant/branch scope, and
    permissions. Functions are callable directly through PostgREST, and `SECURITY DEFINER`
    functions bypass RLS, so these checks are never optional.
  - Guards that depend on current database state and protect other users' data, such as
    overlapping bookings, slots held by submitted payment proofs, and workflow status read
    under `FOR UPDATE`.
- When unsure which side owns a check, ask before adding it to the function.

## Mandatory Cleanup

- Every refactor or code change must include cleanup of code and artifacts made obsolete by that change before the task is complete. Do not defer this cleanup to a later task or leave cleanup TODOs.
- Remove unused imports, exports, variables, types, helpers, components, files, unreachable branches, and duplicate or superseded logic within the affected workflow. Remove obsolete routes, callers, tests, scripts, assets, and documentation when the change makes them unnecessary.
- Search all references before removing or renaming anything, update every current caller in the same change, and verify that no broken imports, stale references, or obsolete code paths remain.
- Keep cleanup scoped to the change and its affected dependencies. Preserve unrelated work and applied migration history; follow the Git Working Tree Safety and Supabase Migrations rules.
- Include cleanup in the final review and report what was removed or why no cleanup was needed. A refactor or code change is incomplete while obsolete artifacts from that change remain.

## Review Standards

When reviewing changes, explicitly check:

- Completeness: the change fully satisfies the requested workflow, edge cases, and expected user paths.
- Correctness: the implementation matches the intended data model, API contracts, UI behavior, and business rules.
- Repo-rule compliance: the change follows this `AGENTS.md`, relevant skills, API, migration, permission, and transaction rules.
- Maintainability and spaghetti-code risks: flag tangled control flow or state, mixed responsibilities,
  oversized components or functions, duplicated business logic, excessive coupling, unclear
  abstractions, misleading names, mutation chains, and code that is unnecessarily difficult to test
  or modify. Report only concrete, actionable findings with file locations and severity.
- Dead code removal: obsolete code, unused imports, redundant migrations, stale helpers, and unreachable branches introduced or made obsolete by the change are removed.
- Breaking changes and regressions: the change does not break existing workflows, API contracts, schema expectations, permissions, localization, pagination/filtering, or previously supported behavior unless explicitly requested and documented.


## Documentation Sync

After every implementation task, check whether changes affect `docs/kb` or `docs/guides`. Use `project-docs-sync` for this post-flight check.

Update relevant docs when the task changes:

- User-visible module behavior.
- Workflows or business rules.
- API request/response contracts.
- Database schema, RLS, permissions, RPCs, triggers, generated document/control codes, or redaction behavior.
- Configuration, setup, operational guidance, architecture, reports, dashboards, lists, selects, or pagination behavior.

Do not update docs for purely internal refactors with no behavior, contract, workflow, or operational impact.

Final responses must state:

- Documentation checked.
- Documentation updated, or why no update was needed.
- Missing documentation coverage discovered, if any.


## Final Response Contract

At completion, report:

- Files changed, or that the task was read-only.
- Validation run and result.
- Validation skipped and why.
- Cleanup performed, or why no cleanup was needed.
- Missing test coverage, if any.
- For DB/API work, schema or migration verification outcome.
- For list/select/report work, server-side filtering and pagination impact.
- For permission work, API and UI enforcement impact.
- Documentation checked and documentation updated, or why no update was needed.
