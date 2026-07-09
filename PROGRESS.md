# Aquatic Paradise Rentals — Build Progress

**Last updated:** 2026-07-09 (full audit — every item below verified live on this date)
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

- Live/continuous GPS tracking (only if share-link model proves insufficient)
- Feedback analytics beyond average rating
- Safe-zones water map (explored 2026-07-09, parked by owner)
- Payments/deposits online, staff commission tracking

## Owner's open action list

1. WhatsApp Business setup on the phone (follow `WHATSAPP-AUTOREPLY.md`, ~15 min)
2. Bitwarden: create account + master password; move credentials out of any docx; then delete those files
3. Instagram bio + Facebook Book Now button → new domain; Meta Business Suite linking
4. Confirm gear guide PSI/valve steps match the actual boards
5. April 2027: domain renewal decision ($48.99 auto-renew vs transfer)
