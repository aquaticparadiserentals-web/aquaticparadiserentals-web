# Aquatic Paradise Rentals — Build Progress

**Last updated:** 2026-07-09
**Repo:** aquaticparadiserentals-web (GitHub: aquaticparadiserentals-web/aquaticparadiserentals-web, branch `main`)
**Stack:** Google Apps Script (`Code.gs`) + Google Sheets backend · HTML/JS frontend · PWA (`manifest.json`, `sw.js`) · deployed via clasp

Build started 2026-06-20. 50 commits as of this date.

---

## Core platform — DONE

- **Booking app** (`index.html`) — guest booking flow, waiver, offline-capable PWA, brand design pass (Cormorant Garamond + Outfit), Open Graph/social previews
- **Admin dashboard** (`admin.html`) — owner-only, `APP_TOKEN`-gated
- **Rules page** (`rules.html`) — printable rules & regulations
- **Live backend** — Apps Script + Sheets, connected and in production

## Goal #5 features (internal ops platform) — ALL DONE

- **Identity verification** — guest ID photo upload, validated client-side, stored to Google Drive, linked to booking row; hardened storage; driver/staff photos added for guest trust
- **Driver location tracking** — share-link model (deliberate choice, not live GPS): drivers on the `DRIVERS` sheet, dispatch console with "Share Location" button, one-shot geolocation stored in `driverLat`/`driverLng`/`driverLocAt`, Maps link visible in dispatch and admin bookings view
- **Client feedback** — public `feedback.html` (star rating + comment tied to booking ref, `FEEDBACK` sheet), dispatch sends link via WhatsApp on completed bookings, admin Feedback tab with average rating, feedback deletion
- **Mobile access** — PWA, works from mobile browsers

## Staff & ops tooling — DONE

- **Dispatch console** (`dispatch.html`) — PIN-locked staff view with scoped `STAFF_TOKEN` (no pricing visibility); PIN verification is server-side; staff PIN change UI; PIN-reset escalation flow
- **Customers section** — per-guest history, double-booking flag, "regular" badge
- **Fleet tab** — rebuilt on real inventory data, bulk restock, all equipment categories, adult/kid life jackets split, optional voice input
- **Guest help-desk widget** — on the booking site, with staff escalation
- **Automated reports** — daily/weekly business report
- **Weather monitoring** — automated daily conditions check with guest heads-up
- **WhatsApp alerts** — tap-to-send notifications

## Security hardening — DONE

- Stored XSS fixes (booking ref in admin/dispatch, earlier XSS/CORS gaps)
- Fail-safe auth, input validation, idempotency on the notification pipeline
- Rate limiting + health check endpoint
- Server-side PIN verification (token no longer leaks via page source)
- Sensitive access doc (`ACCESS-AND-RECOVERY.md` kept local, gitignored version)

## Docs

- `OPERATIONS.md` — full build/architecture/timings reference, growth ideas tied to business goals
- `ACCESS-AND-RECOVERY.md` — access + recovery procedures

---

## Not built yet / possible next steps

- Live/continuous GPS tracking (only if the share-link model proves insufficient)
- Feedback analytics beyond average rating
- Further admin polish

## Housekeeping

- **6 commits ahead of origin — needs `git push`** (as of 2026-07-09)
- Watch for OneDrive sync-conflict duplicate files (e.g. `Code 6.gs`, `admin 3.html`) creeping into the repo — happened before, cleaned up in `7b157d5`
