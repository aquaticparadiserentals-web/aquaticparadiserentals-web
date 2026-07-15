# Aquatic Paradise Rentals — Operations Manual

Single reference for running both the business and the booking system. Written for Delroy and whoever he brings on to help (staff, admin assistant, future hire) — no developer background assumed.

**What this file deliberately does NOT contain:** passwords, PINs, bank account numbers, or login credentials of any kind. Those must never live in a plaintext document — see [Credentials](#credentials) at the bottom for where they actually belong.

---

## 1. Business Overview

**Aquatic Paradise Rentals** — recreational water sports rental business based in **Bequia, St. Vincent & the Grenadines (SVG)**. Founded and owned by **Delroy Stapleton**.

- **Clients:** mostly international visitors — yacht guests anchored around Bequia.
- **Team:** Delroy (owner), 2 on-site staff, 1 delivery driver.
- **Business number:** +1 (784) 496-3447
- **Business email:** aquaticparadiserentals@gmail.com
- **Instagram:** @AquaticParadiseIsuprentals
- **Positioning:** aiming for a high-touch, seamless guest experience — not a budget rental shack.

### What's rented

| Equipment | Notes |
|---|---|
| Paddle boards (several named/colored boards — see [Equipment Inventory](#2-equipment-inventory)) | Convertible to kayak on some models |
| Double kayaks | Ideal for 2 people |
| Floating tubes / lounge chairs | |
| Snorkel gear (masks, fins) | |
| Beach paddle games | |
| Hand floaters (kids) | Free |
| 10ft safety dinghy boat | Safety/support boat |

Life jackets are **complimentary with every rental** — this is a standing policy, not an upsell.

### Current pricing (as of last price sheet)

**Daily rates:**
| Item | XCD/day | USD/day |
|---|---|---|
| Paddle board (convertible to kayak) | $50 | $19 |
| Double kayak | $50 | $19 |
| Floating tube | $15 | $6 |
| Floating lounge chair | $20 | $8 |
| Snorkeling set | $20 | $8 |
| Beach paddle games | $15 | $6 |
| Hand floater (kids) | Free | Free |

**Weekly rates** (roughly 7 days for the price of 3 — pitched at villa guests/extended stays):
| Item | XCD/week | USD/week |
|---|---|---|
| Paddle board | $120 | $60 |
| Adjustable paddle board (convertible) | $90 | $35 |
| Double kayak | $100 | $40 |
| Floaters (ring/lounge chair) | $10 | $4 |
| Snorkel gear | $20 | $8 |
| Snorkeling buoy | $40 | $15 |

**Combo packages:**
| Package | Contents | XCD | USD |
|---|---|---|---|
| Family Package | 2 paddle boards, 1 floater, snorkel gear, life jackets | $150 | $55 |
| Paddle Board + Snorkel Duo | 1 paddle board, 2 snorkel sets | $190 | $70 |
| Combo for 2 | 1 paddle board, 2 snorkel sets, life jackets | $220 | $80 |
| Day Rental Combo | 1 paddle board, full snorkel set, life jacket | $160 | $60 |
| Premium Paddle + 2 Snorkel Sets | Best snorkeling experience for two | $270 | $100 |

**Weekend & group deals:**
| Deal | Terms | XCD | USD |
|---|---|---|---|
| Weekend Rental Combo | One item per category, flat rate Fri–Sun | $150 | $55 |
| Weekend Group Rental | Paddle board + snorkel gear, Fri–Sun | $160 | $60 |
| Group Rental (5–8 boards) | 20% off — WhatsApp to confirm & lock in | — | — |

> **Note:** these numbers came from the last price sheet on file. If rates have changed since, update this table so it doesn't drift out of sync with reality — a manual is only useful if it's trustworthy.

---

## 2. Equipment Inventory

Each paddle board has its own identity (name/color) and its own matched gear set — **don't mix parts between boards**, since fins and paddles are fitted per-board.

| Board (color) | Size | Fins | Paddle |
|---|---|---|---|
| Rainbow Snake (blue) | 10' × 3" | 3 fins (1 large, 2 small) — black | Adjustable, black |
| Sea Turtle (green) | 10'6" | 3 fins (1 large, 2 small) — white | Adjustable, black |
| Horizon (yellow) | 11' × 32" × 6" | 1 large black fin | Adjustable, black |
| Horizon (pink) | 11' | 1 large black fin | Adjustable, black |
| Manta Ray (grey) ×3 | 10' × 32" × 6" | 2 small white fins | Adjustable, white |
| Sunshine (white & blue) | 11' × 33" × 6" | 1 large fin with logo | Adjustable, black w/ blue tail |

Every board also gets a foot leash and a pump for inflation/setup.

**Safety & support gear:**
- Life jackets: 8 total (4 blue, 4 red) — more added as the fleet grows. Secure each strap tightly; ask the guest and adjust if too tight.
- Safety whistles: 6+ — every life jacket must have one strapped on.
- First aid kit: 1 (expand as needed).
- CPR-safe rescue breather: 2 — for water emergencies only.
- Walkie-talkies: 2 — keep charged, keep on you at all times. Not fully waterproof.
- Digital anemometer: 1 — **check wind speed before and after each rental.** Call the renter to confirm conditions are still safe partway through if wind picks up.
- Waterproof bags: 2 — store all non-waterproof gear/electronics in these at all times.
- Carabiners: 20.
- Business phone: 1 — keep charged; keep in the waterproof case, sealed, whenever on the beach. Nobody else uses this phone.
- Diving masks: 8, Scuba fins: 8 — sanitize before and after every use (hot water). Check for tears, cracks, fogging before handing to a guest.
- Coolers: 3 — for drinks during tours/snorkel packages.
- Folders: several — for contracts, waivers, and paperwork.

**Cleaning protocol:** sanitize gear before/after each use, and film a quick before/after cleaning clip for social media — it visibly reassures guests the gear is kept clean.

---

## 3. Team & Roles

- **Owner (Delroy):** oversight, growth, scaling decisions. Currently also working aboard Carnival Jubilee as Sports Staff while transitioning into IT.
- **On-site staff (2):** day-to-day gear handling, guest check-in/out on the beach.
- **Driver (1):** delivery/pickup logistics between the beach and guest locations (villas, yacht moorings).

Keep phone numbers for staff and drivers current in the **admin console's Team and Drivers tabs** — that's the single source of truth for who to contact, not a separate paper list.

---

## 4. The Booking System — How It's Built

The business runs on a self-built Progressive Web App (PWA), not a third-party booking platform. No monthly SaaS fee, fully owned.

### Live URLs

| Page | URL | Who uses it |
|---|---|---|
| Booking site (public) | https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/ | Guests |
| Admin console | .../admin.html | Delroy / owner (PIN-protected) |
| Dispatch console | .../dispatch.html | Delivery staff (separate PIN, scoped token — never sees pricing) |
| Guest feedback form | .../feedback.html?ref=BOOKING-REF | Guests, after a rental (link sent via WhatsApp) |
| Printable rules | .../rules.html | Guests, for waiver/sign-off |

`aquaticparadiserentals.com` is referenced in the footer as the brand domain but **does not currently resolve** — no custom domain is wired up yet. The site is live and working at the `github.io` URL above; see [§9 Known Gaps](#9-known-gaps--whats-missing) if you want the custom domain pointed at it.

### Architecture (plain terms)

| File | Role |
|---|---|
| `index.html` | Public booking page. Installable as an app on a phone (PWA), works offline for basic viewing. |
| `admin.html` | Owner console — bookings, drivers, staff, inventory, safety, rates, guest feedback. |
| `dispatch.html` | PIN-locked delivery-staff console — sees only name/gear/time/location per booking, never pricing or full guest PII. Lets a driver confirm/mark a delivery done, message the guest on WhatsApp, and share their current location. |
| `feedback.html` | Public, no-login guest feedback form — 1–5 star rating + optional comment, tied to a booking reference. |
| `rules.html` | Printable rules & regulations page for guests. |
| `Code.gs` | All backend logic, running on Google Apps Script (free, part of Google's ecosystem). |
| Google Sheet ("APR Master Log") | The database. Tabs: `BOOKINGS`, `DRIVERS`, `STAFF`, `INVENTORY`, `FEEDBACK`. No separate database to pay for or maintain. |
| `sw.js` | Service worker — makes the site installable and lets it work with a spotty connection (common on a beach). |
| `offline-queue.js` | Shared IndexedDB write-queue (added 2026-07-16), loaded by `index.html`/`feedback.html`/`dispatch.html`. When a booking, feedback submission, or driver GPS ping can't reach the backend (no signal), it's queued locally and auto-retried once connectivity returns instead of being silently lost. |
| `manifest.json` | PWA metadata (app name, icons, install behavior). |

### How a booking flows

1. Guest fills out the form in `index.html` (name, contact, dates, gear, group size, optional ID photo for verification).
2. Submission goes to the Apps Script backend, which validates every field, saves it as a new row in the **BOOKINGS** sheet, uploads the ID photo (if provided) to a private Google Drive folder, and emails a notification to `aquaticparadiserentals@gmail.com`.
3. Staff open `admin.html` (PIN-protected) or delivery staff open `dispatch.html` (separate PIN, weaker scoped token), see the new booking, and progress its status: pending → confirmed → delivering → done.
4. Tapping **🚚 Start Delivery** (sets status to `delivering`) starts a 60-second auto-GPS ping loop for as long as the tab stays open and foregrounded (added 2026-07-15); the older one-tap **Share Location** button still works as a manual fallback at any time. Either way, admin/dispatch see a "view on map" link to the most recent position.
5. Once a booking is marked **done**, dispatch staff can tap **Ask Feedback** to send the guest a WhatsApp message with a direct link to `feedback.html?ref=<their booking ref>`. Submitted ratings/comments land in the **FEEDBACK** sheet and show up under the admin **Feedback** tab (average rating + individual reviews).
6. Drivers/staff/inventory are all shared across every device — stored in the Sheets backend, not stuck on one phone or browser.

### Two-tier access control

- **`APP_TOKEN`** — full access (owner/admin console). Can read pricing, revenue, guest PII, ID photos.
- **`STAFF_TOKEN`** — dispatch-only. Can read/update delivery status and driver location, but the backend (`_dispatchAuthOk` in `Code.gs`) deliberately blocks it from ever reaching pricing, revenue, or full guest PII endpoints. Give this token to delivery staff; never give them `APP_TOKEN`.
- Guest-facing actions (`saveBooking`, `submit_feedback`) require **no token** — a customer must be able to book or leave feedback without logging in.

Actual token values live in `Code.gs` and the `BACKEND`/token constants at the top of `dispatch.html` — see [Credentials](#credentials) for why they're not repeated here.

### Where guest ID photos go

Uploaded to a Google Drive folder named **"APR Guest ID Photos"**, linked from the booking record. Treat this folder as containing sensitive personal data — it should not be shared publicly or forwarded outside the business.

### Where guest signatures go

As of 2026-07-15, the waiver step captures a drawn signature (canvas signature pad, with a typed-name fallback for accessibility/no-touch devices) and uploads it to a Google Drive folder named **"Aquatic Paradise Signatures"** — same private-by-default handling as ID photos (not a public link; viewed from admin via a token-gated action).

---

## 5. Building This From Scratch (or Recovering It)

If this system ever needs to be rebuilt from zero — new Google account, disaster recovery, or handing it to someone else — this is the order of operations:

1. **Create the Google Sheet.** New blank Sheet, name it "APR Master Log" (or anything — the name isn't hardcoded).
2. **Attach the backend.** Extensions → Apps Script → paste in `Code.gs` → Save.
3. **Set the manifest.** The Apps Script project also needs `appsscript.json` (webapp `executeAs: USER_DEPLOYING`, `access: ANYONE_ANONYMOUS`, V8 runtime) — this repo already has a copy checked in.
4. **Deploy as a web app.** Deploy → New deployment → type "Web app" → Execute as: **Me** → Who has access: **Anyone**. Copy the resulting `/exec` URL.
5. **Wire the frontend to the backend.** That `/exec` URL is the `BACKEND` constant — it appears at the top of the `<script>` block in `index.html`, `admin.html`, `dispatch.html`, and `feedback.html`. Update all four if the URL ever changes (see the warning in §6 about why it normally shouldn't).
6. **Run the one-time setup functions** (see §6) from the Apps Script editor: `installHealthCheckTrigger()`, `installWeatherCheckTrigger()`, `seedLifeJacketInventory()`, `seedFullInventory()`, `seedDefaultStaff()`, and either `setupDailyReportTrigger()` or `setupWeeklyReportTrigger()`.
7. **Deploy the frontend.** Push `index.html`, `admin.html`, `dispatch.html`, `feedback.html`, `rules.html`, `manifest.json`, `sw.js`, and `icons/` to the GitHub repo, then enable **GitHub Pages** on it (Settings → Pages → deploy from `main`). That gives the `github.io` URL in §4. Optionally point a custom domain at it (see §9).
8. **Set the PINs.** Log into `admin.html` and `dispatch.html` once each and set their access PINs through the app UI — don't hardcode them anywhere in this repo.

Everything above only needs to happen once. Ongoing changes are covered by §6.

---

## 6. Deploying Changes

### Backend (`Code.gs`)

As of **2026-07-07**, this repo is wired up to **`clasp`** (Google's official CLI for Apps Script), so deploys are one command instead of copy-pasting into the script editor:

```
clasp push                                              # uploads Code.gs + appsscript.json to the project
clasp deploy -i AKfycbzr1KHela518-pgQ3dJyvv77tm9z2JWo_TTovRNys6RwYNBIUfdyJKxGF_ETzNk9m47Ww   # updates the LIVE deployment
```

**The two-step matters.** `clasp push` alone only updates the project's saved code — the live `/exec` URL that the apps actually call won't change until `clasp deploy -i <that same deployment ID>` runs. Never run `clasp deploy` without `-i` pointed at the existing deployment ID above — creating a brand-new deployment gets a brand-new URL, and every `BACKEND` constant in the HTML files would stop matching, breaking everything until updated.

`clasp` is logged in as `delroystapleton908@gmail.com` on the machine it was set up on — that account currently has push/deploy access to the Apps Script project (which itself lives under `aquaticparadiserentals@gmail.com`, shared with the personal account). `.clasp.json` and `.claspignore` in this repo scope `clasp push` to touch only `Code.gs` and `appsscript.json` — it will never overwrite the frontend files.

If `clasp` isn't set up on a given machine: `npm install -g @google/clasp`, then `clasp login`, then see §5 step 4-5 for the manual fallback (paste into script.google.com directly).

### Frontend (`index.html`, `admin.html`, `dispatch.html`, `feedback.html`, `rules.html`)

Just commit and push to the GitHub repo (`aquaticparadiserentals-web/aquaticparadiserentals-web`) — GitHub Pages picks up the change automatically, usually within a minute or two.

### One-time setup functions (run once each, from the Apps Script editor, after deploying)

- `installHealthCheckTrigger()` — turns on the automated system health check.
- `installWeatherCheckTrigger()` — turns on the daily wind/conditions check.
- `seedLifeJacketInventory()` — labels your existing 8 life jackets as adult-size (`LJ-A1`–`LJ-A8`) in the shared inventory. Safe to re-run.
- `seedFullInventory()` — labels your 8 named paddle boards plus generic kayak/snorkel/floater counts in the shared inventory. Safe to re-run.
- `seedDefaultStaff()` — migrates your real staff roster (Operations Manager, Dravin, Shammar) into the shared STAFF sheet. Safe to re-run.
- `setupDailyReportTrigger()` **or** `setupWeeklyReportTrigger()` (run only one) — see §7 for the schedule. Run `testReportNow()` anytime to send one immediately without waiting for the schedule.

If a service worker cache bump ever needs forcing (after a batch of frontend changes), bump the `CACHE` version string in `sw.js` — see the comment there.

---

## 7. Automated Timings At A Glance

All times are in the script's timezone, **America/New_York** (set in `appsscript.json`) — not Bequia local time (SVG is UTC-4 year-round; New York is UTC-4/-5 depending on daylight saving, so these can drift up to an hour off Bequia clock time across the year).

| What | Trigger function | Schedule | What it does |
|---|---|---|---|
| System health check | `healthCheck` | Every 6 hours | Emails you **only** if something's broken (e.g. a stuck notification). Silent otherwise. |
| Weather / conditions check | `dailyWeatherCheck` | Daily, ~6 AM | Pulls a wind/gust forecast for Bequia, updates the live safe/caution/unsafe banner on the booking page and admin console, emails you a digest, and auto-emails today's guests if conditions turn caution/unsafe. |
| Business report | `sendAutoReport` | Either daily at 6 PM **or** weekly Monday at 8 AM (pick one via §6) | Bookings/revenue/gear-usage report emailed to you. Deliberately excludes deposits and staff commission — those have their own read-only admin reports (Bookings tab, Commission tab, added 2026-07-15) so the auto-email can't be misread as "cash collected." |
| Rate limiting | `_rateLimitOk` (not a trigger — runs inline per request) | Max 20 submissions/minute per action bucket (booking, feedback) | Blocks abuse/spam without needing a trigger — resets every 60 seconds. |

Non-automated, human-driven rhythm (Delroy's own working schedule, not the software):
- **Monday:** content day (social media, marketing material).
- **Wednesday:** business development day (partnerships, outreach, growth work).
- **Friday:** review & planning (what worked this week, what's next).

---

## 8. Safety Non-Negotiables

- Check wind speed with the digital anemometer **before** renting and **after**, calling the guest mid-rental if conditions change.
- Every life jacket must have a whistle attached, straps secured snugly.
- Sanitize masks, fins, and shared gear before and after each use.
- Walkie-talkies and the business phone stay charged and on-person during beach operations.
- CPR-safe rescue breathers exist for water emergencies — know where they are before you need them.

**Automated daily conditions check:** see §7 — this does **not** replace the manual anemometer check above, it's a heads-up layer, not a substitute for the on-the-spot judgment call before each rental.

---

## 9. Known Gaps / What's Missing

Honest list of what this system does **not** do yet, so nobody assumes it's more complete than it is:

- **Custom domain not wired up.** `aquaticparadiserentals.com` is referenced in the site footer but doesn't resolve — the real live URL is the `github.io` one in §4. Fixing this needs: (a) DNS records at the domain registrar pointing at GitHub Pages, and (b) a `CNAME` file added to this repo. Neither exists yet.
- **Driver location auto-refreshes, but only in the foreground.** As of 2026-07-15, tapping "🚚 Start Delivery" in `dispatch.html` (or admin Dispatch) sets a booking to `delivering` and starts a 60-second GPS ping loop, paused via the Page Visibility API whenever the tab isn't on screen. This is still **not** true background tracking — there's no OS-level background location permission in a PWA, so the driver's screen has to stay on and the tab open. The old one-shot "📍 Share Location" button still exists as a manual fallback.
- **Deposits and staff commission are now tracked, manually.** As of 2026-07-15: bookings carry `depositAmount`/`depositReceivedAt`/`depositStatus`, set from the admin Bookings tab (amount typed in, "Mark Received" stamps the date — no calculated percentage, no gateway). Staff carry a `commissionPct` (Team tab) and bookings carry `staffId`/`staffName` (assigned from the Bookings tab); the admin Commission tab reports sum(booking total × commission %) per staff member for a selected period. Both are read-only reports — no payout automation, no payment gateway.
- **No payment processing.** Bookings don't collect payment online — presumably still cash/in-person or a separate arrangement. Deposits are recorded manually (see above) after a BOSVG bank transfer, not collected through this system.
- **Feedback has no moderation or spam filtering beyond rate limiting.** Anyone with a booking ref (which isn't secret — it's shown to the guest) could theoretically submit multiple feedback entries. Low risk given the guest volume, but worth knowing.
- **No admin history of driver location over time** — only the *last* known point is kept per booking, not a trail.
- **No automated tests.** Changes to `Code.gs` or the frontend are verified manually (or via a live-preview browser check) rather than an automated test suite. Fine at this scale, but worth naming as a real gap if the codebase grows.
- **Repo hygiene:** OneDrive-synced folders occasionally generate sync-conflict duplicate files (e.g. past instances of `Code 6.gs`, `admin 3.html`) that can get accidentally committed — worth a quick glance at `git status` before big edit sessions.

None of these block current operations — they're the honest boundary of "what's built" vs. "what's possible," for whoever picks this up next (including a future AI assistant).

---

## 10. Growth Ideas

Ranked by how directly they hit the goals Delroy's stated: more inbound leads, less on-site staffing, a pickup/delivery system that runs without him micromanaging it, and content that positions him as a systems expert.

1. **Turn the platform itself into your marketing.** You built a booking + admin + driver-dispatch system on Google's free tier with no monthly SaaS fee — most small rental operators pay $50–200/mo for this. A short post/video on "how I built my own booking system for $0/month" does double duty: content for the business (Monday is already content day) and a portfolio piece for the IT career transition. Nobody else in Bequia rental is likely showing this.
2. **QR code at every pickup point straight to the booking form.** You already have a QR code file on hand (`NEW AQUATIC PARADISE QR CODE.pdf` in Downloads) — put it on a sign at the beach stand, on the boards themselves, and in villa welcome packets. Removes a staffing step (someone explaining how to book) and captures walk-up guests who'd otherwise just ask a staff member instead of self-serving.
3. **Marina/villa-manager referral partnerships.** Your clients are already yacht guests and villa renters — a small referral commission (or a simple "mention this villa, get 10% off") to the handful of villa managers and marina staff in Bequia turns them into a lead pipeline that costs nothing until a booking actually happens. Much cheaper than ad spend for a niche, high-intent audience.
4. ~~Automate the post-rental review ask once the feedback form is built.~~ **Done (2026-07-07).** `feedback.html` exists and dispatch staff send the link by WhatsApp when a booking is marked done. Next step beyond this: also route the highest ratings toward a public Google review ask, since on-platform feedback alone doesn't drive new inbound search traffic the way a public review does.
5. **Package the two ideas already on file as real bookable products, not just notes.** Night-glow paddle sessions and corporate/group team-building both extend revenue into off-peak hours/season without buying more inventory — same boards, different time slot or audience. Give each its own combo price and a line in the booking form's gear dropdown so guests can actually book it instead of it staying a someday-idea.
6. **A lightweight FAQ auto-reply for WhatsApp during peak hours.** Most guest questions before a booking (pricing, availability, "do you deliver to my villa") are repetitive. A WhatsApp Business quick-reply or auto-response for the top 3–4 questions cuts the back-and-forth that currently needs a staff member, freeing them for the two on-site jobs that actually need a human: gear handoff and safety.

---

## Credentials

This manual intentionally excludes every password, PIN, account number, and API token — including `APP_TOKEN` and `STAFF_TOKEN` (see §4), even though those specific two already live in plaintext inside `Code.gs`/`dispatch.html` as a practical tradeoff of the Apps Script model (there's no secrets vault in this stack). Don't compound that by also duplicating them into a doc. Store real credentials — Google account passwords, admin/dispatch PINs, banking PINs, account numbers — in a proper password manager (Bitwarden's free tier, 1Password, or similar), never in a Word document or plaintext file, especially not one syncing to OneDrive or sitting in a shared folder. If you're currently keeping banking PINs or account numbers in a `.docx`, that should be moved out and that file deleted as soon as the credentials are safely stored elsewhere.
