# WhatsApp FAQ Auto-Reply Setup

Growth idea #6 from OPERATIONS.md: cut the repetitive pre-booking back-and-forth (pricing, availability, delivery) so staff stay free for gear handoff and safety.

**Approach: the free WhatsApp Business app** on the business phone (+1 784 496-3447). No API, no tokens, no monthly cost, no code — consistent with how the rest of the platform handles WhatsApp (tap-to-send links only). The paid WhatsApp Cloud API chatbot route needs Meta business verification and per-conversation fees; not worth it for 4 FAQs.

**If the number is still on regular WhatsApp:** install "WhatsApp Business" (green icon with a "B") from the app store and migrate the number when prompted. Chat history carries over.

---

## 1. Greeting message (auto-sends to anyone messaging for the first time or after 14 days)

**Settings → Business tools → Greeting message → ON**, paste:

> 🌊 Welcome to Aquatic Paradise Rentals — Bequia!
> Paddle boards, kayaks & snorkel gear on Princess Margaret Beach.
>
> ⚡ Fastest way to book: https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/
>
> Or reply with a word and we'll get right back to you:
> 💰 PRICES · 🕐 HOURS · 🚚 DELIVERY · 📋 BOOKING

## 2. Away message (auto-sends outside business hours)

**Settings → Business tools → Away message → ON → Schedule: Outside of business hours** (set business hours first, step 4), paste:

> Thanks for messaging Aquatic Paradise Rentals! 🌴 We're off the beach right now (open daily 8 AM – 6 PM).
>
> You can book anytime — it takes 2 minutes: https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/
>
> We'll reply as soon as we're back.

## 3. Quick replies (staff types "/" + shortcut, tap, send — one tap answers)

**Settings → Business tools → Quick replies → +** for each:

**Shortcut: `/prices`**
> 💰 Our rates (XCD):
>
> 🏄 Paddle Board — $25/30min · $40/hr · $110 half-day
> 🚣 Kayak Single — $20/30min · $35/hr · $90 half-day
> 🚣 Kayak Double — $30/30min · $50/hr · $130 half-day
> 🤿 Snorkel Set — $15/30min · $25/hr · $60 half-day
> 🏊 Floater — $15/30min · $25/hr
>
> 📦 Packages:
> 💑 Explorer Duo (2 boards + 2 snorkels, 1hr) — $120
> 👨‍👩‍👧‍👦 Family Wave (2 kayaks + 4 snorkels + 2 floaters, 2hr) — $200
> 🏄 Adventure Set (board + kayak + 2 snorkels, 2hr) — $160
> 💑 Couple Explorer (double kayak + 2 snorkels, 2hr) — $130
>
> Full rates & booking: https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/

**Shortcut: `/hours`**
> 🕐 Open daily 8:00 AM – 6:00 PM
> 📍 Princess Margaret Beach & Admiralty Bay, Bequia, SVG
> Come find us on the beach, or book ahead: https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/

**Shortcut: `/delivery`**
> 🚚 Yes, we deliver! Gear can be brought to your villa, yacht, or beach spot around Admiralty Bay. Tell us where you're staying and your preferred time, and we'll confirm.
> Book with delivery details here: https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/

**Shortcut: `/book`**
> 📋 Booking takes about 2 minutes: https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/
> Pick your gear, time, and spot — you'll get a booking reference right away. Full payment at rental start; cancellations within 2 hours of start time may carry a 50% charge.

**Shortcut: `/cancel`**
> ✏️ Need to change or cancel? Send us your booking reference (starts with APR-) and what you'd like to change, and we'll sort it. Note: cancellations within 2 hours of start time may be subject to a 50% charge.

## 4. Business profile (one-time)

**Settings → Business tools → Business profile:**
- Hours: Daily 8:00 AM – 6:00 PM (this powers the away-message schedule)
- Address: Princess Margaret Beach & Admiralty Bay, Bequia, SVG
- Website: https://aquaticparadiserentals-web.github.io/aquaticparadiserentals-web/
- Email: aquaticparadiserentals@gmail.com
- Category: Recreation / Sports & Recreation

---

## Keep it honest

- **Prices in the quick replies are copied from `index.html`'s `GEAR`/`PACKAGES` arrays as of 2026-07-09.** If rates change in the app, update the `/prices` quick reply too — this is the one place content can drift, so it's listed here deliberately.
- Greeting + away messages only auto-send; quick replies still need a human tap. That's the point — zero risk of a bot mis-quoting a guest, and staff answer any question in one tap instead of typing.
