# Laptop to-do (saved 2026-11-11)

Do these on the PC, in order. Each one says how long it takes.

## 1. Check the chat wording is live (2 min)
- Open https://aquaticparadiserental.vacations on your phone, open the chat.
- Top line should say **Team available · usually replies in minutes** (8 AM–6 PM)
  or **Team offline · back at 8 AM** (after hours). Already pushed 2026-11-11.

## 2. Turn on the "Team busy" switch (15 min)
The code is ready on the branch **`laptop/busy-switch`** — not live yet.
It adds a **💬 Chat** row in dispatch → Equipment & Services. Tap **Turn Off** =
guests see **Team busy · replies may take a little longer**. Tap **Make Available** = back to normal.

The backend must go first, or the new button will error.

```
cd <your aquaticparadiserentals-web folder>
git fetch origin
git checkout laptop/busy-switch
clasp push
clasp deploy -i AKfycbzr1KHela518-pgQ3dJyvv77tm9z2JWo_TTovRNys6RwYNBIUfdyJKxGF_ETzNk9m47Ww
```
**Always use `-i` with that exact ID.** Without it you get a new URL and the whole site breaks.

Then put the pages live:
```
git checkout main
git merge laptop/busy-switch
git push origin main
```
Test: dispatch → Chat → Turn Off → open the booking-page chat → should say "Team busy". Then Make Available.

If clasp isn't set up on the laptop: `npm install -g @google/clasp`, then `clasp login`
(sign in as delroystapleton908@gmail.com). See OPERATIONS.md §6.

## 3. Decide: one system for the business (think, then tell Claude)
You run two systems that overlap:
- **Main site** — aquaticparadiserental.vacations (GitHub Pages + Google Sheets). Customers book here.
- **Render platform** — aquatic-platform.onrender.com (real database, logins, WiPay, Lite dashboard).

Before building the "Ops Center" prompt, pick which one runs bookings, cash and drivers.
Then ask Claude: **"run the Phase 1 audit on both systems"** (read-only, changes nothing).
Add both systems to the Ops Center prompt, and delete its line "do not make the Site public".

## 4. Costs check (2 min)
dashboard.render.com → Billing. Expect about US$7.25/month (Starter + 1 GB disk).
If AI features are used: check the Anthropic console for API usage.

## Still open from before (see PROGRESS.md → Owner's open action list)
Weather checks button, Team sheet rename, WhatsApp Business setup, Bitwarden,
Instagram/Facebook links, partner hotels in apr-config.js.
