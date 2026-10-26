# GroomBox: product and build plan

Last updated: 2026-10-06

> This is the original summary plan. The detailed documents written from it on 2026-10-09 are the source of truth where they differ: [PRD](prd.md), [TRD](trd.md), [app flow](app-flow.md), [design brief](design-brief.md), [backend schema](backend-schema.md), [implementation plan](implementation-plan.md).

GroomBox is a management app for salons, barbershops, and spas in the Philippines. It is free for shop owners. Revenue comes from a convenience fee paid by the client on each deposit-secured online booking.

Week figures are rough estimates for one person building with Claude, not commitments.

## Decisions made

| Decision | Choice |
|---|---|
| Business model | Free for owners; client-paid convenience fee per online booking |
| Launch segment | Salons, barbershops, and spas that already take appointments |
| Platform | Mobile-first web app, no native apps in the first release |
| Team | Solo, with Claude |
| First release scope | Booking with manual deposits, client area, calendar plus walk-in queue, checkout, daily close, fee billing |
| Tenancy | Multi-tenant: organizations with branches |
| Stack | React, Vite, TanStack, Supabase through PostgREST, no API layer, nothing server-side |

## Positioning

The operating system for the shop's day, built for how Philippine shops take bookings, get paid, and pay staff.

- **Free, unlimited staff and bookings**: local competitors charge ₱600–₱1,500 a month (Parlon, Reserve.ph, ClipprOS); Fresha charges per staff member in US dollars.
- **Deposits by e-wallet**: clients pay the shop's own GCash or Maya and staff confirm. Automatic confirmation comes later with a payment provider.
- **Appointments and walk-ins in one queue**.
- **Daily cash-up and commission in one screen**.
- **A client side that serves the shop**: clients get their own account to browse shops and services, book, and track appointments. A shop's own booking link shows only that shop.

Not competing on: deal-driven discovery and vouchers (Parlon), enterprise chains (Zenoti), or feature count.

Note: the earlier positioning promised "no marketplace showing rival shops". The client browse screen changes that; shops appear alongside each other there. The shop's client records and history stay private to the shop.

## Fee model

- The fee is attached to a deposit, so the owner gets no-show protection for free and has a reason to send clients through the booking link.
- The fee is added on top of the deposit. The client pays deposit plus fee to the shop in one payment.
- GroomBox then bills the owner for the fees the shop collected, at a configurable cut-off (for example weekly, twice a month, or monthly).
- The fee scales with the ticket: a percentage with a floor and a cap (starting point: 3%, ₱10 minimum, ₱50 maximum).
- Walk-ins are free. The queue and commission tools are the hook.
- A second revenue line comes later: a paid tier for payroll and inventory, or a margin on in-shop QR payments.

### Billing rules

- **One cut-off schedule for all organizations**, set by the platform admin.
- **Statements are per organization**, with a breakdown by branch.
- **The fee is owed once the deposit is confirmed**, even if the booking is later cancelled, refunded, or a no-show.
- **Unpaid statements restrict the organization's access, not its bookings.** After a grace period set by the platform admin, the owner and all members are locked out of the app across every branch. The booking links stay live and clients can still book. The owner can still sign in to see and settle statements.
- Access is restored when the platform admin marks the statement paid.

Illustrative revenue for a 5-staff shop with 600 visits a month and a ₱20 fee (assumptions, not market data):

| Share of visits booked through the app | Bookings | Gross fees per month |
|---|---|---|
| 10% | 60 | ₱1,200 |
| 25% | 150 | ₱3,000 |
| 50% | 300 | ₱6,000 |

About 25% is where this beats a ₱1,500 subscription. With manual deposits there is no payment-provider cost; once a provider is integrated, roughly ₱3–₱5 per ₱200 deposit comes out of the fee.

## What we are building

Five surfaces on one codebase:

| Surface | Who uses it | What it does |
|---|---|---|
| Client area | Clients, signed in | Manage own profile; browse shops, branches, and services; book; see upcoming and past bookings and deposit status; cancel or rebook |
| Booking page | Clients, from a link in Messenger, Instagram, or a QR code at the shop | Pick service, staff, and time; see how to pay the deposit to the shop; see booking status |
| Floor view | Front desk and staff, on a phone or tablet | Today's appointments and walk-ins in one queue; check in, start, finish, check out |
| Owner dashboard | Owner | Services, staff, hours, commission rates, deposit rules, the end-of-day close, and fee statements from GroomBox |
| Platform admin | GroomBox | Fee rate, cut-off schedule, statements, marking statements paid |

## First release scope

### In

- Organization and branch setup: create the organization, add branches, invite members with roles.
- Shop setup: services with duration and price, staff, working hours, which staff do which services, per branch.
- Client accounts: sign-in with Google or Facebook, own profile, list of own bookings across shops, cancel or rebook.
- Guest booking from a shop's link, with name and mobile number and no account.
- Browse, inside the client area only: a directory of shops and branches with their services and prices, with search and filter by area and category. Shops are listed by default.
- Booking link with live availability.
- Manual deposits: the booking page shows the amount due (deposit plus convenience fee) and the shop's own GCash or Maya details. The booking waits as "awaiting deposit" until staff review and confirm the payment. Unpaid holds expire after a time the owner sets.
- Fee billing: each confirmed deposit adds its fee to the shop's running balance. At each cut-off GroomBox issues the owner a statement listing the bookings and the total due. The owner pays GroomBox manually and a platform admin marks the statement paid.
- Platform admin screen: set the fee rate, cut-off schedule, and grace period; view statements across shops; mark statements paid.
- Calendar plus walk-in queue in one view.
- Checkout: final price, add-ons, discount, tip, payment method recorded (cash, e-wallet, card), deposit deducted.
- Daily close: sales by payment method, commission and tips per staff member, expected cash in the drawer.
- Client list with visit history and notes.
- Cancellation and no-show rules for deposits.

### Out for now

- Payment provider integration and automatic deposit confirmation
- SMS and automated reminders
- Inventory
- Payroll export
- Cross-branch extras: consolidated reports beyond the daily close, moving staff bookings between branches
- Marketing campaigns
- Memberships and packages
- Marketplace extras: reviews and ratings, deals and vouchers, promoted listings, favourites
- Native apps
- Official tax receipts

## Stack

| Layer | Choice | Why |
|---|---|---|
| App | React with TypeScript, built with Vite as a single-page app | One codebase for all five surfaces |
| Routing and data | TanStack Router and TanStack Query | Typed routes; caching and live refetching for the queue and calendar |
| Database and login | Supabase (Postgres, Auth, Realtime) | Managed; row-level rules keep each shop's data separate |
| Data access | PostgREST through the Supabase client, no custom API layer | The browser talks straight to the database; tables for reads and simple writes, database functions for anything with rules |
| Styling and components | Tailwind with shadcn/ui | Fast to build; the component code lives in the repo |
| Forms and validation | TanStack Form with Zod | The app is form-heavy; typed validation catches errors before they reach the database |
| Database changes | Supabase CLI migrations in the repo, with generated TypeScript types | Schema changes are versioned and the app's types match the database |
| Security tests | pgTAP tests for row-level rules | These rules are the only protection between tenants |
| Installable app | Progressive web app setup | Staff can add the floor view to a home screen without an app store |
| Hosting | Any static host (Vercel, Cloudflare Pages, Netlify) | The app is static files; no servers to run |
| Payments | Deferred | PayMongo or Xendit later; both cover GCash, Maya, and QR Ph |
| SMS and email | Deferred | Semaphore (local SMS) and Resend are the candidates |

### What "no API layer" means in practice

- **Security lives in the database**: every table has row-level security. Members see only their organization, narrowed by role and branch; the public booking page gets a narrow set of read-only views and functions.
- **Business rules are database functions** called through PostgREST: available slots, create booking with slot hold, check out, close the day. Double-booking is prevented by a database constraint, not application code.
- **Prices and fees are computed in the database**, never trusted from the browser.

### No server-side pieces in the first release

- **No payment provider integration or webhooks.** Deposits are paid directly to the shop and confirmed by staff (see scope).
- **No SMS, and no automated reminders.** Sending either needs a secret key, which would need a server-side function.
- **No server-rendered pages.** Everything is client-rendered. If a feature cannot be built without server rendering or a server-side function, stop and ask the owner of this plan first.

### Known trade-off

A single-page app has no per-shop link preview: a booking link shared in Messenger shows the same generic title and image for every shop. Accepted for now.

The shop directory sits behind client sign-in, so it is not meant to be found through search engines.

## Tenancy

GroomBox is multi-tenant. The tenant is the **organization**: an owner's business. Each organization has one or more **branches** (its physical facilities).

| Level | What lives here |
|---|---|
| Platform | Fee rate, cut-off schedule, grace period, all statements, client accounts, the shop directory |
| Organization | Owner and members, service catalogue, client list, commission rules, fee statements, access restriction |
| Branch | Address and hours, booking link, payment details for deposits, staff assignments and schedules, bookings, walk-in queue, checkout, daily close |

Rules:

- **Isolation**: every tenant table carries the organization id, and row-level security limits each signed-in user to organizations they belong to.
- **Roles**: owner (everything, all branches), manager (assigned branches), staff (their own schedule and the floor view of assigned branches).
- **Staff** belong to the organization and are assigned to one or more branches.
- **Services** are defined once per organization; each branch chooses which it offers and can override the price.
- **Clients** have two layers. A client account is platform-wide: one sign-in and profile used across every shop. Each organization also keeps its own client record (notes, visit history) linked to that account, shared across the organization's branches and never visible to other organizations.
- **Clients see only their own data**: their profile and their own bookings, plus the directory.
- **Guest booking**: a client can book from a shop's link without an account, giving a name and mobile number, and is offered an account afterwards. A guest booking creates an organization client record with no linked account.
- **Client sign-in**: Google and Facebook, through Supabase Auth.
- **Directory listing**: branches are listed by default; an organization can opt out. The directory appears only in the client area, for signed-in clients. A shop's booking page never shows other shops.
- **Billing** is per organization: one statement per cut-off, broken down by branch. Restriction for an unpaid statement applies to the whole organization.
- **Booking links**: one per branch, plus an organization page that lists its branches.

## Data model (core entities)

- Organizations
- Branches
- Members (user, organization, role, branch assignments)
- Staff
- Services, and per-branch offering and price
- Staff schedules and which staff perform which services
- Client accounts (platform-wide profile)
- Organization client records (per-organization notes and history, linked to a client account when one exists)
- Bookings (appointments and walk-ins)
- Payments (deposits, checkout payments, refunds)
- Commission rules
- Fee entries (one per confirmed deposit)
- Fee statements (one per organization per cut-off period, with paid status)
- Platform settings (fee rate, cut-off schedule, grace period)

## Build order

| Phase | Deliverable | Estimate |
|---|---|---|
| 1. Foundation | Project scaffold, data model with tenant isolation and roles, owner sign-up, organization and branch setup, member invites | 2–3 weeks |
| 2. Booking | Public booking page, availability engine, slot holds | 2 weeks |
| 2b. Client area | Client sign-up, profile, my bookings, shop and service directory with search | 2 weeks |
| 3. Deposits | Manual deposit review and confirmation, hold expiry, cancellation and no-show rules, fee entry per confirmed deposit | 1 week |
| 4. Floor | Calendar, walk-in queue, check-in to checkout | 2 weeks |
| 5. Daily close | Commission rules, tips, end-of-day summary | 1 week |
| 6. Fee billing | Cut-off schedule, statements, owner statement view, platform admin screen, restricting access for unpaid shops | 1–2 weeks |
| 7. Pilot | Polish, onboarding 3–5 real shops | 2 weeks |
| Later | Payment provider integration; SMS and reminders | Not scheduled |

The availability engine in phase 2 is the hardest piece: it has to handle staff schedules, service durations, buffer time, and two clients grabbing the same slot. It is written as Postgres functions plus an exclusion constraint on overlapping bookings.

## What the pilot has to prove

1. **Clients will pay the deposit plus fee**: share of bookings where the payment arrives, by fee size.
2. **Owners pay their statements**: share of statements paid, and how late.
3. **Owners will push the link**: share of a shop's visits that come through the app, with 25% as the target.
4. **The daily close gets used every night**: this is what makes the shop dependent on GroomBox.

## Open decisions

### How the deposit reaches the shop (needed when payments are integrated)

- **Split at the provider (recommended)**: each shop gets a sub-account with the payment provider; the deposit goes to the shop and the fee to GroomBox. GroomBox never holds client money. Xendit advertises a platform product for this; its current terms, and whether PayMongo has an equivalent, are not yet verified.
- **Collect and remit**: all money lands in GroomBox's account and shops are paid out weekly. Simpler to build, but this arrangement may need central bank registration as a payment system operator. Confirm with the provider and a lawyer.

### Where payment and messaging secrets run (needed when payments or SMS are added)

Supabase Edge Functions for those calls only, or pure database with the `pg_net` extension and Supabase Vault. Either one is a server-side piece, so it needs sign-off first.

### Still to verify

- Which local competitors, if any, are accredited for official tax receipts, and whether shops will expect that from GroomBox.
- Whether clients can complete a booking comfortably from inside Messenger and Instagram's in-app browsers.

## Risks

- **Leakage**: regulars message their stylist directly to skip the fee. Mitigation: deposits give the owner a reason to require the link.
- **Free riders**: walk-in-heavy shops use the tools and generate few fees. Mitigation: the later paid tier or payments margin.
- **Fee resistance on cheap services**: a flat fee is a large share of a ₱250 haircut. Mitigation: percentage with floor and cap.
- **Owners not paying statements**: the shop holds the fee money and GroomBox collects after the fact. Mitigation: short cut-off periods and a clear rule for unpaid statements.
- **Competitor response**: Parlon deepening its merchant tools, or Fresha adding local e-wallets and peso pricing.

## Next step

Phase 1: scaffold the project, define the data model, and build owner sign-up and shop setup. Requires a Supabase account.
