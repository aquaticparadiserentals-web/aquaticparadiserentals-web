/* ────────────────────────────────────────────────────────────────────
   Aquatic Paradise Rentals — business settings
   Owner: Delroy Stapleton (internal — not shown on the public site)

   One place for the numbers you might want to change. Edit a value,
   upload this file to GitHub, done — no backend redeploy needed.
   ──────────────────────────────────────────────────────────────────── */
window.APR_CONFIG = {

  // ── DEPOSITS ──────────────────────────────────────────────────────
  // Guests see this deposit amount on the "Booking Received" screen.
  depositPct: 30,        // % of the booking total
  depositMinXCD: 20,     // never ask for less than this (unless the booking costs less)
  xcdPerUsd: 2.7,        // used to show the USD equivalent

  // Card deposits via PayPal — OFF while this is empty.
  // To switch on: put your PayPal.me name here, e.g. 'AquaticParadiseRentals'
  // (from paypal.me/AquaticParadiseRentals). Guests then get a
  // "Pay deposit by card" button with the amount filled in (in USD).
  paypalMe: '',

  // WhatsApp number guests message for bank-transfer details (digits only)
  whatsapp: '17844963447',

  // ── HOTEL & PARTNER REFERRALS ─────────────────────────────────────
  // Each partner gets a link: https://aquaticparadiserental.vacations/?ref=CODE
  // Bookings made through it are tagged "Partner: CODE" automatically.
  // Make links + QR codes in admin → 🤝 Partners.
  // Codes: capital letters, numbers and dashes only.
  // commissionPct is what you pay the partner on COMPLETED bookings.
  partners: {
    // EXAMPLE — copy this line, change it, remove the // at the start:
    // 'SEASIDE-INN': { name: 'Seaside Inn (front desk)', commissionPct: 10 },
  },

  // How long a guest stays credited to a partner after tapping their link
  partnerCreditDays: 30,
};
