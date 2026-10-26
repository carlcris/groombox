# GroomBox: product requirements (PRD)

Last updated: 2026-10-09
Related: [technical requirements](trd.md), [app flow](app-flow.md), [design brief](design-brief.md), [backend schema](backend-schema.md), [implementation plan](implementation-plan.md)

## 1. Summary

GroomBox is a booking and shop-management web app for salons, barbershops, and spas in the Philippines. It is free for shop owners. Clients pay a convenience fee on top of the deposit when they book online; the shop collects it with the deposit, and GroomBox bills the owner for the accumulated fees at a regular cut-off.

## 2. Problem

- Shops take bookings through Messenger, Instagram, and a paper logbook, so they double-book, forget appointments, and lose money to no-shows.
- Commission and the end-of-day cash count are worked out by hand.
- Existing software is either a marketing channel with light operations (Parlon), priced per staff member in US dollars with no local e-wallets (Fresha), a booking page with a booking cap (Reserve.ph), or barber-only (ClipprOS). Local tools cost ₱600–₱1,500 a month.

## 3. Goals for the first release

| Goal | Measure in the pilot |
|---|---|
| Clients will pay a deposit plus fee to book | Share of online bookings that reach a confirmed deposit |
| Owners pay their fee statements | Share of statements paid, and days late |
| Owners send clients through the booking link | Share of a shop's visits booked online; target 25% |
| The shop runs its day in GroomBox | Share of business days with a completed daily close |

## 4. Non-goals for the first release

- Payment provider integration, automatic deposit confirmation, in-app refunds
- SMS, email, and push notifications; automated reminders
- Inventory, payroll export, memberships and packages, marketing campaigns
- Reviews, ratings, deals, vouchers, promoted listings, favourites
- Consolidated cross-branch reports beyond the daily close
- Native mobile apps
- Official tax receipts
- Owner approval or identity verification before a shop goes live

## 5. Users and roles

| Role | Who | Scope |
|---|---|---|
| Guest | A client booking from a shop's link without an account | Their own bookings in that browser |
| Client | A signed-in client (Google or Facebook) | Own profile, own bookings across all shops, the shop directory |
| Staff | A stylist, barber, or therapist with a login | Own schedule; floor view of assigned branches |
| Manager | Front desk or branch manager | Everything at assigned branches, including deposit review and the daily close |
| Owner | The business owner | Everything in the organization, across all branches |
| Platform admin | GroomBox | Fee settings, statements, organization access |

A bookable staff member does not need a login. Staff who only appear on the calendar are profiles managed by the owner or a manager.

## 6. Tenancy

- The tenant is the **organization**. Each organization has one or more **branches**.
- Service catalogue, client records, commission rules, and fee statements belong to the organization.
- Hours, booking link, deposit payment details, staff schedules, bookings, queue, checkout, and daily close belong to the branch.
- A client account is platform-wide. Each organization keeps its own private client record (notes, history) linked to it.

## 7. Functional requirements

Priority: **M** = must have for the pilot, **S** = should have, **C** = could move after the pilot.

### 7.1 Accounts and organizations

| ID | Requirement | Priority |
|---|---|---|
| ACC-1 | An owner signs up with email and password or Google, and creates an organization | M |
| ACC-2 | An owner adds, edits, and deactivates branches | M |
| ACC-3 | An owner invites members by a shareable invite link carrying a role and branch assignments | M |
| ACC-4 | An owner changes a member's role, branches, and deposit-review permission, or removes them | M |
| ACC-5 | A user who belongs to more than one organization can switch between them | S |
| ACC-6 | Clients sign in with Google or Facebook | M |
| ACC-7 | A guest can turn their guest session into an account and keep their bookings | M |

### 7.2 Shop setup

| ID | Requirement | Priority |
|---|---|---|
| SET-1 | Service catalogue per organization: category, name, duration, buffer time, price, "starting at" flag | M |
| SET-2 | Each branch chooses which services it offers and can override the price | M |
| SET-3 | Staff profiles: name, title, photo, branches, services they perform, weekly shifts, time off | M |
| SET-4 | Branch profile: address, area, hours, closures, photos, contact number | M |
| SET-5 | Deposit payment details per branch: account name, number, method, QR image | M |
| SET-6 | Deposit rule per organization (fixed amount or percentage of the service total), with an optional per-service override | M |
| SET-7 | Hold time and review time for deposits, and cancellation policy text | M |
| SET-8 | Commission: default percentage per staff member, optional override per staff and service | M |
| SET-9 | An organization can opt out of the directory | M |

### 7.3 Booking

| ID | Requirement | Priority |
|---|---|---|
| BKG-1 | Each branch has a public booking link; an organization page lists its branches | M |
| BKG-2 | A client picks one or more services, a staff member or "any available", and a time from live availability | M |
| BKG-3 | Two clients can never hold the same staff member at overlapping times | M |
| BKG-4 | A guest books with name and mobile number, with no account | M |
| BKG-5 | Before confirming, the client sees the service total, deposit, convenience fee, amount due now, and the cancellation policy, and accepts the policy | M |
| BKG-6 | A new online booking holds the slot until the hold time runs out | M |
| BKG-7 | Staff can create an appointment on a client's behalf; it is confirmed immediately with no deposit and no fee | M |
| BKG-8 | Clients and staff can cancel; staff can reschedule | M |
| BKG-9 | A client can rebook a past appointment in two taps | S |

### 7.4 Deposits

| ID | Requirement | Priority |
|---|---|---|
| DEP-1 | The booking shows the amount due and the branch's payment details as they were when the booking was made | M |
| DEP-2 | The client reports payment with a reference number, amount, and method, and may attach a screenshot | M |
| DEP-3 | Reporting payment stops the hold timer and starts the review timer | M |
| DEP-4 | A manager, owner, or permitted staff member accepts the payment, rejects it, or asks the client to resubmit | M |
| DEP-5 | A booking with a reported payment is never released automatically; if the review time runs out it is flagged for resolution and keeps its slot | M |
| DEP-6 | An unpaid hold that runs out releases the slot | M |
| DEP-7 | Refunds happen outside GroomBox between the shop and the client; the booking records the outcome | S |

### 7.5 Floor

| ID | Requirement | Priority |
|---|---|---|
| FLR-1 | One view of today's appointments and walk-ins per branch, updating live | M |
| FLR-2 | Add a walk-in to the queue with a service and an optional staff preference | M |
| FLR-3 | Move a visit through check-in, in service, and completed | M |
| FLR-4 | Calendar by day, per staff member, with week view on larger screens | M |
| FLR-5 | Mark a no-show | M |
| FLR-6 | A badge shows deposits waiting for review | M |

### 7.6 Checkout and daily close

| ID | Requirement | Priority |
|---|---|---|
| CHK-1 | Checkout sets final prices, adds extra items, applies a discount, records a tip, and deducts the deposit | M |
| CHK-2 | Checkout records one or more payments by method: cash, GCash, Maya, card, bank transfer, other | M |
| CHK-3 | Commission is calculated per item at checkout and stored | M |
| CLS-1 | Daily close per branch: sales by payment method, deposits received, discounts, tips, and commission and tips per staff member | M |
| CLS-2 | Cash count: expected cash, counted cash, and the difference | M |
| CLS-3 | A closed day is locked; an owner can reopen it | S |

### 7.7 Clients (shop side)

| ID | Requirement | Priority |
|---|---|---|
| CLI-1 | Client list per organization with search, visit history, and notes | M |
| CLI-2 | A guest or walk-in creates a client record automatically; staff can merge duplicates | S |

### 7.8 Client area

| ID | Requirement | Priority |
|---|---|---|
| CA-1 | Manage own profile: name, mobile number, photo | M |
| CA-2 | See upcoming and past bookings across shops, with deposit status | M |
| CA-3 | Cancel or rebook | M |
| CA-4 | Directory of shops and branches, for signed-in clients only, with search and filters for area and category | C |
| CA-5 | Shop page in the directory with services, prices, hours, and a book button | C |

The directory is marked **C** because a pilot with 3–5 shops will leave it nearly empty. It stays in scope; it is the first thing to move if the schedule slips.

### 7.9 Notifications

| ID | Requirement | Priority |
|---|---|---|
| NOT-1 | In-app notification list for members and clients, updating live while the app is open | M |
| NOT-2 | Events: new online booking, payment reported, payment accepted or rejected, resubmission requested, booking cancelled, review time running out, statement issued, statement overdue | M |

Nothing is sent outside the app in the first release.

### 7.10 Convenience fee and billing

| ID | Requirement | Priority |
|---|---|---|
| FEE-1 | The fee is a percentage of the booking's service total, with a minimum and a maximum, set by the platform admin | M |
| FEE-2 | The fee is added on top of the deposit and shown to the client as a separate line | M |
| FEE-3 | The fee is owed by the organization once the deposit is accepted, and stays owed if the booking is later cancelled, refunded, or a no-show | M |
| FEE-4 | Staff-entered appointments and walk-ins carry no fee | M |
| FEE-5 | One cut-off schedule for all organizations, set by the platform admin | M |
| FEE-6 | At each cut-off, one statement per organization lists the fee entries, with a breakdown by branch | M |
| FEE-7 | The owner sees statements and how to pay GroomBox, and pays outside the app | M |
| FEE-8 | A platform admin marks a statement paid, with a payment reference | M |
| FEE-9 | A balance below the statement minimum carries into the next period | S |
| FEE-10 | A platform admin can add an adjustment entry to correct a statement | S |

### 7.11 Unpaid statements

| ID | Requirement | Priority |
|---|---|---|
| RST-1 | When a statement is unpaid after the grace period, the organization is restricted | M |
| RST-2 | A restricted organization's owner and members cannot use the app at any branch, except that the owner can see statements and payment instructions | M |
| RST-3 | Booking links stay live and clients can still book a restricted organization | M |
| RST-4 | Access returns as soon as the overdue statements are marked paid | M |

Consequence, accepted: while restricted, nobody can review deposits. Reported payments are never auto-released (DEP-5), so those bookings wait in "needs resolution" until access returns.

### 7.12 Platform admin

| ID | Requirement | Priority |
|---|---|---|
| ADM-1 | Set the fee percentage, minimum, maximum, cut-off schedule, grace period, and statement minimum | M |
| ADM-2 | List statements across organizations; filter by status | M |
| ADM-3 | Mark a statement paid; restrict or restore an organization by hand | M |
| ADM-4 | Platform admins are assigned directly in the database | M |

## 8. Business rules

1. A deposit is required for every online booking. The owner cannot set it to zero.
2. Money never passes through GroomBox. Clients pay the shop; owners pay GroomBox against statements.
3. The amount due at booking is deposit plus convenience fee. The deposit is deducted at checkout; the fee is not.
4. Prices, deposits, and fees are calculated by the database, never taken from the browser.
5. Payment details are copied onto the booking when it is made, so later edits do not change what the client was told.
6. A booking is one client, one staff member, and one or more services back to back.
7. Commission is a percentage of each item's price after discount. Tips go fully to the staff member who performed the service.
8. All times are stored with time zone. Each branch has a time zone, defaulting to Philippine time.

## 9. Assumptions to confirm

These were open after the plan review. Each is built as stated here unless changed.

| # | Assumption | Why this default |
|---|---|---|
| A1 | The fee is charged only on online bookings with an accepted deposit; staff-entered appointments are free | A simple rule owners will trust. It accepts some leakage through chat bookings |
| A2 | The fee percentage applies to the service total, not the deposit | Revenue does not shrink when a shop sets a small deposit |
| A3 | Deposit rule is per organization with a per-service override | Covers cheap haircuts and expensive colour in one shop |
| A4 | Guests use an anonymous session that can be upgraded to an account | Lets a guest see their booking and attach proof, and carries bookings into the account without matching on an unverified mobile number |
| A5 | Deposit review is allowed for owners and managers, and for staff the owner permits | Staff may not have access to the shop's GCash |
| A6 | Owners and staff sign in with email and password or Google | Not specified yet |
| A7 | No approval step before a shop goes live; the platform admin can restrict a shop | Fast onboarding for the pilot |
| A8 | Statement minimum of ₱100; smaller balances carry over | Avoids chasing tiny amounts |
| A9 | Refunds are settled outside the app | No payment provider in the first release |
| A10 | Tips go fully to the staff member | Most common practice; configurable later |

## 10. Risks

| Risk | Mitigation |
|---|---|
| Regulars book by chat to skip the fee | Deposits give the owner a reason to require the link |
| Walk-in-heavy shops generate few fees | Later paid tier or a margin on in-shop payments |
| Fee feels large on cheap services | Percentage with a minimum and maximum |
| Owners do not pay statements | Short cut-off periods, grace period, restriction |
| Staff miss a new booking because nothing is sent outside the app | Live badge and notification list; revisit push or email after the pilot |
| Google sign-in is blocked inside Messenger and Instagram browsers | Guest booking needs no sign-in; account upgrade prompts the client to open in their browser |
| Booking spam through guest sessions | Bot check on guest sessions and database rate limits |
| Fake or mistaken payment reports | Review step, reference number, and optional screenshot |

## 11. Outside the code

- **Tax**: GroomBox invoices owners for fees the shop collected. Confirm invoicing and receipt duties with an accountant.
- **Data privacy**: the app stores personal data and notes about clients. It needs a privacy policy, consent at booking, and a check on registration duties.
- **Terms for owners**: must state that shops are listed in the directory by default, the fee rules, and the restriction rule.
- **Facebook login**: needs app review and business verification before public use.
