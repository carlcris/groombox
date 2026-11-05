# GroomBox: backend schema

Last updated: 2026-11-05
Related: [technical requirements](trd.md), [product requirements](prd.md), [app flow](app-flow.md)

This is the design the first migrations are written from. Exact SQL lives in `supabase/migrations/` and `supabase/baseline.sql` once implementation starts.

## 1. Conventions

- Primary keys are `uuid` with `gen_random_uuid()`, named `id`.
- Every tenant table has `organization_id uuid not null` referencing `organizations`, indexed.
- Every tenant table that other tenant tables reference also has `unique (id, organization_id)`. Children reference it with a composite foreign key on `(parent_id, organization_id)`, so a row can never point at another organization's parent. This covers branch, staff, service, client, booking, sale, and statement references.
- Timestamps are `timestamptz`. Every table has `created_at`; mutable tables have `updated_at` maintained by a trigger.
- Money is `numeric(20,2)`. Percentages are `numeric(5,2)`.
- Every calculated amount is rounded to the centavo, half away from zero (Postgres `round(x, 2)`). This applies to each service's deposit, the fee before its minimum and maximum, each item's discount share, and each commission.
- Time ranges are half-open, `[start_at, end_at)`.
- **Business date**: a moment's business date at a branch is its local date after subtracting the branch's `business_day_start`. With the default 5:00 AM start, a sale at 1:30 AM on Sunday belongs to Saturday. Sales, booking business dates, queue numbers, the daily close, the floor view's "today", and "fewest booked minutes that day" all use one shared SQL function for this, `private.business_date(at, timezone, business_day_start)`.
- Status columns are Postgres enums.
- Generated codes (`booking_code`, `statement_code`) are made by the database with the shared generator and a `BEFORE INSERT` trigger; inserts omit them.
  - `booking_code` is 12 random characters from Crockford's base32 alphabet (no I, L, O, or U), shown in groups of four, for example `7K2M-QX9D-4HTB`. The booking link carries it and anyone holding it can open the booking (`get_booking_by_code`), so it must be unguessable. It is stored without dashes; the functions that take a code ignore dashes, spaces, and case, and read I and L as 1 and O as 0.
  - `statement_code` is short and readable, because only the owner and platform admins see it.
- Snapshots and loosely structured metadata are `jsonb`.
- Internal helpers (row-level security lookups, logging, code and slug generators) live in schema `private`, which PostgREST does not expose.
- Functions raise coded errors with SQLSTATE class `GB`, and the app maps each code to a safe message: `GBA01` sign-in required, `GBA02` not permitted, `GBI01` invite unavailable, `GBI02` already a member, `GBM01` owner membership locked, `GBB01` hold limit reached (two unexpired holds), `GBB02` branch not taking bookings, `GBB03` slot unavailable (taken, off the slot grid, or no longer offered), `GBB04` booking not cancellable now, `GBB05` booking not claimable (made by an account). Later phases add their codes here.
- Row-level security is enabled on every table. No table is readable or writable without a policy.
- Tables that accept direct single-row writes under row-level security have an `AFTER` trigger that writes the `activity_logs` row: `profiles`, `organizations`, `branches`, `branch_hours`, `branch_closures`, `branch_media`, `branch_services`, `service_categories`, `services`, `staff`, `staff_branches`, `staff_services`, `staff_shifts`, `staff_time_off`, `clients`, and `platform_settings`. The shared trigger function runs with the caller's rights and logs only writes made directly by an app role (`authenticated` or `anon`); it writes through `private.log_activity`, which is `SECURITY DEFINER` because callers cannot insert into `activity_logs` themselves. It records only the actor, table, row id, action, and allow-listed changed column names. Database functions run as `SECURITY DEFINER` and write their own activity row, so the trigger skips their writes and nothing is logged twice. `notifications.read_at` updates are not logged. A new directly writable table gets the trigger in the same migration.

## 2. Enums

| Enum | Values |
|---|---|
| `member_role` | `owner`, `manager`, `staff` |
| `org_access_status` | `active`, `restricted` |
| `org_restriction_reason` | `overdue_statement`, `manual` |
| `org_category` | `salon`, `barbershop`, `spa`, `nails`, `lashes_brows`, `other` |
| `deposit_type` | `fixed`, `percent` |
| `booking_source` | `online`, `staff`, `walk_in` |
| `booking_status` | `held`, `payment_submitted`, `needs_resubmission`, `review_expired_pending_resolution`, `confirmed`, `waiting`, `checked_in`, `in_service`, `completed`, `cancelled`, `no_show`, `hold_expired`, `payment_rejected` |
| `proof_status` | `submitted`, `accepted`, `rejected`, `resubmission_requested`, `withdrawn` |
| `payment_method` | `cash`, `gcash`, `maya`, `card`, `bank_transfer`, `other` |
| `fee_entry_kind` | `booking_fee`, `adjustment` |
| `statement_status` | `issued`, `paid`, `overdue`, `void` |
| `cutoff_schedule` | `weekly`, `semi_monthly`, `monthly` |

## 3. Platform tables

### `platform_settings` (single row)

| Column | Type | Notes |
|---|---|---|
| `id` | `boolean` PK | Always `true`; check constraint enforces one row |
| `fee_percent` | `numeric(5,2)` | Default 3.00 |
| `fee_minimum` | `numeric(20,2)` | Default 10.00 |
| `fee_maximum` | `numeric(20,2)` | Default 50.00 |
| `cutoff_schedule` | `cutoff_schedule` | Default `semi_monthly` |
| `cutoff_weekday` | `smallint` | Used when weekly; 0–6, Sunday is 0 |
| `grace_period_days` | `smallint` | Default 7 |
| `statement_minimum` | `numeric(20,2)` | Default 100.00 |
| `payment_instructions` | `jsonb` | How owners pay GroomBox; owners read it through `platform_billing_details` |
| `updated_at`, `updated_by` | | |

Cut-off dates by schedule:

- `weekly`: every `cutoff_weekday`.
- `semi_monthly`: the 15th and the last day of the month.
- `monthly`: the last day of the month.

Cut-offs use GroomBox's time zone, `Asia/Manila`, whatever each branch's time zone is. A cut-off covers fee entries accrued before midnight at the end of the cut-off date.

### `platform_admins`

| Column | Type | Notes |
|---|---|---|
| `user_id` | `uuid` PK | References `auth.users`. Rows are added by hand |
| `created_at` | `timestamptz` | |

### `profiles`

One row per auth user, created by a trigger on `auth.users`. This is the platform-wide client account.

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | References `auth.users` |
| `full_name` | `text` | |
| `mobile_number` | `text` | Unverified |
| `avatar_path` | `text` | |
| `is_guest` | `boolean` | True for anonymous sessions; cleared on upgrade |
| `created_at`, `updated_at` | | |

## 4. Organization tables

### `organizations`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `name` | `text` | |
| `slug` | `text` unique | Used in `/o/:orgSlug` |
| `category` | `org_category` | |
| `logo_path` | `text` | |
| `is_listed` | `boolean` | Default true; directory opt-out |
| `access_status` | `org_access_status` | Default `active` |
| `restricted_at` | `timestamptz` | |
| `restriction_reason` | `org_restriction_reason` | Set with `restricted_at`; null while active |
| `deposit_type` | `deposit_type` | Default `fixed` |
| `deposit_fixed_amount` | `numeric(20,2)` | Per service, when `fixed`; greater than zero. Default 100.00, so a new organization starts with a valid rule |
| `deposit_percent` | `numeric(5,2)` | Of each service's price, when `percent`; above 0 and at most 100 |
| `hold_minutes` | `smallint` | Default 15 |
| `review_hours` | `smallint` | Default 12 |
| `slot_interval_minutes` | `smallint` | Default 15; start times are offered at this step from the opening time |
| `min_notice_minutes` | `smallint` | Default 60; the earliest start time offered is now plus this |
| `booking_horizon_days` | `smallint` | Default 30; the last business date offered is today plus this |
| `cancellation_policy` | `text` | |
| `terms_accepted_at`, `terms_accepted_by` | | |
| `created_at`, `updated_at` | | |

Exactly one of `deposit_fixed_amount` and `deposit_percent` is set, the one matching `deposit_type` (check constraint).

### `branches`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` | |
| `name` | `text` | |
| `slug` | `text` unique | Used in `/b/:branchSlug` |
| `address`, `city`, `area` | `text` | `city` and `area` indexed for directory filters |
| `latitude`, `longitude` | `numeric(9,6)` | Optional |
| `timezone` | `text` | IANA name, default `Asia/Manila` |
| `business_day_start` | `time` | Default `05:00`; where one business day ends and the next begins |
| `contact_number` | `text` | |
| `payment_instructions` | `jsonb` | Method, account name, account number, QR path |
| `is_published` | `boolean` | Default false; the owner sets it once the setup screen's publishing checklist is complete |
| `is_active` | `boolean` | Default true |
| `created_at`, `updated_at` | | |

### `branch_hours`

| Column | Type | Notes |
|---|---|---|
| `branch_id` | `uuid` | PK with `day_of_week` |
| `organization_id` | `uuid` | |
| `day_of_week` | `smallint` | 0–6 |
| `opens_at`, `closes_at` | `time` | Local to the branch |
| `closes_next_day` | `boolean` | Default false. True when the branch closes after midnight, for example 2:00 PM to 2:00 AM |
| `is_closed` | `boolean` | |

Hours that run past midnight belong to the day they open: Saturday's row covers Saturday 2:00 PM to Sunday 2:00 AM. They open at or after the branch's `business_day_start` and close by it, so one opening never spans two business dates; the setup screen checks this.

### `branch_closures`

`id`, `organization_id`, `branch_id`, `starts_at`, `ends_at`, `reason`.

### `branch_media`

`id`, `organization_id`, `branch_id`, `storage_path`, `sort_order`.

### `organization_members`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` | Unique with `user_id` |
| `user_id` | `uuid` | References `profiles` |
| `role` | `member_role` | Exactly one `owner` per organization (partial unique index) |
| `can_review_deposits` | `boolean` | Default false; ignored for owner and manager |
| `is_active` | `boolean` | |
| `created_at`, `updated_at` | | |

Index on `(user_id, organization_id)` where `is_active`, to support policy lookups.

### `member_branches`

`member_id`, `branch_id` (composite PK), `organization_id`. Not used for owners.

### `organization_invites`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` | |
| `code` | `text` unique | 16 random Crockford base32 characters, unguessable |
| `role` | `member_role` | `manager` or `staff` |
| `branch_ids` | `uuid[]` | |
| `staff_id` | `uuid` | Optional staff profile; `accept_invite` sets that profile's `member_id` |
| `expires_at` | `timestamptz` | Seven days after creation |
| `accepted_by`, `accepted_at` | | Single use |
| `created_by`, `created_at` | | |

## 5. Catalogue and staff

### `service_categories`

`id`, `organization_id`, `name`, `sort_order`.

### `services`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` | |
| `category_id` | `uuid` | |
| `name`, `description` | `text` | |
| `duration_minutes` | `smallint` | |
| `buffer_minutes` | `smallint` | Default 0; clean-up time. A booking adds the largest buffer among its services once, at the end |
| `price` | `numeric(20,2)` | |
| `price_is_starting` | `boolean` | "Starting at"; final price set at checkout |
| `deposit_type`, `deposit_fixed_amount`, `deposit_percent` | | Optional override of the organization rule, with the same check; all null when not overridden |
| `is_active` | `boolean` | |
| `sort_order` | `smallint` | |

### `branch_services`

`branch_id`, `service_id` (composite PK), `organization_id`, `price_override numeric(20,2)` nullable. A row means the branch offers the service.

### `staff`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` | |
| `member_id` | `uuid` | Optional link to a login; unique when set. The only link between a staff profile and a member, set by `accept_invite` or by the owner later |
| `display_name`, `title` | `text` | |
| `photo_path` | `text` | |
| `commission_percent` | `numeric(5,2)` | Default rate |
| `is_bookable` | `boolean` | Shown in online booking |
| `is_active` | `boolean` | |

### `staff_branches`

`staff_id`, `branch_id` (composite PK), `organization_id`.

`staff_branches` is where a staff profile takes bookings; `member_branches` is where a login can work in the app. They mean different things and are not kept in sync.

### `staff_services`

`staff_id`, `service_id` (composite PK), `organization_id`, `commission_percent_override numeric(5,2)` nullable.

### `staff_shifts`

`id`, `organization_id`, `staff_id`, `branch_id`, `day_of_week`, `starts_at time`, `ends_at time`, `ends_next_day boolean` (default false). Index on `(branch_id, day_of_week)`. `(staff_id, branch_id)` references `staff_branches` with cascade, so a shift exists only at a branch the staff member is assigned to. A shift past midnight follows the same rule as branch hours: it belongs to the day it starts, starts at or after the branch's `business_day_start`, and ends by it.

### `staff_time_off`

`id`, `organization_id`, `staff_id`, `starts_at`, `ends_at`, `reason`.

## 6. Clients

### `clients` (organization client record)

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id` | `uuid` | |
| `user_id` | `uuid` | Optional link to `profiles`; unique with `organization_id` when set |
| `full_name` | `text` | |
| `mobile_number` | `text` | Indexed with `organization_id` for search |
| `notes` | `text` | Private to the organization |
| `created_at`, `updated_at` | | |

`create_online_booking` upserts the record on `(organization_id, user_id)`, updating the name and mobile number to the latest booking's. Owners and managers may also add and edit records directly (name, mobile number, notes); the audit trigger logs those writes.

## 7. Bookings

### `bookings`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `booking_code` | `text` unique | Database-generated and unguessable; opens the booking through its link |
| `organization_id`, `branch_id` | `uuid` | |
| `client_id` | `uuid` | Organization client record |
| `booked_by` | `uuid` | Auth user who created it (client, guest, or member) |
| `staff_id` | `uuid` | Nullable only while `waiting` with no preference |
| `source` | `booking_source` | |
| `status` | `booking_status` | |
| `start_at`, `end_at` | `timestamptz` | Nullable only while `waiting`. `end_at` includes the booking's buffer, so the staff member stays blocked during clean-up; screens show the client when the last service ends |
| `business_date` | `date` | The branch business date of `start_at`, or of the time a walk-in was added while it waits. Set by the booking functions, including on reschedule |
| `service_total` | `numeric(20,2)` | Sum of booked service prices |
| `deposit_amount` | `numeric(20,2)` | Sum of each service's deposit (its override, else the organization rule), each capped at that service's price. Zero for staff and walk-in sources |
| `convenience_fee` | `numeric(20,2)` | `fee_percent` of the service total, rounded, then held between `fee_minimum` and `fee_maximum`. Zero for staff and walk-in sources |
| `amount_due` | `numeric(20,2)` | Deposit plus fee |
| `payment_instructions_snapshot` | `jsonb` | Copied from the branch at creation |
| `policy_acceptance_metadata` | `jsonb` | Cancellation policy text, privacy notice version, and acceptance time |
| `hold_expires_at` | `timestamptz` | |
| `review_expires_at` | `timestamptz` | Now plus the review time, set when payment is reported and again when resubmission is requested or a new proof arrives |
| `review_reminder_sent_at` | `timestamptz` | Set by `remind_pending_reviews`; cleared whenever `review_expires_at` is set |
| `queue_number` | `smallint` | Walk-ins; per branch per business date |
| `client_note` | `text` | |
| `cancellation_metadata` | `jsonb` | Who, when, and reason |
| `refund_metadata` | `jsonb` | A refund settled outside GroomBox: outcome, amount, note, who, and when. Set by `record_refund_outcome` |
| `checked_in_at`, `started_at`, `completed_at` | `timestamptz` | |
| `created_at`, `updated_at` | | |

Constraints and indexes:

- Exclusion constraint preventing overlap per staff member:

  ```sql
  exclude using gist (
    staff_id with =,
    tstzrange(start_at, end_at, '[)') with &&
  ) where (
    staff_id is not null and start_at is not null
    and status in ('held', 'payment_submitted', 'needs_resubmission',
                   'review_expired_pending_resolution', 'confirmed',
                   'checked_in', 'in_service', 'completed')
  )
  ```

  Requires the `btree_gist` extension. Expired holds are moved to `hold_expired` by the create-booking function before it inserts, so they do not trip the constraint.
- Checks: `end_at > start_at`; `start_at` and `end_at` both set or both null; `staff_id` and `start_at` set unless `waiting`; `hold_expires_at` set while `held`; `amount_due = deposit_amount + convenience_fee`; `deposit_amount > 0` for `online`.
- Foreign keys: `(branch_id, organization_id)`, `(client_id, organization_id)`, and `(staff_id, organization_id)` against their parents; `booked_by` references `profiles`.
- Indexes: `(branch_id, start_at)`, `(branch_id, business_date)`, `(staff_id, start_at)`, `(booked_by, start_at desc)`, `(organization_id, client_id)`, and partial indexes on `hold_expires_at` and `review_expires_at` for the statuses the jobs scan.
- A booking can cross midnight. Its range is stored as `timestamptz`, so nothing special is needed beyond the business date rule.

### `booking_services`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `booking_id`, `organization_id` | `uuid` | |
| `service_id` | `uuid` | `(service_id, organization_id)` references `services` |
| `service_name` | `text` | Snapshot |
| `duration_minutes`, `buffer_minutes` | `smallint` | Snapshot |
| `price` | `numeric(20,2)` | Snapshot |
| `sort_order` | `smallint` | The order the client chose the services in |

`(booking_id, organization_id)` references `bookings`.

### `payment_proofs`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `booking_id`, `organization_id`, `branch_id` | `uuid` | |
| `submitted_by` | `uuid` | |
| `reference_number` | `text` | |
| `amount_paid` | `numeric(20,2)` | |
| `method` | `payment_method` | |
| `proof_path` | `text` | Optional, in the private bucket |
| `note` | `text` | |
| `status` | `proof_status` | |
| `reviewed_by`, `reviewed_at`, `review_note` | | |
| `created_at` | `timestamptz` | |

A booking can have several proofs over time; at most one is `submitted` at once (partial unique index). Partial index on `(branch_id)` where `status = 'submitted'` for the review list. Cancelling a booking moves its `submitted` proof to `withdrawn`.

Accepting a proof means the shop received the full amount due; there is no partial acceptance. When the reported amount differs from `amount_due`, the review sheet shows the difference, and the reviewer asks the client to resubmit or rejects.

## 8. Sales and daily close

### `sales`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id`, `branch_id` | `uuid` | |
| `booking_id` | `uuid` unique | |
| `client_id` | `uuid` | |
| `business_date` | `date` | The branch business date when checkout completes |
| `subtotal`, `discount_amount` | `numeric(20,2)` | |
| `tip_amount` | `numeric(20,2)` | Sum of the sale's `sale_tips` |
| `deposit_applied` | `numeric(20,2)` | The booking's deposit, capped at subtotal minus discount plus tip. Any excess is refunded outside GroomBox and recorded with `record_refund_outcome` |
| `balance_collected` | `numeric(20,2)` | Subtotal minus discount plus tip minus deposit applied; never negative. The sale's payments add up to it exactly, which the checkout screen checks |
| `completed_by`, `completed_at` | | |

Index on `(branch_id, business_date)`.

### `sale_items`

`id`, `sale_id`, `organization_id`, `service_id` nullable, `description`, `staff_id`, `amount`, `discount_share`, `commission_percent`, `commission_amount`.

`discount_share` splits the sale's discount across items in proportion to their amounts, rounded to the centavo, with any remainder on the largest item, so the shares add up to the discount.

### `sale_tips`

`sale_id`, `staff_id` (composite PK), `organization_id`, `amount`. One row per staff member tipped; checkout asks for a tip for each staff member on the sale.

### `sale_payments`

`id`, `sale_id`, `organization_id`, `method payment_method`, `amount`, `reference`. `amount` is what was applied to the balance, not the cash handed over; the checkout screen shows the change.

### `daily_closes`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id`, `branch_id` | `uuid` | Unique on `(branch_id, business_date)` |
| `business_date` | `date` | |
| `gross_sales`, `discounts`, `tips`, `deposits_applied` | `numeric(20,2)` | |
| `deposits_received` | `numeric(20,2)` | Deposits accepted on this business date |
| `fees_collected` | `numeric(20,2)` | Convenience fees on deposits accepted on this business date. Owed to GroomBox; shown for information and not counted as cash |
| `totals_by_method` | `jsonb` | |
| `cash_float` | `numeric(20,2)` | Opening cash in the drawer, entered at close; default 0 |
| `cash_expected` | `numeric(20,2)` | `cash_float` plus the day's cash sale payments |
| `cash_counted`, `cash_variance` | `numeric(20,2)` | |
| `closed_by`, `closed_at` | | |
| `reopened_by`, `reopened_at` | | |

### `daily_close_staff`

`daily_close_id`, `staff_id` (composite PK), `organization_id`, `service_revenue`, `commission_amount`, `tip_amount` (from `sale_tips`), `visit_count`.

Sales on a closed date cannot be created or changed until the day is reopened; the checkout and close functions enforce this.

## 9. Fees and statements

### `fee_entries`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `organization_id`, `branch_id` | `uuid` | |
| `kind` | `fee_entry_kind` | |
| `booking_id` | `uuid` | Unique when `kind = 'booking_fee'` |
| `amount` | `numeric(20,2)` | Negative allowed for adjustments |
| `description` | `text` | For adjustments |
| `accrued_at` | `timestamptz` | When the deposit was accepted, or the adjustment added |
| `statement_id` | `uuid` | Null until billed |
| `created_by` | `uuid` | |

Partial index on `(organization_id)` where `statement_id is null`. Entries are never deleted and their amounts never change. Only `statement_id` changes: it is set when a statement includes the entry, and cleared when that statement is voided.

### `fee_statements`

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `statement_code` | `text` unique | Database-generated |
| `organization_id` | `uuid` | |
| `period_start`, `period_end` | `date` | `period_end` is the cut-off date; `period_start` is the day after the previous cut-off. Entries carried over from earlier periods are included. Unique with `organization_id`, so the issuing job can rerun safely |
| `total_amount` | `numeric(20,2)` | |
| `status` | `statement_status` | `issued` by `issue_fee_statements`, `overdue` by `restrict_overdue_organizations`, `paid` by `mark_statement_paid`, `void` by `void_statement` |
| `issued_at`, `due_at` | `timestamptz` | `due_at` is issue time plus the grace period |
| `owner_payment_reference` | `text` | Entered by the owner |
| `paid_at`, `marked_paid_by`, `admin_payment_reference` | | |

Index on `(status, due_at)` for the restriction job.

## 10. Notifications and audit

### `notifications`

`id`, `recipient_user_id`, `organization_id` nullable, `type`, `title`, `body`, `entity_type`, `entity_id`, `read_at`, `created_at`. Index on `(recipient_user_id, created_at desc)`.

A branch's **deposit reviewers** are the owner, the managers assigned to the branch, and the staff assigned to it with `can_review_deposits`. The **booked staff member** is notified only when their staff profile is linked to a login.

| Event (NOT-2) | Written by | Recipients |
|---|---|---|
| New online booking | `create_online_booking` | Deposit reviewers; booked staff member |
| Payment reported | `submit_payment_proof` | Deposit reviewers |
| Payment accepted, rejected, or resubmission requested | `review_payment_proof` | Booking's creator |
| Review time passed | `expire_reviews` | Booking's creator; deposit reviewers |
| Booking cancelled | `cancel_booking` | By the client: deposit reviewers and booked staff member. By the shop: booking's creator |
| Review time running out (an hour or less left on a `payment_submitted` booking) | `remind_pending_reviews` | Deposit reviewers |
| Statement issued | `issue_fee_statements` | Owner |
| Statement overdue | `restrict_overdue_organizations` | Owner |

### `activity_logs`

`id`, `organization_id` nullable, `actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb` (bounded, allow-listed fields), `created_at`. Insert-only, written by functions and by the audit triggers on directly writable tables. `actor_user_id` is null for scheduled jobs.

## 11. Views

| View | Audience | Exposes |
|---|---|---|
| `public_branches` | Anyone, including visitors without a session | Published, active branches, including those of restricted organizations: name, slug, address, city, area, contact number, time zone, business day start, the current business date, hours (`hours` jsonb), photo paths (`photo_paths` jsonb), and the organization's id, name, slug, logo, cancellation policy, hold time, and booking horizon (the organization slug serves `/o/:orgSlug`) |
| `public_branch_services` | Anyone | Offered, active services of those branches: name, description, duration, effective price (the branch override, else the catalogue price), starting-price flag, sort order, and category id, name, and sort order. Buffers are not shown |
| `public_branch_staff` | Anyone | Bookable, active staff assigned to those branches with at least one shift there: display name, title, photo, and `service_ids`, the offered active services each performs |
| `directory_branches` | Signed-in, non-guest users | `public_branches` limited to listed organizations, with category, city, and area |
| `my_bookings` | The signed-in user | Own bookings with branch and service summary |
| `unbilled_fee_summary` | Owner | Running balance by branch |
| `platform_billing_details` | Owners of any organization, whatever its access status | `payment_instructions` from `platform_settings`, so owners know how to pay GroomBox |
| `my_memberships` | The signed-in user | Own active memberships: member id, organization id, name, slug, and access status, role, deposit-review permission. Runs with the view owner's rights so a member of a restricted organization still learns it is restricted; returns only the caller's rows |
| `my_branches` | The signed-in user | Active branches the caller works in: all of an owner's, the assigned ones for managers and staff |
| `branch_setup_status` | Members | Per active branch: published flag, whether the address is complete, open days, offered active services, bookable active staff with a shift, complete payment details, and terms accepted. The setup screens read it for the publishing checklist and to refuse removing a published branch's last required item |

Views run with the caller's rights (`security_invoker`) unless they must expose columns from tables the caller cannot read, in which case they select only public columns. The three public views run with the owner's rights for that reason. `public_branches` calls `private.business_date`, and a view's functions run with the caller's rights, so `anon` has usage on schema `private` and execute on that one function.

## 12. Functions (called through PostgREST)

| Function | Caller | What it does |
|---|---|---|
| `create_organization` | Signed-in user | Creates the organization, the owner membership, and the first branch |
| `create_invite`, `accept_invite` | Owner; invitee | Creates a single-use invite, optionally naming a staff profile; adds the membership and branch assignments and links the named staff profile to the new login |
| `create_branch` | Owner | Adds a branch with its weekly hours and a free slug |
| `set_branch_hours` | Owner; manager of the branch | Replaces the branch's weekly hours in one step |
| `save_staff_profile` | Owner | Creates or updates a staff profile with its branches, services, and commission overrides in one step. Leaving a branch removes the staff member's shifts there |
| `get_invite_preview` | Anyone holding the code | For an unaccepted, unexpired invite: organization name, role, branch names, and expiry |
| `update_member`, `remove_member` | Owner | Changes a member's role, branch assignments, and deposit-review permission; or deactivates the membership and clears its branch assignments. The owner membership cannot be changed or removed |
| `accept_terms` | Owner | Sets `terms_accepted_at` and `terms_accepted_by` to the caller |
| `search_clients` | Member of the branch (any role) | Bounded, paginated search of the organization's clients by name or mobile number; returns id, name, and mobile number only |
| `merge_clients` | Owner, manager | Moves bookings, sales, and notes from a duplicate record to the kept one and removes the duplicate. Two records linked to different accounts cannot be merged |
| `get_available_slots` | Anyone | Open start times for a branch, business date, services, and optional staff member (see below) |
| `get_next_available_date` | Anyone | The first business date after a given one, within the booking window, with an open start time, or null. Backs "No times left on this day" |
| `get_booking_quote` | Anyone | Service total, deposit, convenience fee, and amount due for a branch and services, calculated as `create_online_booking` does; no row when the branch is not taking bookings or a service is not offered |
| `get_booking_by_code` | Anyone holding the code, with or without a session | The client-facing view of one booking: id, code, status (a hold past `hold_expires_at` reads as `hold_expired` before the job runs), branch name, slug, address, contact number, and time zone, organization name, staff display name, start time and when the last service ends (no buffer), services, amounts, payment details snapshot, booking time, hold and review deadlines, the accepted policy, and who cancelled. The client's name and note only to the creator and the branch's members, and flags for whether the caller is the creator or a member and whether a guest made it. Never the client's mobile number or the shop's notes. Phase 4 adds the latest proof's status and review note |
| `claim_guest_booking` | Signed-in client or guest holding the code | Makes the caller the booking's creator when the current creator is a guest profile, so the booking can be paid, cancelled, or carried into an account from this device. Refused when the creator is a non-guest account, who signs in instead |
| `create_online_booking` | Client or guest | Locks the caller's profile and refuses when the caller already has two unexpired holds. Checks the start time against the same rules as `get_available_slots`, resolves "any available" (the qualifying staff member with the fewest booked minutes that business date, then by name), expires that staff member's stale holds, calculates totals, deposit, and fee, sets `end_at` with the buffer and the business date, snapshots payment details, the cancellation policy, and the accepted privacy notice version, upserts the client record, inserts as `held`, fills the caller's profile name and mobile number when empty, and notifies the branch's deposit reviewers and the booked staff member. When the overlap guard trips on a booking committed meanwhile, "any available" looks again, up to three times |
| `submit_payment_proof` | Booking's creator | Refused once the hold has run out (`hold_expired`, or `held` past `hold_expires_at`), because the slot may already be someone else's. Adds a proof, moves to `payment_submitted`, sets `review_expires_at`, notifies reviewers |
| `review_payment_proof` | Permitted member | Accept, reject, or request resubmission. Accepting confirms the booking and inserts the fee entry. Requesting resubmission resets `review_expires_at`, giving the client a full review time to send a new proof |
| `cancel_booking` | Booking's creator or a member of the branch | The client cancels before the start time from `held` (while the hold lasts), `payment_submitted`, `needs_resubmission`, `review_expired_pending_resolution`, or `confirmed`; the shop from those and `waiting` or `checked_in`. Records who, as which side, when, and why in `cancellation_metadata`. Built in phase 3; phase 4 adds withdrawing a submitted proof |
| `record_refund_outcome` | Deposit reviewers of the branch | Records a refund settled outside GroomBox: on a cancelled, rejected, or no-show booking, or for a deposit larger than the final bill |
| `create_staff_booking` | Member of the branch (any role) | Inserts as `confirmed` with no deposit or fee |
| `reschedule_booking` | Member of the branch (any role) | Moves to a new time or staff member, subject to the overlap constraint |
| `add_walk_in` | Member of the branch (any role) | Inserts as `waiting` with the next queue number |
| `check_in_booking`, `start_service`, `mark_no_show` | Member of the branch (any role) | Status moves; `start_service` sets the time range for walk-ins |
| `complete_checkout` | Member of the branch (any role) | Creates the sale, items, tips, and payments; splits the discount, calculates commission, applies the deposit, sets the business date, completes the booking |
| `get_daily_close_summary` | Owner, manager | Totals for a branch and business date |
| `close_day`, `reopen_day` | Owner, manager; owner | Writes the close with the cash float and fees collected, or unlocks it |
| `submit_statement_payment_reference` | Owner | Records the owner's reference |
| `mark_statement_paid` | Platform admin | Marks paid. Restores access when the organization was restricted for an overdue statement and none remains overdue; a manual restriction stays until `set_organization_access` lifts it |
| `void_statement` | Platform admin | Voids an issued or overdue statement, clears `statement_id` on its entries so the next cut-off bills them again, and restores access as `mark_statement_paid` does |
| `add_fee_adjustment` | Platform admin | Inserts an adjustment entry |
| `set_organization_access` | Platform admin | Restricts by hand (reason `manual`) or restores, whatever the reason |
| `upgrade_guest_profile` | Guest after linking an identity | Clears `is_guest`, fills the profile |

`get_available_slots` builds start times for one business date:

- Opening windows come from the branch hours for that day, including hours that close the next day, minus closures. Staff windows come from shifts, including shifts that end the next day, minus time off.
- Start times step by `slot_interval_minutes` from the opening time. A start time is offered when the booking's whole range, services plus the largest buffer, fits inside both windows and no blocking booking overlaps it.
- Start times earlier than now plus `min_notice_minutes`, and business dates later than today plus `booking_horizon_days`, are not offered.

Functions run by `pg_cron`, not exposed through PostgREST:

- `expire_holds` and `expire_reviews`, every 5 minutes. `private.expire_holds(staff_id)` also runs inside `create_online_booking` for one staff member; each expiry writes an activity row, with no actor from the job.
- `remind_pending_reviews`, every 5 minutes: notifies deposit reviewers for `payment_submitted` bookings with an hour or less left on `review_expires_at` and no `review_reminder_sent_at`, then sets it.
- `issue_fee_statements`, daily just after midnight in `Asia/Manila`: issues statements for a cut-off date that has just ended.
- `restrict_overdue_organizations`, daily: moves `issued` statements past `due_at` to `overdue` and restricts their organizations with reason `overdue_statement`. An organization that is already restricted keeps its reason. A manual restore therefore holds until another statement goes overdue.

Every state-changing function locks its main row `FOR UPDATE`, checks the current status and the caller's scope, performs all writes, and writes an activity log row.

Functions called by members check that the caller's organization is accessible, using the same membership lookup as the policies. `submit_statement_payment_reference` is the exception, as the statement policies are. Client-facing functions never check access status: `get_available_slots`, `get_booking_by_code`, `claim_guest_booking`, `create_online_booking`, `submit_payment_proof`, and `cancel_booking` when the client cancels.

## 13. Row-level security summary

| Table group | Select | Insert, update, delete |
|---|---|---|
| `profiles` | Own row; members see profiles of their organization's members | Own row |
| `organizations`, `branches` | Active members of an accessible organization; platform admin | Owner, limited to the editable columns below; organizations are created only by `create_organization` |
| `branch_hours`, `branch_closures`, `branch_media`, `branch_services` | Active members of an accessible organization | Owner; managers for their branches |
| Members, invites | Owner; a member sees their own row | Owner, through functions |
| `service_categories`, `services`, `staff`, `staff_branches`, `staff_services` | Members | Owner |
| `staff_shifts` | Members | Owner; managers for shifts at their branches |
| `staff_time_off` | Members | Owner; managers for staff assigned to their branches |
| `clients` | Owner, manager; staff see clients on their branches' bookings | Owner, manager (name, mobile number, notes); staff only through floor and checkout functions |
| `bookings`, `booking_services` | Members by branch scope; the booking's creator. Anyone else holding the code goes through `get_booking_by_code` | Functions only |
| `payment_proofs` | Permitted reviewers by branch; the submitter | Functions only |
| `sales`, `sale_payments` | Owner, manager by branch; staff see sales they completed (`completed_by`) | Functions only |
| `sale_items`, `sale_tips` | Owner, manager by branch; staff see rows of sales they completed and rows for their own staff profile | Functions only |
| `daily_closes`, `daily_close_staff` | Owner, manager by branch | Functions only |
| `fee_entries`, `fee_statements` | Owner, regardless of access status; platform admin | Functions only |
| `notifications` | Recipient | Recipient may set `read_at` |
| `activity_logs` | Owner; platform admin | Functions only |
| `platform_settings` | Platform admin; fee values exposed to others through booking functions, payment instructions to owners through `platform_billing_details` | Platform admin |

Column grants on the owner's direct updates:

- `organizations`: `name`, `logo_path`, `category`, `is_listed`, `deposit_type`, `deposit_fixed_amount`, `deposit_percent`, `hold_minutes`, `review_hours`, `slot_interval_minutes`, `min_notice_minutes`, `booking_horizon_days`, `cancellation_policy`. Not `slug` (insert-only, because it is in shared links and printed QR codes), `access_status`, `restricted_at`, and `restriction_reason` (only `set_organization_access`, `restrict_overdue_organizations`, `mark_statement_paid`, and `void_statement`), or `terms_accepted_at` and `terms_accepted_by` (only `accept_terms`).
- `branches`: `name`, `address`, `city`, `area`, `latitude`, `longitude`, `timezone`, `business_day_start`, `contact_number`, `payment_instructions`, `is_published`, `is_active`. Not `slug` or `organization_id`, which are insert-only.

"Accessible organization" means `access_status = 'active'`. Policies resolve membership with set-returning helpers in schema `private`, used as `organization_id in (select private.accessible_organization_ids())`:

| Helper | Returns |
|---|---|
| `accessible_organization_ids()` | Organizations where the caller is an active member and access is active |
| `owned_organization_ids()` | The same, limited to the owner role |
| `managed_organization_ids()` | The same, limited to the owner and manager roles |
| `branch_ids_with_role(roles)` | Branches of accessible organizations where the caller holds one of the roles: every branch for an owner, the assigned ones for a manager or staff member |
| `colleague_user_ids()` | Users who are active members of the caller's accessible organizations |
| `is_platform_admin()` | Whether the caller has a `platform_admins` row; used as a scalar subquery |

They are `SECURITY DEFINER` because the membership tables' own policies use them: a direct subquery on `organization_members` inside its own policy, or inside the `organizations` policy, recurses. None takes a row-varying argument, so each runs once per statement. Policy changes are measured as an authenticated role, per the repository's RLS performance rule.

## 14. Storage

| Bucket | Public | Path pattern | Write |
|---|---|---|---|
| `shop-media` | Yes | `{organization_id}/logo/{file}`, `{organization_id}/branches/{branch_id}/{file}`, `{organization_id}/staff/{staff_id}/{file}` | Owner for all three; managers for the photos of their branches |
| `payment-qr` | Yes | `{organization_id}/{branch_id}/{file}` | Owner |
| `payment-proofs` | No | `{organization_id}/{booking_id}/{file}` | The booking's creator |
| `avatars` | Yes | `{user_id}/{file}` | The user |

All buckets: 5 MB limit, image types only.

## 15. Seed data

`supabase/seed.sql` and a local seed script create, for development and tests:

- A platform admin, two owners, managers, staff with and without logins, clients, and a guest session.
- Two organizations: one with two branches, one with one branch and `restricted` access.
- Categories, services, branch offerings, staff, shifts.
- A spa branch open past midnight, with shifts and bookings that cross midnight.
- Bookings in every status, proofs in every status, completed sales, one closed day.
- Fee entries, one paid statement, one issued, one overdue.

Phase 3 seeds bookings relative to the seed time: a confirmed booking at the late-night spa that crosses midnight, a guest's held and expired holds and a client's cancelled booking at Makati, and a confirmed booking at the restricted organization. Later phases add the remaining statuses with their proofs and sales.

Seed data never goes in migrations.
