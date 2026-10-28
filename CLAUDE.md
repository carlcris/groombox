# GroomBox repository instructions

This file provides guidance to AI coding agents working in this repository.

## Project Context

GroomBox is a booking and shop-management web app for salons, barbershops, and spas in the Philippines. Requirements are in `docs/prd.md` and `docs/trd.md`; see also `docs/app-flow.md`, `docs/design-brief.md`, `docs/backend-schema.md`, and `docs/implementation-plan.md`.

**Tech Stack:**
- Frontend: React + Vite single-page app (mobile-first responsive web), TanStack Router and Query, Tailwind with shadcn/ui
- Backend: Supabase (Postgres, Auth, Realtime, Storage, RLS), accessed through PostgREST only; no custom API layer
- Server-side pieces (server rendering, Edge Functions, webhooks, email, SMS): none in the first release; ask before adding any
- Auth: email/password or Google for owners and staff; Google or Facebook for clients; no guest or anonymous sessions


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
- This rule covers function code only. Table constraints (`NOT NULL`, `CHECK`, foreign key, unique,
  exclusion) protect data integrity for every caller and stay in the schema.

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
- Repo-rule compliance: the change follows these repository instructions, relevant skills, API, migration, permission, and transaction rules.
- Maintainability and spaghetti-code risks: flag tangled control flow or state, mixed responsibilities,
  oversized components or functions, duplicated business logic, excessive coupling, unclear
  abstractions, misleading names, mutation chains, and code that is unnecessarily difficult to test
  or modify. Report only concrete, actionable findings with file locations and severity.
- Dead code removal: obsolete code, unused imports, redundant migrations, stale helpers, and unreachable branches introduced or made obsolete by the change are removed.
- Breaking changes and regressions: the change does not break existing workflows, API contracts, schema expectations, permissions, localization, pagination/filtering, or previously supported behavior unless explicitly requested and documented.


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

## Critical Architecture Rules

### Tenancy
- The tenant is the **organization** (an owner's business). Each organization has one or more **branches**.
- **Every tenant table carries `organization_id`** with RLS. Policies resolve the caller's organizations with a set-based membership lookup, following the RLS Predicate Performance Rule.
- **Roles**: `owner` (whole organization), `manager` (assigned branches), `staff` (own schedule and floor view of assigned branches). Deposit review is allowed for owners, managers, and staff with `can_review_deposits`.
- **Client accounts are platform-wide** (`profiles`). Each organization keeps its own private client record (`clients`) linked to the account; it is never visible to another organization.
- **Restricted organizations**: membership lookups used by policies require `access_status = 'active'`. Statement tables use a separate owner policy that ignores access status. Members can always read their own memberships, including the organization's name and access status, through the `my_memberships` view so the app can show the restriction notice. Client-facing booking functions never check access status.

### Database & Timestamps
- **ALWAYS use `timestamptz`** for booking, shift, closure, and billing timestamps
- **Each branch MUST have an IANA timezone** (default `Asia/Manila`), used for all slot and business-date calculations
- Branch hours, staff shifts, and price rules are weekly windows in local `time`; a day can have several, and a window whose end is not after its start runs past midnight and belongs to the day it starts
- A sale's business date is its start in the branch timezone minus the branch's `business_day_starts_at` (default midnight)
- **Use half-open intervals `[start_at, end_at)`** for overlap checks
- **Database timestamps are the source of truth** - never rely on client-side timers for expiry
- Money is `numeric(20,2)`; percentages are `numeric(5,2)`

### Money Rules
- **Prices, deposits, and convenience fees are calculated in the database**, never taken from the client
- **Deposits are optional**: the organization rule is `none`, `fixed`, or `percent`, with a per-service override; a deposit that is set must be greater than zero
- With a deposit, `amount_due = deposit_amount + convenience_fee`, paid up front; the deposit is deducted at checkout, the fee is not
- Without a deposit, `amount_due` is zero, the online booking is confirmed at once, and the convenience fee is added to the bill at checkout
- The fee is a percentage of the booking's service total, bounded by the minimum and maximum in `platform_settings`
- **Create exactly one `fee_entries` row per online booking**: when its deposit is accepted, or at checkout when it had no deposit. Never delete or reverse it once created. A no-deposit online booking that is cancelled or a no-show creates none
- Staff-entered appointments and walk-ins carry no deposit and no fee
- Money never passes through GroomBox: clients pay the shop, owners pay GroomBox against statements

### Payment Instructions
- **MUST snapshot payment instructions** onto the booking record when the hold is created
- This prevents owners from editing historical payment data after bookings are made
- Store snapshot in `payment_instructions_snapshot` field; also snapshot service names, durations, and prices in `booking_services`

### Booking State Machine
**Never silently release slots with submitted payment proofs** - when `review_expires_at` passes after proof submission, move to `review_expired_pending_resolution` and notify both sides (the client may have already paid outside the platform).

**Slot blocking rules:**
- `held` blocks the slot only while `hold_expires_at > now()`
- `payment_submitted` and `needs_resubmission` block the slot
- `review_expired_pending_resolution` keeps the slot blocked until staff accept or reject
- `confirmed`, `checked_in`, `in_service`, and `completed` block the slot
- `hold_expired`, `payment_rejected`, `cancelled`, and `no_show` release the slot
- `waiting` (walk-in queue) has no time range until service starts

**Overlap guard:** an exclusion constraint on `(staff_id, tstzrange(start_at, end_at, '[)'))` over the blocking statuses. Because a constraint cannot depend on `now()`, booking functions first move the staff member's expired holds to `hold_expired`, then insert.

### Security & RLS
- **Payment proof screenshots are private** - short-lived signed URLs only, readable by the submitter and permitted reviewers
- **Every online booking needs a signed-in client account**; anonymous sign-ins are disabled. Staff-entered appointments and walk-ins create an organization client record with no account
- **Public data goes through views** that expose only public columns (`public_branches`, `public_branch_services`, `public_branch_staff`)
- **The directory is for signed-in users only**, limited to published branches of listed organizations; a shop's own booking page never shows other shops
- `SECURITY DEFINER` only where a function must cross the caller's RLS limits (for example a client creating a booking inside an organization), and every such function performs its own access checks
- **Restricted organizations**: members are locked out of every branch; the owner can still read statements and payment instructions

### File Storage
- **5 MB max file size** for all uploads
- **MIME type validation required**; images only
- Buckets: `branch-media` (public), `payment-qr` (public), `payment-proofs` (private), `avatars` (public), `business-documents` (private)
- Paths start with `{organization_id}/` (or `{user_id}/` for avatars and business documents) so storage policies can scope them

## Common Development Patterns

### Implementing Booking Logic
```
// Use transactional RPCs and the exclusion constraint to prevent overlapping bookings
// Check conflicts with: blocking bookings, unexpired holds, review-blocked bookings, staff time off, branch closures
// Always snapshot payment instructions and services at hold creation time
// "Any available" picks the qualifying staff member with the fewest booked minutes that day
// Store metadata in JSONB: policy_acceptance_metadata, cancellation_metadata
```

### Shop Onboarding
- **Shops need approval**: a signed-in user applies to list a shop with a business registration photo, and a platform admin approves or rejects it. A rejected applicant can apply again. The platform admin can still restrict an organization later
- `create_organization` works only for the caller's approved, unused application; it creates the organization, the owner membership, and the first branch, and links the application, in one transaction. One application creates one organization
- Organization and branch slugs are generated by the database from the names at insert; owners cannot edit them and they never change
- Members join through single-use invite links carrying a role and branch assignments
- A bookable staff profile does not need a login; it can be linked to a member later

### Branch Publishing Requirements
Cannot publish a branch without:
- Address, city, and area
- Operating hours
- At least one offered service
- At least one bookable staff member with a shift at the branch
- Payment instructions (method, account name, account number, QR image), when any offered service takes a deposit
- Terms accepted by the owner

### Services, Pricing, and Commission
- Services are defined once per organization; `branch_services` marks which a branch offers, with an optional price override
- Only the owner edits the organization catalogue, staff profiles, and commission rates; managers edit branch offerings, price overrides, staff branch assignments, shifts, and time off for their branches
- A branch can set time-based prices per service (`branch_service_price_rules`: days of the week, time window, price). Price resolution: matching rule for the booking's start time, then the branch `price_override`, then the catalogue price. Every service in a booking takes the price for the booking's start time; walk-ins take the price when service starts
- A service may be "starting at" priced; the final price is set at checkout
- Deposit rule is per organization (`none`, `fixed`, or `percent`), with an optional per-service override
- Commission is the staff default percentage, overridden per staff and service, applied to each item's price **after discount**
- Tips go fully to the staff member who performed the service

### Scheduled Jobs (pg_cron)
- Jobs run inside Postgres and must be **idempotent**
- `expire_holds`: unpaid `held` past `hold_expires_at` → `hold_expired` (releases the slot)
- `expire_reviews`: `payment_submitted` or `needs_resubmission` past `review_expires_at` → `review_expired_pending_resolution` (keeps the slot, notifies both sides)
- `issue_fee_statements`: on a cut-off date, one statement per organization for unbilled entries at or above the statement minimum
- `restrict_overdue_organizations`: statements past `due_at` → organization `restricted`
- Notifications are in-app rows only; no email, SMS, or push in the first release

### Multi-Service Bookings
- A booking is one client, one staff member, and one or more services back to back
- Show each service's price and duration, the service total, deposit, convenience fee, amount due now, and balance due at the shop
- Preserve the selected services, staff, and time through the sign-in step

### Proof of Payment
- **Require policy acceptance BEFORE creating the booking**
- Required fields: payment reference number, amount paid, method
- Optional: screenshot, note
- Reporting payment stops the hold timer and starts the review timer
- Allow resubmission while in `needs_resubmission`; at most one `submitted` proof per booking at a time
- Show a warning that payments happen outside GroomBox

### Walk-ins, Checkout, and Daily Close
- Walk-ins enter as `waiting` with a per-branch, per-day queue number; `start_service` assigns staff and the time range
- `complete_checkout` is one transactional RPC: sale, items, payments, commission, deposit deduction, the convenience fee and fee entry for an online booking without a deposit, and booking completion
- A closed business day rejects new or changed sales until the owner reopens it
- The daily close requires every visit of the day to be completed, cancelled, or marked no-show

### Fee Billing and Restriction
- One cut-off schedule for all organizations, set in `platform_settings`
- Statements are per organization with a branch breakdown; balances under the statement minimum carry over
- Fee entries are insert-only; corrections are `adjustment` entries added by a platform admin
- `mark_statement_paid` restores access when no other statement is overdue
- Restriction locks members out of the app; booking links stay live and keep accepting bookings

### Platform Admins
- Assigned manually by inserting into `platform_admins` - no invite system in the first release

## Slot Generation Rules

Generate bookable start times from:
- Branch opening periods and closures (in the branch timezone); a booking fits inside one opening period and one shift
- Staff shifts at the branch and staff time off
- Services the staff member performs
- Total duration of the chosen services plus buffer time
- Blocking bookings (respecting the state machine rules above)
- Each start time is returned with its service total under the branch's time-based prices

## Demo/Seed Data

Create via **seed script or documented Supabase Auth admin process** (NOT migrations):
- Users: platform admin, owners, managers, staff with and without logins, clients with accounts
- Shop applications: pending, rejected, and approved
- Two organizations: one with two branches, one with one branch and `restricted` access
- Categories: salon, barbershop, spa
- Service catalogue, branch offerings and overrides, time-based price rules, staff, shifts, time off
- Branches with address, city/area, timezone, hours (including a split day and a branch open past midnight), photos, payment instructions and QR
- Bookings in ALL lifecycle states, online bookings with and without a deposit, walk-in and staff-entered clients without accounts, payment proofs in every status
- Completed sales and one closed business day
- Fee entries, one paid statement, one issued, one overdue
- Notifications for each user type

## What NOT to Build (First Release)

- Native mobile app
- Server rendering, Edge Functions, webhooks, or any custom API layer (ask first)
- Automatic payment gateway or in-app refunds
- Email, SMS, push notifications, or automated reminders
- Inventory, payroll export, memberships and packages, marketing campaigns
- Reviews, ratings, deals, vouchers, promoted listings, favourites
- Consolidated cross-branch reports beyond the daily close
- Official tax receipts
- Guest booking without an account
- Automated identity or business verification
- Invite-based platform admin creation
- Activity logs or an audit trail
- Map-first browse (list-first directory; PostGIS deferred)

## Key Gotchas

1. **Never auto-release slots with submitted proofs** - the client may have already paid
2. **Online booking needs an account** - walk-ins and staff-entered appointments do not
3. **Google sign-in is blocked inside Messenger and Instagram browsers** - prompt to open in the phone's browser first
4. **The fee is owed once a deposit is accepted, or at checkout when there is no deposit** - once owed, cancellations, refunds, and no-shows do not remove it
5. **Restriction locks members, not clients** - booking links keep working while an organization is restricted
6. **One staff member per booking** - multiple services run back to back
7. **With a deposit: deposit plus fee at booking, balance at the shop. Without: everything, fee included, at the shop**
8. **Platform admins are assigned manually in the database**
9. **List-first directory** - not map-first
