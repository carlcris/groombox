# Gleem: implementation plan

Last updated: 2026-10-09
Related: [product requirements](prd.md), [technical requirements](trd.md), [app flow](app-flow.md), [design brief](design-brief.md), [backend schema](backend-schema.md)

Estimates are rough, for one person building with Claude. They are not commitments.

## 1. Ground rules

- All development runs against local Supabase (CLI and Docker). Claude does not run commands against any remote system; the product owner applies migrations to the hosted project and deploys.
- Each phase ends with passing Playwright end-to-end tests for its flows and pgTAP tests for its row-level rules.
- Schema work follows the repository rules: migrations plus `supabase/baseline.sql` edited in place, `npm run db:baseline:check`, regenerated types.
- Nothing server-side is added without asking first.
- A phase is done when its exit criteria are met, not when its code is written.

## 2. Before phase 1

| Task | Owner |
|---|---|
| Confirm or change assumptions A1–A10 in the PRD | Product owner |
| Rewrite `CLAUDE.md` and `AGENTS.md` for Gleem (they describe Picklematic); see TRD section 15 | Product owner, with Claude |
| Install Docker and the Supabase CLI locally | Product owner |
| Initialise git in the repository | Product owner |
| Create Google and Facebook developer apps for sign-in; start Facebook app review | Product owner |
| Create a Cloudflare Turnstile site for the guest bot check | Product owner |

The last two are needed by phase 3, not phase 1.

## 3. Phases

| # | Phase | Estimate | Depends on |
|---|---|---|---|
| 1 | Foundation and tenancy | 2–3 weeks | |
| 2 | Shop setup | 1–2 weeks | 1 |
| 3 | Booking engine and public booking | 2–3 weeks | 2 |
| 4 | Deposits | 1–2 weeks | 3 |
| 5 | Floor and calendar | 2 weeks | 3 |
| 6 | Checkout and daily close | 2 weeks | 5 |
| 7 | Client area | 1 week, plus 1 for the directory | 3 |
| 8 | Fee billing and restriction | 1–2 weeks | 4 |
| 9 | Pilot readiness | 2 weeks | All |

Total: roughly 15–19 weeks. The earlier plan said 13–15; the difference comes from splitting shop setup out of the foundation, the proof-of-payment review flow, notifications, and honest allowances for testing.

### Phase 1: foundation and tenancy

**Build**
- Vite, React, TypeScript, TanStack Router and Query, Tailwind, shadcn/ui, with the design tokens from the design brief.
- Supabase local project; migration tooling, baseline file and check script, type generation.
- Tables: `profiles`, `platform_admins`, `platform_settings`, `organizations`, `branches`, `organization_members`, `member_branches`, `organization_invites`, `activity_logs`, `notifications`.
- Row-level rules and the membership lookup, including the restricted-organization rule.
- Sign-up and sign-in for owners and members; route guards per audience.
- `create_organization`, invites, team screen, branch switcher.
- App shell for the shop side: navigation, notification list, offline banner, version check.
- Playwright and pgTAP harness with seed data.

**Exit criteria**
- An owner signs up, creates an organization and branch, and invites a manager who joins.
- pgTAP proves a member of one organization cannot read or write another's rows, and that role and branch scope hold.
- The baseline check passes.

### Phase 2: shop setup

**Build**
- Categories, services, branch offerings and price overrides.
- Staff, branch and service assignments, shifts, time off, commission rates.
- Branch hours, closures, photos, payment details and QR upload.
- Deposit rule, hold and review times, cancellation policy, directory listing switch.
- Onboarding checklist and the publish rule.
- Storage buckets and policies.

**Exit criteria**
- An owner takes a new organization from empty to a published branch using only the app.
- A branch cannot be published while a required item is missing.

### Phase 3: booking engine and public booking

**Build**
- `bookings`, `booking_services`, `clients`; the exclusion constraint.
- `get_available_slots` and `create_online_booking`, with "any available".
- Public views; branch and organization pages; the booking flow through to the held state.
- Guest sessions with the bot check; client sign-in with Google and Facebook; in-app browser detection.
- Booking status page reachable by booking code.
- `expire_holds` job.

**Exit criteria**
- A guest and a signed-in client can each hold a slot from a branch link on a phone.
- A concurrency test fires simultaneous bookings at one slot; exactly one succeeds.
- Availability is correct across shifts, time off, closures, buffers, and existing bookings, including a booking that crosses midnight in the branch's time zone.
- The availability query meets the performance target in the TRD, measured as an authenticated role.

This is the highest-risk phase. If it overruns, cut "any available" first.

### Phase 4: deposits

**Build**
- `payment_proofs`; `submit_payment_proof`, `review_payment_proof`, `cancel_booking`.
- Pay and report-payment screens with countdown, copy buttons, and optional screenshot upload.
- Deposit review list and sheet; live badge.
- `expire_reviews` job and the needs-resolution state.
- Notifications for each deposit event.
- Fee entry created on acceptance (the `fee_entries` table lands here; statements come in phase 8).

**Exit criteria**
- The full path works: hold, pay, report, accept, confirmed, with both sides updating live.
- Resubmission and rejection paths work.
- A reported payment whose review time passes keeps its slot and is flagged.
- Accepting a deposit creates exactly one fee entry, and a forced failure mid-function leaves no partial rows.

### Phase 5: floor and calendar

**Build**
- Floor view with live updates; tabs on phones, columns on tablets.
- Walk-ins and queue numbers; staff-entered appointments; reschedule.
- Check-in, start, no-show.
- Day and week calendar.
- Client list and detail with history and notes.

**Exit criteria**
- Two devices on the same branch stay in sync without a manual refresh.
- A walk-in goes from queue to in service and takes a calendar slot.
- A staff-entered appointment has no deposit and no fee.

### Phase 6: checkout and daily close

**Build**
- `sales`, `sale_items`, `sale_payments`; `complete_checkout` with commission and deposit deduction.
- Visit detail and checkout screen with split payments.
- `daily_closes`, `daily_close_staff`; summary, cash count, close and reopen.

**Exit criteria**
- A day of mixed visits closes with totals that match a hand calculation in the test.
- A closed day rejects new or changed sales until reopened.
- Commission honours staff default and per-service overrides, after discount.

### Phase 7: client area

**Build**
- Home, bookings list and detail, cancel, rebook, profile.
- Guest-to-account upgrade.
- Directory: list, search, area and category filters, shop page. Built last in this phase.

**Exit criteria**
- A guest upgrades and sees their earlier bookings.
- A client sees bookings from two different organizations and nothing belonging to anyone else.
- The directory lists only published branches of listed organizations, to signed-in non-guest users only.

If the schedule is tight, ship this phase without the directory and add it after the pilot starts.

### Phase 8: fee billing and restriction

**Build**
- `fee_statements`; `issue_fee_statements` and `restrict_overdue_organizations` jobs.
- Owner billing screen: unbilled balance, statements, payment instructions, reference entry.
- Admin: settings, statements list and detail, mark paid, adjustments, manual restrict and restore.
- Restriction notice and route guard.

**Exit criteria**
- With the clock moved in tests, a cut-off issues correct statements, balances under the minimum carry over, and an unpaid statement restricts the organization after the grace period.
- A restricted owner can open billing and nothing else; a restricted manager sees only the notice.
- A client can still book a restricted organization.
- Marking the statement paid restores access.

### Phase 9: pilot readiness

**Build**
- Progressive web app manifest and icons.
- Accessibility pass against the design brief checklist.
- Performance pass on the booking route on a mid-range Android phone.
- Privacy policy, terms for owners, and consent text at booking.
- Printable booking QR for shops.
- A short owner guide in `docs/guides`.
- Pilot metrics queries for the four goals in the PRD.
- Hosted project set up and first deploy, by the product owner.

**Exit criteria**
- Booking completes inside the Messenger and Instagram browsers on Android and iOS.
- Three to five pilot shops are onboarded with real services and staff.
- The four pilot measures can be read from the database.

## 4. Cross-cutting work in every phase

| Item | Rule |
|---|---|
| Tests | End-to-end tests for each flow; failure cases listed before isolated tests are written |
| Row-level rules | pgTAP for every new table, including the restricted and guest cases |
| Lists | Server-side filtering, sorting, and pagination |
| States | Loading, empty, error, and offline for every screen |
| Docs | Update `docs/kb` and `docs/guides` when behaviour, rules, or schema change |
| Cleanup | Remove anything a change makes obsolete, in the same change |

## 5. Order of cuts if time runs short

1. Directory (CA-4, CA-5)
2. Week view on the calendar
3. "Any available" staff
4. Reopening a closed day
5. Fee adjustments and statement minimum
6. Client merge

Not to be cut: the overlap guarantee, the never-auto-release rule for reported payments, tenant isolation tests, and the daily close.

## 6. After the pilot

| Candidate | Trigger |
|---|---|
| Push or email notifications | Staff miss bookings or clients miss confirmations |
| Payment provider with automatic confirmation | Deposit review is the main friction, or fee collection from owners is unreliable |
| Server-rendered booking pages | Generic link previews hurt sharing |
| Paid tier: payroll, inventory | Walk-in-heavy shops are active but generate few fees |
| Reviews and favourites | The directory has enough shops to be worth browsing |

Each of the first three adds a server-side piece and needs approval first.
