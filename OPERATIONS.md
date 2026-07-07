# Aquatic Paradise Rentals — Operations Manual

Single reference for running both the business and the booking system. Written for Delroy and whoever he brings on to help (staff, admin assistant, future hire) — no developer background assumed.

**What this file deliberately does NOT contain:** passwords, PINs, bank account numbers, or login credentials of any kind. Those must never live in a plaintext document — see [Credentials](#credentials) at the bottom for where they actually belong.

---

## 1. Business Overview

**Aquatic Paradise Rentals** — recreational water sports rental business based in **Bequia, St. Vincent & the Grenadines (SVG)**. Founded and owned by **Delroy Stapleton**.

- **Clients:** mostly international visitors — yacht guests anchored around Bequia.
- **Team:** Delroy (owner), 2 on-site staff, 1 delivery driver.
- **Business number:** +1 (784) 496-3447
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

## 4. The Booking System — How It Works

The business runs on a self-built Progressive Web App (PWA), not a third-party booking platform. No monthly SaaS fee, fully owned.

### Architecture (plain terms)

- **`index.html`** — the public booking page guests use. Installable as an app on a phone (PWA), works offline for basic viewing.
- **`admin.html`** — the staff/owner console: view bookings, manage drivers, notify delivery, manage staff, safety info.
- **`rules.html`** — printable rules & regulations page for guests.
- **`Code.gs`** — the backend logic, running on Google Apps Script (free, part of Google's ecosystem).
- **Google Sheet** — the database. Every booking is a row. No separate database to pay for or maintain.
- **`sw.js`** — service worker that makes the site installable and lets it work with a spotty connection (common on a beach).

### How a booking flows

1. Guest fills out the form in `index.html` (name, contact, dates, gear, group size, optional ID photo for verification).
2. Submission goes to the Apps Script backend, which validates every field, saves it as a new row in the **BOOKINGS** sheet, uploads the ID photo (if provided) to a private Google Drive folder, and emails a notification to `aquaticparadiserentals@gmail.com`.
3. Staff open `admin.html` (PIN-protected), see the new booking, and can mark it for delivery — which notifies the assigned driver over WhatsApp with the guest's location.
4. Drivers are managed in the **Drivers tab** of admin.html — add/remove drivers, see who's on the roster. (This is shared across every device now — added in July 2026 — not stuck on one phone anymore.)

### Where guest ID photos go

Uploaded to a Google Drive folder named **"APR Guest ID Photos"**, linked from the booking record. Treat this folder as containing sensitive personal data — it should not be shared publicly or forwarded outside the business.

---

## 5. Deploying Changes

Whenever `Code.gs` is updated (a developer, or a future AI assistant, changes the backend logic), it must be manually deployed — code changes on disk do **not** automatically go live.

1. Open the Google Sheet that backs the booking system → **Extensions → Apps Script**.
2. Open `Code.gs` in the script editor.
3. Select all, delete, paste in the updated version.
4. Save (Ctrl+S).
5. **Deploy → Manage deployments** → click the pencil icon on the existing active deployment.
6. Change "Version" to **New version** → **Deploy**.
7. Approve any new permission prompts if Google asks (this happens when the script touches a new part of your account, like a new sheet tab).

**Important:** always use *Manage deployments → edit existing*, never "New deployment" — a new deployment gets a new URL, and the app's `BACKEND` constant (in `admin.html`/`index.html`) would stop matching, breaking everything until updated.

Frontend changes (`index.html`, `admin.html`, `rules.html`) just need to be pushed to the GitHub repo (`aquaticparadiserentals-web/aquaticparadiserentals-web`) — whatever's hosting the site picks up the change automatically (GitHub Pages, or wherever it's currently pointed).

### One-time setup functions (run once each, from the Apps Script editor, after deploying)

- `installHealthCheckTrigger()` — turns on the automated system health check (runs every 6 hours, emails you only when something's broken).
- `installWeatherCheckTrigger()` — turns on the daily wind/conditions check (runs ~6am daily, emails you a digest, emails today's guests automatically if conditions turn caution/unsafe).
- `seedLifeJacketInventory()` — labels your existing 8 life jackets as adult-size (`LJ-A1`–`LJ-A8`) in the shared inventory. Safe to re-run.

If a service worker cache bump ever needs forcing (after a batch of frontend changes), bump the `CACHE` version string in `sw.js` — see the comment there.

---

## 6. Daily / Weekly Rhythm

Per Delroy's own working rhythm:
- **Monday:** content day (social media, marketing material).
- **Wednesday:** business development day (partnerships, outreach, growth work).
- **Friday:** review & planning (what worked this week, what's next).

---

## 7. Safety Non-Negotiables

- Check wind speed with the digital anemometer **before** renting and **after**, calling the guest mid-rental if conditions change.
- Every life jacket must have a whistle attached, straps secured snugly.
- Sanitize masks, fins, and shared gear before and after each use.
- Walkie-talkies and the business phone stay charged and on-person during beach operations.
- CPR-safe rescue breathers exist for water emergencies — know where they are before you need them.

**Automated daily conditions check (added 2026-07-07):** the app now pulls a daily wind/gust forecast for Bequia and shows a live safe/caution/unsafe banner on both the booking page and admin console, plus emails you a daily digest and auto-emails today's guests if conditions turn caution/unsafe. **This does not replace the manual anemometer check above** — it's a heads-up layer, not a substitute for the on-the-spot judgment call before each rental.

---

## 8. Growth Ideas

Ranked by how directly they hit the goals Delroy's stated: more inbound leads, less on-site staffing, a pickup/delivery system that runs without him micromanaging it, and content that positions him as a systems expert.

1. **Turn the platform itself into your marketing.** You built a booking + admin + driver-dispatch system on Google's free tier with no monthly SaaS fee — most small rental operators pay $50–200/mo for this. A short post/video on "how I built my own booking system for $0/month" does double duty: content for the business (Monday is already content day) and a portfolio piece for the IT career transition. Nobody else in Bequia rental is likely showing this.
2. **QR code at every pickup point straight to the booking form.** You already have a QR code file on hand (`NEW AQUATIC PARADISE QR CODE.pdf` in Downloads) — put it on a sign at the beach stand, on the boards themselves, and in villa welcome packets. Removes a staffing step (someone explaining how to book) and captures walk-up guests who'd otherwise just ask a staff member instead of self-serving.
3. **Marina/villa-manager referral partnerships.** Your clients are already yacht guests and villa renters — a small referral commission (or a simple "mention this villa, get 10% off") to the handful of villa managers and marina staff in Bequia turns them into a lead pipeline that costs nothing until a booking actually happens. Much cheaper than ad spend for a niche, high-intent audience.
4. **Automate the post-rental review ask once the feedback form is built.** A WhatsApp message when a rental is marked "Done" with a direct link to leave a Google review. For a tourism business, Google review volume/recency directly drives new inbound search traffic — this closes the loop from "guest had a good time" to "next guest finds you."
5. **Package the two ideas already on file as real bookable products, not just notes.** Night-glow paddle sessions and corporate/group team-building both extend revenue into off-peak hours/season without buying more inventory — same boards, different time slot or audience. Give each its own combo price and a line in the booking form's gear dropdown so guests can actually book it instead of it staying a someday-idea.
6. **A lightweight FAQ auto-reply for WhatsApp during peak hours.** Most guest questions before a booking (pricing, availability, "do you deliver to my villa") are repetitive. A WhatsApp Business quick-reply or auto-response for the top 3–4 questions cuts the back-and-forth that currently needs a staff member, freeing them for the two on-site jobs that actually need a human: gear handoff and safety.

Two ideas already on file, now folded in above rather than left as loose notes:
- ~~Night-glow paddle sessions~~ → #5
- ~~Corporate/group team-building~~ → #5

---

## Credentials

This manual intentionally excludes every password, PIN, and account number. Store those in a proper password manager (Bitwarden's free tier, 1Password, or similar) — never in a Word document or plaintext file, especially not one syncing to OneDrive or sitting in a shared folder. If you're currently keeping banking PINs or account numbers in a `.docx`, that should be moved out and that file deleted as soon as the credentials are safely stored elsewhere.
