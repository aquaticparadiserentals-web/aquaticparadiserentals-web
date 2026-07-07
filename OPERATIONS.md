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

---

## 8. Future Growth Ideas on File

Ideas already noted as worth exploring when there's bandwidth:
- **Night-glow paddle sessions** — waterproof LED kits on clear-bottom kayaks.
- **Corporate/group team-building** — structured water sports events for visiting groups.

(See the growth ideas write-up for a fuller, current list.)

---

## Credentials

This manual intentionally excludes every password, PIN, and account number. Store those in a proper password manager (Bitwarden's free tier, 1Password, or similar) — never in a Word document or plaintext file, especially not one syncing to OneDrive or sitting in a shared folder. If you're currently keeping banking PINs or account numbers in a `.docx`, that should be moved out and that file deleted as soon as the credentials are safely stored elsewhere.
