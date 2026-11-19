// ─── Events on sale ──────────────────────────────────────────────────────
// The one place an event's price, capacity and on-sale window live. The
// server reads price from HERE, never from the page — so nobody can edit
// the page in their browser and buy a £20 ticket for 1p.
//
// To add an event:
//   1. add an entry below (the key is the slug, and becomes the URL:
//      iamwe.uk/tickets/<slug>/)
//   2. copy public/tickets/xmas-party/ to public/tickets/<slug>/, set
//      data-event="<slug>" on its <body>, then swap in the film + copy
//
// Prices are in pence: 2000 = £20.00.
//
// Tiers run in order. A tier is on sale until `quantity` tickets have
// sold in total (counting earlier tiers) or until `until` passes —
// whichever comes first. Leave both off the last tier. A whole order is
// charged at whichever tier is on sale when it's placed.

export const EVENTS = {
  'xmas-party': {
    name: 'IAMWE Xmas Party',
    dateLabel: 'Friday 18 December 2026',
    timeLabel: '',                        // TODO e.g. '7pm – 1am'
    venue: 'Communa, Frome',
    currency: 'GBP',
    capacity: 200,
    maxPerOrder: 6,
    tiers: [
      { label: 'Early bird', pricePence: 2000, quantity: 40 },   // TODO: how many early birds (or an `until` date)
      { label: 'Standard', pricePence: 2500 },                    // TODO: full price
    ],
    // Sales stop at this moment (Z = UTC, which is UK time in winter).
    // null keeps selling until sold out.
    salesEnd: '2026-12-18T18:00:00Z',
    ticketNote: 'Show the QR code at the door — one code per person.',
  },
};

export function getEvent(slug) {
  return Object.prototype.hasOwnProperty.call(EVENTS, slug) ? EVENTS[slug] : null;
}

// The tier on sale right now, given how many have already sold.
export function currentTier(event, sold, now = Date.now()) {
  for (const t of event.tiers) {
    if (t.quantity != null && sold >= t.quantity) continue;
    if (t.until && now >= Date.parse(t.until)) continue;
    return t;
  }
  return event.tiers[event.tiers.length - 1];
}

export function poundsString(pence) {
  return (pence / 100).toFixed(2);
}
