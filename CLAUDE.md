# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

GroomBox is a booking and shop-management web app for salons, barbershops, and spas in the Philippines. Requirements are in `docs/prd.md` and `docs/trd.md`; see also `docs/app-flow.md`, `docs/design-brief.md`, `docs/backend-schema.md`, and `docs/implementation-plan.md`.

**Tech Stack:**
- Frontend: React + Vite single-page app (mobile-first responsive web), TanStack Router and Query, Tailwind with shadcn/ui
- Backend: Supabase (Postgres, Auth, Realtime, Storage, RLS), accessed through PostgREST only; no custom API layer
- Server-side pieces (server rendering, Edge Functions, webhooks, email, SMS): none in the first release; ask before adding any
- Auth: email/password or Google for owners and staff; Google or Facebook for clients; anonymous sessions for guests


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
- Read the relevant exports, callers, hooks, API routes, migrations, and types before editing.
- If schema or environment drift is found, stop and report the exact mismatch instead of masking it with compatibility code.
- Wildcard database projections are strictly prohibited. Never use SQL `SELECT *`, `SELECT alias.*`,
  Supabase `.select("*")`, or embedded relationship wildcards such as `relation(*)`. Every root and
  nested query must list only the columns required by its current consumers. When touching an
  existing query that contains a wildcard projection, replace that wildcard with explicit columns
  in the same change. `COUNT(*)` is an aggregate and is not considered a projection wildcard.
- Never expose raw database, Supabase, or internal exception text to API clients. Log internal details server-side and return safe messages.
- Every API route handling `GET`, `POST`, `PUT`, `PATCH`, or `DELETE` must use the shared activity
  logging wrapper. Mutation payloads must be sanitized and bounded; reads must log route and query
  context without response data. Run `npm run activity-logging:check` during feature post-flight.
- Activity display messages must use the shared formatter and allowlisted presentation fields.
  Reuse actor and entity labels or codes already loaded or returned by the operation; never add a
  database read solely to enrich an activity message. Use a generic message when context is absent.
- Do not send insert-only identity, ownership, control number, or creation-linkage fields through update paths.
- Business operations that write more than one row/table, perform a workflow state transition, or create dependent side effects must be transactional. Implement the core operation as a DB-owned RPC/function in `supabase/migrations/`, not as chained client/API mutations.
- For new features, do not add Next.js API routes. Call PostgREST directly through the Supabase client
  (table/view reads and `.rpc()` for transactional operations), with authorization enforced by RLS and
  RPC-level checks. Add an API route only when PostgREST cannot do the job (for example secrets, service-role
  access, third-party calls such as Resend, or signed-URL generation) and state why before adding it.
- Never split one logical workflow operation into multiple client calls that must all succeed for data correctness. The client may send one request; the API may validate/auth and call one transactional DB operation.
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
- Framework-reserved names such as `page.tsx`, `layout.tsx`, `loading.tsx`, and `route.ts` are the only acceptable generic file names.
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
  - Access control: who the caller is, suspension, ownership, tenant/venue scope, and
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

## Critical Architecture Rules

### Database & Timestamps
- **ALWAYS use `timestamptz`** for all booking-related timestamps
- **Each venue MUST have an IANA timezone** - used for all slot/pricing calculations
- **Use half-open intervals `[start_at, end_at)`** for slot overlap checks
- **Database timestamps are the source of truth** - never rely on client-side timers for expiry

### Payment Instructions
- **MUST snapshot payment instructions** onto the booking record when reservation is created
- This prevents owners from editing historical payment data after bookings are made
- Store snapshot in `payment_instructions_snapshot` field

### Booking State Machine
**Never silently release slots with submitted payment proofs** - when `review_expires_at` passes after proof submission, move to `review_expired_pending_resolution` and notify all parties (player may have already paid outside platform).

**Slot blocking rules:**
- `held` blocks slot only while `hold_expires_at > now()`
- `payment_submitted` and `needs_resubmission` block through `review_expires_at`
- `review_expired_pending_resolution` and `disputed` keep slots blocked indefinitely
- `hold_expired` and `cancelled_non_refundable` release slots

### Security & RLS
- **Owner identity files (government IDs, business docs) are private** - use short-lived signed URLs only
- **MUST audit log every admin access** to owner identity files
- **Suspended players cannot use existing authenticated sessions** - must block both sign-in and active sessions until `suspended_until` passes

### File Storage
- **5 MB max file size** for all uploads
- **MIME type validation required**
- **Court photos: max 3 per court**, separate from venue/payment media categories
- Support image/PDF only

## Common Development Patterns

### Implementing Booking Logic
```
// Use transactional RPCs or database constraints to prevent overlapping bookings
// Check conflicts with: active bookings, held bookings, review-blocked bookings, owner blocks
// Always snapshot payment instructions at booking creation time
// Store metadata in JSONB: proof_metadata, cancellation_metadata, policy_acceptance_metadata, dispute_metadata, notification_metadata
```

### Owner Application Flow
- Owner mode is requested from **account settings, NOT registration**
- Application collects identity/requirements only, **NOT an initial venue draft**
- One-time approval per owner account (no per-venue approval)
- Statuses: `draft` → `submitted` → `needs_changes` | `approved` | `rejected` | `suspended`

### Court Publishing Requirements
Cannot publish without:
- Approved owner status
- 1-3 court photos
- Sport type (pickleball, basketball, badminton, tennis)
- Location with lat/long
- Operating hours
- Fixed slot duration
- Pricing rules
- Payment instructions

### Pricing Rules
- Support: default hourly price, day-specific, peak/off-peak windows
- **Must validate conflicts** for overlapping pricing rules
- Use priority/order when multiple rules match
- Store effective dates

### Expiry Handling (Edge Functions)
- Edge Functions should be **idempotent**
- Create notifications AND trigger Resend emails
- Unpaid `held` bookings → `hold_expired` (release slots)
- Overdue `payment_submitted` → `review_expired_pending_resolution` (keep slots blocked, notify all parties)

### Multi-Slot Bookings
- Players can book multiple consecutive fixed slots
- Show full payment total AND per-slot price breakdown
- Preserve selected slot intent through sign-in flow
- Calculate `full_payment_amount` from pricing rules at booking time

### Proof Upload
- **Require policy acceptance BEFORE allowing upload**
- Required fields: payment reference number, amount paid, method
- Optional: notes
- Allow re-upload during review window (`needs_resubmission` status)
- Show warning that payments happen outside GroomBox

### Admin Suspension
- Presets: 1, 3, 7, 14, 30 days, or custom
- Must record: reason, admin actor, affected user, `suspended_until`, history
- Support early lifting and extension
- **Block both sign-in AND existing authenticated sessions**

## Slot Generation Rules

Generate bookable slots from:
- Court's slot duration
- Venue/court operating hours
- Owner blocks/offline holds (for walk-ins, maintenance, events, closures)
- Blocked dates
- Availability rules
- Pricing rules (applied in venue timezone)
- Active bookings (respecting state machine rules above)

## Demo/Seed Data

Create via **service-role seed script or documented Supabase Auth admin process** (NOT ordinary SQL migrations):
- Demo users: admin, players, pending owner, approved owner, rejected owner, suspended owner
- Link Auth users to profiles/applications/owner records
- Sports: pickleball, basketball, badminton, tennis
- Venues with geolocation (address, city/area, lat/long, timezone)
- Courts with 1-3 photos, pricing rules, operating hours
- Separate venue/payment media
- Bookings in ALL lifecycle states
- Notifications for each user type
- Owner offline blocks

## What NOT to Build (MVP Scope)

- Native mobile app
- OAuth/social login
- Automatic payment gateway
- Refunds/refund tracking
- Partial deposits
- Map-first booking UI
- Custom arbitrary booking times
- Multi-sport courts
- Venue-level admin approval
- Manual admin verification of payment instructions before publishing
- Tournaments/leagues/payroll/SaaS subscriptions
- Invite-based admin creation
- Payment tracking for owner offline blocks

## Key Gotchas

1. **Never auto-release slots with submitted proofs** - player may have already paid
2. **Public browsing allows slot selection before sign-in** - booking created after
3. **Owner mode ≠ registration** - it's a later account settings request
4. **One sport per court** - no multi-sport courts
5. **Full payment only** - no partial deposits
6. **Browser notifications are best-effort** - in-app + email are required channels
7. **Admins manually assigned in Supabase** - no invite system in MVP
8. **List-first browse** - not map-first (PostGIS deferred)
