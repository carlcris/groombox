# GroomBox: technical requirements (TRD)

Last updated: 2026-10-09
Related: [product requirements](prd.md), [app flow](app-flow.md), [design brief](design-brief.md), [backend schema](backend-schema.md), [implementation plan](implementation-plan.md)

## 1. Architecture

```
Browser (React single-page app, static files)
   │  supabase-js
   ▼
Supabase
   ├─ Auth        email/password, Google, Facebook, anonymous sessions
   ├─ PostgREST   tables, views, and database functions (the only data path)
   ├─ Realtime    floor queue, deposit reviews, notifications
   ├─ Storage     branch photos, payment QR images, payment proofs
   └─ Postgres    row-level security, functions, constraints, pg_cron jobs
```

There is no application server, no custom API layer, no server-rendered page, and no Edge Function in the first release. Adding any of these needs the product owner's approval first.

## 2. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript, strict mode |
| Build | Vite, single-page app |
| UI | React |
| Routing | TanStack Router, file-based, code-split per route |
| Server state | TanStack Query |
| Forms | TanStack Form with Zod schemas |
| Components | shadcn/ui on Tailwind |
| Icons | Lucide |
| Backend | Supabase: Postgres, Auth, Realtime, Storage |
| Data access | PostgREST through `supabase-js`; `.rpc()` for every multi-row or state-changing operation |
| Scheduling | `pg_cron` inside Postgres |
| Schema | Supabase CLI migrations, `supabase/baseline.sql`, generated `src/types/database.types.ts` |
| Tests | Playwright end-to-end against local Supabase; pgTAP for row-level rules |
| Installable | Progressive web app manifest and service worker (app shell only) |
| Hosting | Any static host |

## 3. Project structure

```
src/
  routes/                 TanStack Router file routes
    _client/              client area (signed-in clients)
    _shop/                floor view and owner dashboard (members)
    _admin/               platform admin
    b.$branchSlug/        public booking flow
    o.$orgSlug/           public organization page
  features/               one folder per domain
    booking/  deposits/  floor/  checkout/  daily-close/
    billing/  catalogue/  staff/  clients/  directory/  organization/
  components/ui/          shadcn components
  lib/                    supabase client, query client, formatting, time zone helpers
  types/database.types.ts generated
supabase/
  migrations/
  baseline.sql
  seed.sql
  tests/                  pgTAP
e2e/                      Playwright
docs/
```

Each feature folder holds its queries, mutations, schemas, and components. A feature does not import another feature's internals.

## 4. Data access rules

1. **Reads** go to tables or views through PostgREST with explicit column lists. No `select("*")`, at any nesting level.
2. **Writes that touch one row with no rules** may use table inserts and updates under row-level security.
3. **Everything else is a database function** called with `.rpc()`: any write to more than one row or table, any status change, anything that calculates money. One client call per logical operation.
4. **Functions are transactional**: lock the main row with `FOR UPDATE`, check current status and the caller's scope, apply all writes, set the final status. A failure leaves nothing committed.
5. **Functions do not repeat UI validation.** They check only what the UI cannot guarantee: who the caller is, tenant and branch scope, permissions, and conditions that depend on current database state such as overlapping bookings.
6. **Lists are paginated and filtered in the database.** No unbounded reads; search boxes query the server.
7. **Errors**: functions raise coded errors; the app maps codes to safe messages. Raw database text is never shown.
8. **Money** uses `numeric(20,2)`. Percentages use `numeric(5,2)`.

## 5. Authentication

| Audience | Method |
|---|---|
| Owners, managers, staff | Email and password, or Google |
| Clients | Google or Facebook |
| Guests | Supabase anonymous session, created when they start a booking, protected by a bot check (Cloudflare Turnstile through Supabase Auth settings) |
| Platform admins | Same sign-in as members; admin status comes from a `platform_admins` row added by hand |

- A guest upgrades by linking a Google or Facebook identity to the anonymous user, so the user id and its bookings are kept.
- Google blocks sign-in inside in-app browsers such as Messenger and Instagram. The app detects these and shows "open in your browser" before offering Google. Guest booking is unaffected.
- One person can be a client and a member with the same account.

## 6. Authorization

- Every tenant table has `organization_id` and row-level security.
- Policies resolve the caller's organizations through a set-based membership lookup, with `(select auth.uid())` evaluated once per statement, and indexes on the membership and correlation columns. Follow the RLS predicate performance rule in the repository instructions.
- Role and branch scope:

| Role | Read | Write |
|---|---|---|
| Owner | Whole organization | Whole organization |
| Manager | Assigned branches, plus the catalogue and client list | Assigned branches |
| Staff | Own schedule, floor data for assigned branches | Visit status for assigned branches; deposit review only if permitted |
| Client or guest | Own profile, own bookings and proofs, public branch data | Through booking functions only |
| Platform admin | Statements, fee entries, organizations, platform settings | Statements, settings, organization access |

- **Restriction**: the membership lookup used by policies requires the organization's access status to be `active`. Statement tables use a separate policy that ignores access status for the owner. Client-facing booking functions do not check access status.
- **Public data**: guests and clients read branch, service, and staff display data through dedicated views that expose only public columns.
- **Directory**: a view available only to signed-in, non-anonymous users, limited to listed organizations.
- `SECURITY DEFINER` is used only where a function must cross a caller's row-level limits, such as a client creating a booking inside an organization. Each such function performs its own access checks.

## 7. Booking engine

- **Availability** is a database function returning open start times for a branch, date, service list, and optional staff member. Inputs: branch hours and closures, staff shifts and time off, service durations and buffers, and existing bookings that block the slot.
- **Intervals** are half-open, `[start_at, end_at)`, stored as `timestamptz`. Slot maths runs in the branch's time zone.
- **No double booking**: an exclusion constraint on staff member and time range covers every status that blocks a slot. Because a constraint cannot depend on the current time, the create-booking function first marks that staff member's expired holds as `hold_expired`, then inserts. The constraint is the final guard against races.
- **"Any available"** picks the qualifying staff member with the fewest booked minutes that day.
- **Expiry** is decided by database timestamps, never by a client timer. A `pg_cron` job tidies statuses; availability does not depend on that job having run.
- **Snapshots**: the booking stores the payment details, cancellation policy, service names, durations, and prices as they were at creation.

Slot-blocking rules:

| Status | Blocks the slot |
|---|---|
| `held` | While `hold_expires_at` is in the future |
| `payment_submitted`, `needs_resubmission` | Yes |
| `review_expired_pending_resolution` | Yes, until staff resolve it |
| `confirmed`, `checked_in`, `in_service` | Yes |
| `completed` | Yes (historical) |
| `hold_expired`, `payment_rejected`, `cancelled`, `no_show` | No |

## 8. Scheduled jobs (pg_cron)

| Job | Frequency | Effect |
|---|---|---|
| Expire holds | Every 5 minutes | `held` past `hold_expires_at` becomes `hold_expired` |
| Expire reviews | Every 5 minutes | `payment_submitted` or `needs_resubmission` past `review_expires_at` becomes `review_expired_pending_resolution`; notifies both sides |
| Issue statements | Daily | On a cut-off date, creates one statement per organization for unbilled fee entries at or above the minimum |
| Restrict overdue | Daily | Organizations with a statement past its due date become `restricted` |

All jobs are idempotent.

## 9. Realtime

Subscriptions are scoped by branch or by user:

- Floor view: bookings for the open branch and day.
- Deposit review badge: payment proofs awaiting review for the member's branches.
- Notifications: the signed-in user's rows.

Realtime events trigger a TanStack Query refetch; they are not applied to the cache directly.

## 10. Storage

| Bucket | Access | Contents |
|---|---|---|
| `branch-media` | Public read; members write | Branch and staff photos |
| `payment-qr` | Public read; owner and managers write | Deposit QR images |
| `payment-proofs` | Private; uploader and permitted members read through short-lived signed URLs | Payment screenshots |
| `avatars` | Public read; owner of the file writes | Profile photos |

Uploads are limited to 5 MB and to image types, checked by bucket settings and policies.

## 11. Notifications

In-app only. Database functions insert notification rows as part of the operation that causes them; the app shows them live. A failed notification insert must not roll back the operation.

## 12. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | Public booking route under 200 KB of compressed JavaScript; usable on a mid-range Android phone on mobile data |
| Availability query | Returns a day's slots in under 300 ms with realistic data, measured as an authenticated role with row-level security on |
| Accessibility | WCAG 2.1 AA; see the design brief |
| Browsers | Current Chrome, Safari, and the Messenger and Instagram in-app browsers on Android and iOS |
| Offline | The app shell loads; data screens show an offline state. No offline writes |
| Stale clients | The app checks a version file on focus and prompts a reload after a deploy |
| Localisation | English at launch; all strings in one place so Filipino can be added. Currency is the Philippine peso |
| Audit | State-changing functions write an activity log row: actor, action, entity, bounded metadata |

## 13. Environments

- **Local**: Supabase CLI with Docker. All development and tests run here.
- **Hosted**: one Supabase project and one static site for the pilot. The product owner applies migrations and deploys.
- Environment variables in the app are limited to the Supabase URL and the public anon key.

## 14. Testing

- End-to-end tests with Playwright are the main mechanism, written per feature before it is called done, running against local Supabase with seed data.
- pgTAP tests cover row-level rules: each role, each tenant boundary, restricted organizations, and anonymous users.
- Transactional functions are tested for the success path and for a forced failure after an earlier write, proving nothing is left behind.
- `npm run db:baseline:check` runs after every schema change.

## 15. Repository instructions

`CLAUDE.md` and `AGENTS.md` are identical and hold the rules for this repository: strict TypeScript, explicit column lists, transactional database functions, PostgREST with no API layer, migration and baseline handling, naming, cleanup, the testing approach, and the GroomBox domain rules (tenancy, money, booking states, scheduled jobs, scope). Keep them consistent with this document; if they disagree, raise it rather than picking one silently.

## 16. Deferred, with the intended approach

| Feature | Approach when approved |
|---|---|
| Payment provider | Edge Function to create the payment and one to receive the webhook; the webhook calls the same accept-deposit function staff use today |
| SMS, email, push | Edge Function triggered by notification rows |
| Link previews and search visibility | Server rendering for the public booking and organization pages only |
