# Aquatic Paradise Rentals — Build Progress

**Last updated:** 2026-07-19 — all previously-staged backend work (2026-07-15 staff commission/deposits/feedback analytics/auto-GPS/e-signature, 2026-07-16 offline queue + booking-ref feedback check) is now **live**: `clasp push` + `clasp deploy -i` to the existing deployment ran today (now @24), confirmed the live `/exec` URL responds and matches the ID used by `index.html`.
**Live site:** https://aquaticparadiserental.vacations
**Repo:** aquaticparadiserentals-web (GitHub: aquaticparadiserentals-web/aquaticparadiserentals-web, branch `main`)
**Stack:** Google Apps Script (`Code.gs`) + Google Sheets backend · HTML/JS frontend · PWA (`manifest.json`, `sw.js`) · GitHub Pages hosting · deployed via clasp
**Running cost:** $0/month. Only recurring cost: domain, $48.99/yr via Netlify, auto-renews 2027-05-15.

Build started 2026-06-20. 55+ commits.

---

## Domain & hosting — DONE (2026-07-09)

- **Custom domain live:** `aquaticparadiserental.vacations` → GitHub Pages (was 404ing since purchase; claimed via CNAME file)
- **HTTPS enforced** — plain http:// 301-redirects to https; verified
- **www fixed** — DNS record repointed from dead Netlify site to GitHub Pages; www redirects to main domain
- **Old GitHub URL** (`aquaticparadiserentals-web.github.io/...`) 301-redirects to the domain — old QR codes/links keep working
- **DNS hosted at Netlify** (NS1 nameservers) — the Netlify account must stay alive for the domain to resolve; its 3 sites are otherwise unused/offline (free-tier usage exceeded) and nothing depends on them
- ⚠️ **Domain renewal: $48.99/yr, auto-renews ~2027-05-15** on the Netlify payment method. Set an April 2027 reminder; consider transferring to a cheaper registrar (~$12–20/yr) before renewal

## Core platform — DONE

- **Booking app** (`index.html`) — guest booking flow, waiver, offline-capable PWA, brand design (Cormorant Garamond + Outfit), social share previews (updated to new domain)
- **Admin dashboard** (`admin.html`) — owner-only, `APP_TOKEN`-gated
- **Rules page** (`rules.html`) — printable rules & regulations
- **Gear guide** (`gear-guide.html`, added 2026-07-09) — step-by-step SUP inflate/deflate with read-aloud (built-in speech synthesis) and optional voice commands ("next/back/repeat") on supporting phones; linked from booking page. ⚠️ Steps use generic iSUP defaults (12–15 PSI) — confirm against the actual boards
- **Live backend** — Apps Script + Sheets, verified responding

## Goal #5 features (internal ops platform) — ALL DONE

- **Identity verification** — guest ID photo upload → Google Drive, linked to booking row
- **Driver location tracking** — share-link model: dispatch console "Share Location" button, one-shot geolocation, Maps link in dispatch + admin
- **Client feedback** — public `feedback.html` (stars + comment → `FEEDBACK` sheet), WhatsApp send on completion, admin Feedback tab, deletion
- **Mobile access** — PWA, works from mobile browsers

## Staff & ops tooling — DONE

- **Dispatch console** (`dispatch.html`) — PIN-locked, scoped `STAFF_TOKEN` (no pricing), server-side PIN verification, PIN change UI + reset escalation
- **Customers section** — per-guest history, double-booking flag, regular badge
- **Fleet tab** — real inventory, bulk restock, all categories, adult/kid life jackets, voice input
- **Guest help-desk widget** — rule-based FAQ on booking page, WhatsApp handoff (no AI, no cost)
- **Automated reports** — daily/weekly business report (Apps Script triggers)
- **Weather monitoring** — automated daily conditions check + guest heads-up
- **WhatsApp alerts** — tap-to-send links throughout

## Mobile & guest-experience fixes — DONE 2026-07-10

All verified in a phone-sized browser and live on the domain:
- **Rates table swipeable on phones** — 7 price columns scroll sideways, gear-name column stays pinned, swipe hint shown on small screens
- **Tabs open at the top** — booking app and admin dashboard both reset scroll on every tab switch (was landing users mid-page)
- **Hours & Location** (help widget) — jumps to the contact card and highlights it; card now lists all three beaches
- **Beach picker on bookings** — required "Choose Your Beach" select (Princess Margaret / Lower Bay / Friendship Bay); stored in booking notes (no backend column change needed)
- **Payment Options section** (Rates tab) — cash, bank transfer (BOSVG), card. **Bank account details deliberately WhatsApp-only** — guests request them via a prefilled WhatsApp link; do not publish the account number
- **Rules read-aloud** — 🔊 Listen button on rules.html (speech synthesis, same as gear guide)
- **New safety rule (caps)** — DO NOT KEEP ANY OF THE EQUIPMENT IN THE SUN, with the heat/UV explanation
- **Emergency contacts expanded** — Bequia Hospital 784-458-3294 and Bequia Police 784-458-3350 added to rules.html and the admin Safety tab (listed before the St. Vincent numbers)
- **Meet the Team** — public page shows "Delroy — Owner & Operations Manager" (display override; STAFF sheet still has the old "Operations Manager" row — rename via admin Team tab when convenient)
- **Weather banner self-heals** — if the backend has no reading, the app checks Open-Meteo directly from the guest's phone (same Bequia coordinates + wind thresholds). Working today (showed Unsafe, ~43 km/h)
- **Admin Settings → Weather card** — "Turn On Weather Checks" button added (the backend action existed but had no UI). ⚠️ Not yet pressed — backend still returns status "unknown"

## Legitimacy pass — DONE 2026-07-10 (evening)

All live (site pushed, backend deployed as web app version 20):
- **Admin console rebuilt as full-screen sections** — home menu of tiles, each section opens whole-page with a ← Back button (old tab strip had a CSS bug stacking tabs vertically)
- **New Dispatch section in admin** — same no-pricing delivery list drivers see, with confirm/done/share-location/ask-feedback
- **Guest confirmation email** — sent automatically on booking (when email given): pending status, deposit-request path, weather promise
- **Deposit-pending flow** — success screen now says PENDING until confirmed; deposit via WhatsApp secures the slot
- **Cancellation & weather policy** — published on booking page + waiver clause 6: unsafe conditions = free rebook or full refund; free cancel up to 2h before
- **Waiver signature** — typed full-name signature required, stored in notes (waiverTimestamp column already existed)
- **privacy.html** — data collected, why, retention (ID photos deleted within 30 days), guest rights; linked from booking page
- **Overbooking warning** — admin Bookings flags days where booked gear exceeds fleet stock
- **Weekly Sheet backup** — Code.gs `weeklyBackup` (Sundays ~3 AM, keeps 8, "APR Backups" Drive folder) + admin Settings "💾 Turn On Weekly Backups" button. ⚠️ Not yet pressed
- **SEO** — robots.txt + sitemap.xml added (site had ZERO pages indexed; old dead Wix site still ranks #1). ⚠️ Owner: Google Search Console setup + request indexing; use "Remove Outdated Content" tool on aquaticparadiserental.com
- **Weather banner reliability** — auto-refresh 15 min, tap-to-retry, stale-reading detection, online-event recheck

## Favicon / logo fix — DONE 2026-07-12

- Real logo now the site icon everywhere: `icons/icon-48/180/192/512.png` regenerated from `logo.jpg` (old 192/512 were a generic teal placeholder — also what installed PWAs showed)
- index.html's base64 data-URI favicon (invisible to Google) replaced with PNG links; all six other pages had no icon and got the same links
- sw.js cache bumped to v6 so installed apps refresh the icon
- ⚠️ Google search results still show the globe until Google recrawls the homepage — Search Console "Request Indexing" (owner action list #2) speeds this up; otherwise expect days–weeks

## Staff commission, deposits, feedback analytics, live GPS — DONE 2026-07-15

All in `Code.gs`, `admin.html`, `dispatch.html` — pushed and live as of 2026-07-19 (clasp deploy @24).

- **Staff commission tracking** — `STAFF` sheet gets a `commissionPct` column (self-healing migration, same pattern as other sheets), editable per staff member from the Team tab (inline % field + Save). Bookings get `staffId`/`staffName` columns — no prior driver/staff attribution existed on a booking, so this is a new field, assigned via a dropdown on each card in the Bookings tab. New admin **Commission** tab: This Week / This Month / custom date-range report, server-computed (`getCommissionReport` action) as sum(booking.total × staff.commissionPct) for bookings attributed to them in that window, plus an "unassigned bookings" total for visibility. Read-only, no payout automation. Date range keys off the booking's `datetime` (the rental date/time) — fixed 2026-07-15 (was keying off `Timestamp`, when the booking was logged; owner confirmed rental date is the right period definition for payroll).
- **Deposit tracking (manual, BOSVG bank transfer)** — Bookings get `depositAmount`/`depositReceivedAt`/`depositStatus` columns. Admin Bookings tab: amount field + "Mark Received" button per booking stamps today's date and flips status to `received` (`markDepositReceived` action) — no percentage calculated or required, whatever the owner enters is what's recorded. Deposit status/amount shown on every booking card. Does **not** touch the existing WhatsApp bank-transfer-details flow.
- **Feedback analytics** — new blocks in the existing Feedback tab: rating distribution (1★–5★ bar counts), trend (average rating by week, simple bar list), and a flagged list of ≤2★ reviews with comments for follow-up. Pure client-side aggregation over the feedback data the tab already fetches — no backend changes, no new data collection.
- **Auto-refreshing GPS tracking** — new `delivering` status (between `confirmed` and `done`) in both `dispatch.html` and the admin Dispatch view. Tapping "🚚 Start Delivery" sets status to `delivering`, which starts a 60-second `getCurrentPosition()` interval that auto-posts to the same `update_driver_location` action the old one-shot button used. Pauses on `visibilitychange` (tab hidden/screen off) and resumes when the tab is foregrounded again — deliberately foreground-only, not true background tracking (no OS-level permission for that in a PWA). Stops when marked `done`. The manual "📍 Share Location" button is unchanged and still works as a fallback at any time. Auto-tracking also self-resumes on page reload if a booking is already `delivering`.

## Drawn e-signature (waiver + reusable for future agreements) — DONE 2026-07-15

In `Code.gs`, `index.html`, `admin.html` — pushed and live as of 2026-07-19 (clasp deploy @24).

- **Guest booking flow (`index.html`)** — the waiver step's signature capture is now a canvas signature pad (`mountSignaturePad()`), drawn with finger/stylus/mouse via pointer events, with a Clear button. It's the default/primary path; a "Prefer to type your name instead?" link swaps to the original typed-name input (kept as the accessibility/no-touch fallback, unchanged behavior otherwise). Booking submit is blocked until the waiver checkbox is ticked **and** either the pad has ink or the typed name is ≥3 characters — canvas/touch being unavailable never blocks a booking. `mountSignaturePad(canvas, opts)` is a standalone function (mount point + `onChange` callback, returns `{clear, isEmpty, getBase64}`) — reusable for a future damage addendum or group liability form without rewriting canvas logic.
- **Backend storage (`Code.gs`)** — new `_saveSignature()` mirrors `_saveIdPhoto()` (same base64-decode → Drive blob → return URL pattern, same "never blocks the booking on failure" posture) into a new **"Aquatic Paradise Signatures"** Drive folder, capped at `MAX_SIGNATURE_BASE64_LEN` (~1.1MB decoded — signatures compress fine small, so this cap is far below the ID-photo one). New `signatureUrl` field appended to the end of `FIELDS` (self-healing migration, same pattern as `staffId`/deposit columns). Judgment call: **kept private like ID photos, not public like staff photos** — a signature is guest PII, same trust model as an ID photo, so no `setSharing()` call; a new token-gated `getSignature` action (POST-only, mirrors `getIdPhoto`) is the only way to view it.
- **Admin viewing (`admin.html`)** — "✍️ View Signature" button next to "🪪 View ID" on both the Bookings tab cards and the Customers tab (shows the guest's most recent signature across bookings). Shares the same fetch-and-overlay code as ID photos (`_viewPhotoOverlay()`, refactored out of the old `viewIdPhoto()` so both actions share one implementation).
- **Validation (`Code.gs`)** — `signatureBase64`/`signatureMimeType` validated the same way as `idPhotoBase64`/`idPhotoMimeType` (type, size cap, mime allowlist) in `_validateBookingPayload`.
- Typed-name waiver acceptance (`waiverAccepted` boolean + `waiverTimestamp`) is unchanged — the drawn signature is additive, not a replacement of that existing required field.

### Post-build code review fixes — 2026-07-16

A review pass before deploy caught and fixed:
- **Critical:** `saveBooking`'s signature write located the row via `sh.getLastRow()`, which a concurrent booking submission (no `LockService` in this file) could shift — misattaching one guest's signature to another guest's row. Fixed to locate the row by matching `ref`, same pattern as `assignBookingStaff`/`markDepositReceived`.
- **High:** `getCommissionReport`'s end-date parsing round-tripped through `new Date('YYYY-MM-DD')` (parses as UTC), then read back date components in local time — in AST (UTC-4) this silently excluded the actual selected end date from every report. Fixed with a local-date parser (`_parseLocalDateInput`).
- **Medium:** `markDepositReceived` accepted a blank amount as a valid $0 "received" deposit, and had no guard against silently overwriting an already-recorded deposit. Fixed: amount must be `> 0`, and overwriting a `received` deposit now requires an explicit confirm (admin gets a confirmation prompt showing the existing amount).
- **Low-medium:** the signature pad counted a single stray tap as "signed." Fixed with a minimum cumulative stroke-length threshold (24px) before a mark counts as ink.

## Offline queue for guest/driver writes — DONE 2026-07-16

Pushed and live as of 2026-07-19 (clasp deploy @24), in `offline-queue.js` (new), `sw.js`, `index.html`, `feedback.html`, `dispatch.html`.

- **The problem:** `sw.js` already intercepts every `script.google.com` request and, on a real network failure, resolves with a synthetic `{ ok:false, error:'Offline' }` Response instead of letting the fetch reject — so a plain `fetch()` never throws when truly offline, it just quietly reports a fake failure. Guest bookings, guest feedback, and driver GPS pings submitted with no signal (a driver at a beach with no bars, a guest on the boat) were being silently dropped.
- **`offline-queue.js`** — new shared module (`<script src="offline-queue.js">` on `index.html`, `feedback.html`, `dispatch.html`), IndexedDB-backed (not localStorage — payloads carry base64 photos/signatures too large/slow for it). Exposes `AQPQueue.queueOrSend(url, bodyObj, opts)`: tries a real fetch first; only queues on an actual connectivity failure (a thrown network error, or sw.js's synthetic offline marker specifically) — a real HTTP/validation error from the backend is returned as-is and never queued. Drains automatically on the `online` event and every 30s while the tab is open, with an in-flight guard (`draining` flag) so two drains can't run concurrently, and breaks out of a drain cycle on the first real network failure instead of hammering every queued item. `opts.dedupeKey` replaces any earlier queued entry with the same key — used by GPS pings so only the latest position per booking ref survives a stack of offline retries. A small "⏳ N pending sync" badge auto-mounts bottom-left on any page that loads the module.
- **`sw.js`** — bumped to v7 (added `offline-queue.js` to the precached `ASSETS` list) and gained a `self.addEventListener('sync', ...)` handler (`aqp-sync` tag) as a best-effort extra drain trigger for browsers with the Background Sync API (mainly Android Chrome). Duplicates the drain logic against the same IndexedDB store since a service worker can't import a page-context script — deliberately not the primary mechanism, since the page's own `online` listener + 30s interval is the reliable cross-browser path.
- **Guest booking (`index.html`)** — `submitBooking()`'s existing GET-first fast path is unchanged for the success case (zero added latency); its failure handling now routes through `AQPQueue` instead of the old `localStorage`-based `apr_queue` (which dropped photos/signatures to stay small and had no periodic retry). Also fixes a real bug this surfaced: the old code's GET path checked `data.ok === true` but had no branch for the sw.js synthetic offline marker, so it fell straight to "Something went wrong" instead of queuing. A one-time migration on page load moves anything still sitting in the old `localStorage` queue into the new one. `refNum` is generated once before the first attempt and reused verbatim on every retry (used as the queue's `dedupeKey` too), which is what makes `saveBooking`'s existing ref-based duplicate check in `Code.gs` (`refIdx` loop, returns `{ok:true, duplicate:true}` without re-inserting) a valid safety net for a retried submission.
- **Guest feedback (`feedback.html`)** — `submit_feedback` now goes through `AQPQueue.queueOrSend`; a queued submission shows the same success screen but with "Saved — will send once you're back online" instead of the normal thank-you text.
- **Driver GPS (`dispatch.html`)** — both the 60-second auto-tracking ping (`shareLocationSilent`) and the manual "📍 Share Location" button (`shareLocation`) now go through `AQPQueue.queueOrSend` with `dedupeKey: 'gps:'+ref`, so several stacked offline pings collapse to just the latest position. Manual share shows "Saved — will send once you're back online" when queued instead of the normal "Location shared" toast.
- **Not wired (time-prioritized):** admin.html's `markDepositReceived`/`assignBookingStaff` writes still use raw fetch — read-only admin actions (`getBookings`, `getStaff`, `getCommissionReport`, etc.) are correctly never queued, and the highest-value write paths (booking, feedback, GPS) were prioritized per the brief. `assignBookingStaff`/commission-adjacent code was also deliberately left untouched to avoid overlapping a concurrent commission bug-fix pass on `admin.html`/`Code.gs`.
- ⚠️ **Owner: recommended manual test** — open the booking page or dispatch console, open DevTools → Network → set throttling to "Offline", submit a booking/feedback/GPS ping, confirm the "will send once you're back online" toast and the pending-count badge appear, then switch throttling back to "Online" (or "No throttling") and confirm it drains within ~30 seconds and the badge clears. A real airplane-mode test on a phone is the closest thing to the actual beach scenario this was built for.

## Automation agents (Claude scheduled tasks) — SET UP 2026-07-09

Run while the Claude desktop app is open (queued to next launch otherwise):
- **weekly-repo-health-check** — Mondays 7:32 AM: OneDrive duplicates, unpushed work, gitignore integrity, security scan of the week's commits, backend ping. Report-only.
- **weekly-feedback-digest** — Fridays 8:05 AM: pulls week's reviews, drafts WhatsApp replies for low ratings, drafts Google-review asks for 5-star reviews. Draft-only, never sends.

## Security — DONE

- XSS fixes (booking ref, earlier CORS/XSS gaps), fail-safe auth, validation, idempotency, rate limiting, health check
- Server-side PIN verification (hashed, changeable in-app; no PINs in code or docs)
- `ACCESS-AND-RECOVERY.md` and `.claude/` gitignored; HTTPS enforced site-wide
- **Bitwarden installed on the PC (2026-07-09)** — ⚠️ account/master password still to be created; credentials still to be moved out of any docx/notes files
- Known gaps (accepted): `APP_TOKEN`/`STAFF_TOKEN` plaintext in code (Apps Script model), no Netlify MFA, no automated tests

## Docs

- `OPERATIONS.md` — architecture/build/timings reference + growth ideas
- `WHATSAPP-AUTOREPLY.md` (added 2026-07-09) — paste-ready WhatsApp Business setup: greeting, away message, 5 quick replies, business profile. ⚠️ Phone-side setup not yet done
- `ACCESS-AND-RECOVERY.md` — local only, never committed

## Marketing / channels — status

- Booking link for bios/buttons/signs: **https://aquaticparadiserental.vacations** (say-able out loud)
- ⚠️ To do (owner): Instagram bio link + Facebook "Book Now" button; link FB↔IG in Meta Business Suite (free) + its DM auto-replies; check existing QR code PDF still points somewhere valid (old link redirects, so reprint optional)
- Decision made: no social media links on the booking page (don't give high-intent visitors an exit)

## Not built yet / parked

- True background GPS tracking (current auto-refresh, added 2026-07-15, is foreground-only — screen must stay on; a real background tracker needs OS-level permissions a PWA doesn't have)
- Safe-zones water map (explored 2026-07-09, parked by owner)
- Online payment gateway (deposits are tracked manually as of 2026-07-15 — BOSVG bank transfer + admin marks received; no Stripe/gateway integration, deliberately rejected in favor of manual tracking)
- Automated commission payout (Commission tab, added 2026-07-15, is a read-only report — no payroll/payout automation)

## Owner's open action list

1. **Tap "Turn On Weather Checks"** — admin → ⚙️ Settings → Weather card (30 seconds; enables server-side wind alerts by email/WhatsApp)
2. Rename the STAFF sheet entry: admin → 👥 Team → delete "Operations Manager", add "Delroy" (+ photo if you like)
3. WhatsApp Business setup on the phone (follow `WHATSAPP-AUTOREPLY.md`, ~15 min)
4. Bitwarden: create account + master password; move credentials out of any docx; then delete those files
5. Instagram bio + Facebook Book Now button → new domain; Meta Business Suite linking
6. Confirm gear guide PSI/valve steps match the actual boards
7. April 2027: domain renewal decision ($48.99 auto-renew vs transfer)
