# Gleem: design brief

Last updated: 2026-10-09
Related: [product requirements](prd.md), [app flow](app-flow.md), [technical requirements](trd.md)

## 1. Direction

Gleem should feel calm, clean, and trustworthy: a tool a barber, a nail technician, and a spa receptionist are all comfortable with, and that a client trusts with a deposit.

| Principle | What it means on screen |
|---|---|
| Neutral, not gendered | No pink-and-lavender beauty clichés and no dark barber-pole styling. One palette serves all three kinds of shop |
| Money is unmistakable | Amounts are large, aligned, and labelled. The amount due now is never ambiguous |
| One action per screen | A single primary button, pinned to the bottom on phones |
| Status at a glance | Every booking state has a label, an icon, and a colour, in that order of reliance |
| Built for a busy counter | Large touch targets, readable at arm's length, usable with one hand |
| Fast on a modest phone | Light pages, system-friendly fonts, few images, restrained motion |

Visual style: flat surfaces with soft, low shadows on raised elements, generous spacing, rounded corners. Light theme at launch. Colour tokens are defined for a dark theme so it can follow without redesign.

## 2. Colour

Colours come from the Tailwind palette. Components use semantic tokens (the shadcn CSS variables), never palette names or hex values directly.

### Brand

| Role | Tailwind | Hex | Use |
|---|---|---|---|
| Primary | `teal-700` | `#0f766e` | Primary buttons, links, active navigation, selected states |
| Primary hover | `teal-800` | `#115e59` | Hover and pressed |
| Primary tint | `teal-50` | `#f0fdfa` | Selected rows, soft highlights |
| Accent | `amber-400` | `#fbbf24` | The "gleam": the logo mark, highlights, the countdown ring. Never a text colour on white |

### Neutrals (warm)

| Role | Tailwind | Hex |
|---|---|---|
| Page background | `stone-50` | `#fafaf9` |
| Card and sheet | `white` | `#ffffff` |
| Muted surface | `stone-100` | `#f5f5f4` |
| Divider and card border | `stone-200` | `#e7e5e4` |
| Input border | `stone-500` | `#78716c` |
| Secondary text | `stone-600` | `#57534e` |
| Primary text | `stone-900` | `#1c1917` |

### Status

| Meaning | Text | Background | Used for |
|---|---|---|---|
| Success | `green-700` | `green-50` | Confirmed, paid, completed |
| Warning | `amber-800` | `amber-50` | Awaiting payment, under review, due soon |
| Danger | `red-700` | `red-50` | Rejected, cancelled, overdue, destructive actions |
| Info | `sky-700` | `sky-50` | In service, checked in, notices |
| Neutral | `stone-700` | `stone-100` | Expired, no-show, past |

Destructive buttons use `red-700` with white text.

### Measured contrast

| Pair | Ratio | Passes AA for |
|---|---|---|
| White on `teal-700` | 5.47 | Text |
| `teal-700` on `stone-50` | 5.24 | Text |
| `stone-900` on `stone-50` | 16.74 | Text |
| `stone-600` on white | 7.63 | Text |
| `stone-900` on `amber-400` | 10.48 | Text |
| `green-700` on `green-50` | 4.79 | Text |
| `amber-800` on `amber-50` | 6.84 | Text |
| `red-700` on `red-50` | 5.91 | Text |
| `sky-700` on `sky-50` | 5.57 | Text |
| White on `red-700` | 6.47 | Text |
| `stone-500` on white | 4.80 | Input borders (needs 3.0) |

`stone-400` on white is 2.52 and must not be used for text, icons, or input borders. `stone-200` is for decorative dividers only.

### Token mapping (light)

| Token | Value |
|---|---|
| `--background` | `stone-50` |
| `--foreground` | `stone-900` |
| `--card`, `--popover` | `white` |
| `--primary` | `teal-700` |
| `--primary-foreground` | `white` |
| `--secondary`, `--muted` | `stone-100` |
| `--muted-foreground` | `stone-600` |
| `--accent` | `teal-50` |
| `--accent-foreground` | `teal-800` |
| `--destructive` | `red-700` |
| `--border` | `stone-200` |
| `--input` | `stone-500` |
| `--ring` | `teal-700` |

### Dark theme (defined, not shipped at launch)

| Token | Value | Check |
|---|---|---|
| `--background` | `stone-950` | |
| `--card` | `stone-900` | |
| `--foreground` | `stone-50` | 18.92 on background |
| `--muted-foreground` | `stone-400` | 7.83 on background, 6.93 on card |
| `--primary` | `teal-400` | 10.61 on background |
| `--primary-foreground` | `stone-950` | 10.61 on primary |

## 3. Typography

| Use | Font | Weights |
|---|---|---|
| Headings, numbers in summaries | Outfit | 500, 600 |
| Body, labels, inputs | Inter | 400, 500, 600 |

Both are variable fonts, self-hosted, loaded with `font-display: swap`. Only the Latin subset is shipped.

| Style | Size (Tailwind) | Weight | Use |
|---|---|---|---|
| Display | `text-3xl` (30px) | 600 | Amount due, daily close total |
| H1 | `text-2xl` (24px) | 600 | Screen title |
| H2 | `text-xl` (20px) | 600 | Section title |
| H3 | `text-lg` (18px) | 500 | Card title |
| Body | `text-base` (16px) | 400 | Default text, all inputs |
| Small | `text-sm` (14px) | 400 | Secondary text, table cells |
| Caption | `text-xs` (12px) | 500 | Badges, timestamps. Never for body text |

- Line height 1.5 for body, 1.25 for headings.
- Inputs are always 16px so iOS does not zoom on focus.
- Prices, times, queue numbers, and totals use tabular figures (`tabular-nums`).
- Sentence case everywhere, including buttons and titles.

## 4. Spacing, shape, and elevation

| Property | Rule |
|---|---|
| Spacing scale | Tailwind's 4px scale. Common steps: `2`, `3`, `4`, `6`, `8` |
| Screen gutter | `px-4` on phones, `px-6` on tablets, `px-8` on desktop |
| Section gap | `gap-6` between sections, `gap-3` or `gap-4` inside a card |
| Content width | Booking flow and forms `max-w-lg`; client area `max-w-3xl`; shop side fluid up to `max-w-7xl` |
| Radius | Cards and sheets `rounded-xl`; buttons and inputs `rounded-lg`; badges and chips `rounded-full` |
| Shadow | `shadow-sm` on cards; `shadow-lg` on sheets, popovers, and the sticky action bar. Nothing else |
| Borders | Cards have a `border` in `--border` as well as the shadow, so they hold up on dim screens |

Use scale presets. An arbitrary value needs a stated reason, as the repository rules require.

Breakpoints: phone below `md` (768px), tablet from `md`, desktop from `lg` (1024px). Layouts are designed at 375px first.

## 5. Components

Built on shadcn/ui. Gleem-specific patterns:

| Component | Specification |
|---|---|
| Primary button | `h-12` on phones, `h-10` on desktop, full width in forms and sheets, one per screen |
| Sticky action bar | Fixed to the bottom on phones with safe-area padding; holds the primary button and, in the booking flow, the running total |
| Status badge | Pill with icon and label, using the status colours. One component maps every booking state |
| Amount row | Label left, amount right in tabular figures. The "due now" row is larger and bold with a top divider |
| Time slot | Chip at least `h-11`, in a 3-column grid on phones. Selected is filled primary; unavailable times are not shown |
| Service row | Name, duration, and price, with a checkbox on the trailing side; the whole row is the tap target |
| Staff choice | Avatar, name, and title in a horizontal list; "Any available" comes first |
| Queue card | Queue number or time, client name, services, staff, status badge, and one next-step button |
| Calendar | Columns per staff member on tablet and desktop; one staff member at a time with a switcher on phones. Blocks are coloured by status with a left edge stripe and always carry the client name and time as text |
| Countdown | Remaining hold time as text with a ring in accent; turns to warning colours in the last two minutes |
| Payment details card | Method, account name, and number with a copy button, then the QR image, then the amount with a copy button |
| Bottom sheet | Used on phones for short tasks (add walk-in, review deposit); a centred dialog on desktop |
| Empty state | Icon, one sentence, one action |
| Toast | Bottom on phones, top-right on desktop; 4 seconds; never the only place an error appears |

Icons are Lucide, 20px in controls and 24px in navigation, one stroke width throughout. No emoji as icons.

## 6. Layout by surface

| Surface | Layout |
|---|---|
| Booking flow | Single column, `max-w-lg`, step title and back button at the top, sticky action bar at the bottom. No navigation chrome, no links to other shops |
| Booking status | Status badge and headline first, then what to do next, then the booking summary |
| Client area | Bottom bar on phones; cards for bookings; directory as a list with filters in a sheet |
| Floor view | Phones: one list with tabs for Waiting, In service, Upcoming, Done. Tablets and up: columns side by side |
| Owner setup | Sidebar on desktop; lists that open a form in a sheet or a page |
| Daily close | A summary of big numbers, then tables. Tables scroll inside their card on phones, never the page |
| Admin | Plain data tables with filters; density over decoration |

## 7. Motion

| Rule | Value |
|---|---|
| Duration | 150–200ms for controls, 250ms for sheets and page transitions |
| Easing | Ease-out entering, ease-in leaving |
| Properties | Transform and opacity only |
| Reduced motion | Honour `prefers-reduced-motion`: no slide or scale, fades only |
| Live updates | A new queue card fades in and is highlighted with the primary tint for two seconds; lists never jump under a finger |

## 8. Accessibility

- WCAG 2.1 AA. Text contrast at least 4.5:1; control boundaries and icons at least 3:1.
- Touch targets at least 44 by 44 pixels with 8 pixels between them.
- Every input has a visible label. Errors appear under the field, state the cause and the fix, and are announced to screen readers.
- Status is never colour alone: always a label, and an icon where space allows.
- Visible focus ring (`ring-2` in `--ring` with an offset) on every interactive element.
- Full keyboard use on the shop side and admin; focus moves to the page heading after navigation.
- Sheets and dialogs trap focus, close on Escape, and return focus to the trigger.
- The countdown is announced at sensible intervals, not every second.
- Layouts work with text scaled to 200% and in landscape.

## 9. Content and tone

- Plain, friendly English. Short sentences. No jargon: "deposit", "booking", "walk-in", "daily close".
- Say what happens next: "We'll hold your slot for 15 minutes while you pay."
- Be exact about money: "Pay ₱245 now. ₱1,300 is due at the shop."
- Be clear that payment happens outside Gleem: "Pay the shop directly, then tell us your reference number."
- Errors say what went wrong and what to do; they never blame the user.
- Currency is written as ₱ with thousands separators and no decimals unless the amount has centavos.
- Dates read "Sat, 10 Oct"; times use the 12-hour clock, "2:30 PM".

## 10. Brand basics

- **Name**: Gleem, capitalised, never all caps.
- **Mark**: a simple four-point sparkle in `amber-400` beside the wordmark in Outfit 600, `stone-900`. On a `teal-700` background the wordmark is white.
- **Shop branding**: a branch page shows the shop's own name, logo, and photos prominently. Gleem's mark appears small in the footer as "Bookings by Gleem". The shop is the brand the client came for.

## 11. Before any screen ships

- Checked at 375px, 768px, and 1280px, and in landscape on a phone.
- Checked inside the Messenger in-app browser on Android.
- Keyboard-only pass on shop and admin screens.
- Loading, empty, error, and offline states all present.
- No arbitrary Tailwind values without a stated reason.
