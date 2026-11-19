# IAMWE Tickets

Event ticket pages on iamwe.uk: a scroll-through film, a buy card at the end,
PayPal/card checkout, a unique QR ticket per person emailed straight away,
every buyer's email saved, and a door page to scan people in.

| URL | What it is |
|---|---|
| `iamwe.uk/tickets/xmas-party/` | The event page — share this one |
| `iamwe.uk/tickets/view/?o=…` | A buyer's tickets (linked from their email) |
| `iamwe.uk/tickets/door/` | Door check-in + buyer/mailing-list download (PIN) |

## What's where

```
functions/                       ← runs on Cloudflare (Pages Functions), not in the browser
  _lib/events.js                 ← EVENT DETAILS, PRICES, CAPACITY — edit this
  _lib/paypal.js                 ← PayPal checkout
  _lib/email.js                  ← the ticket email (Resend)
  api/tickets/[[path]].js        ← all the /api/tickets/* endpoints
public/tickets/xmas-party/       ← the event page + its film/still
public/tickets/view/             ← ticket page
public/tickets/door/             ← door page
public/tickets-kit/              ← shared CSS/JS (+ QR libraries)
schema/tickets.sql               ← database tables
```

These live in `public/` rather than beside `work/` and `treatments/`, so Vite
copies them as they are and `vite.config.js` doesn't need touching.

## One-off setup (about 30 minutes)

### 1. PayPal: get API keys
1. Go to developer.paypal.com and log in with the IAMWE PayPal **business** account.
2. Open Apps & Credentials, select **Sandbox**, then Create App. Copy the **Client ID** and **Secret**.
   Sandbox uses fake money, so test with this first.
3. When you're ready to go live, switch the toggle to **Live** and create another app.
   Its Client ID and Secret replace the sandbox ones.

Buyers can pay with PayPal or with a debit/credit card without a PayPal
account. The card option usually shows for UK buyers, but whether it does
depends on PayPal and the account.

### 2. Resend: sends the ticket emails
1. Sign up at resend.com (the free tier is plenty for an event this size).
2. Under Domains, add `iamwe.uk`. It gives you a few DNS records. Add them in
   Cloudflare → iamwe.uk → DNS, then wait for Resend to show the domain as verified.
3. Under API Keys, create a key and copy it.

### 3. Cloudflare: database and settings
1. Go to Workers & Pages → **D1** → Create database, and name it `iamwe-tickets`.
2. Open its **Console** tab, paste all of `schema/tickets.sql` and run it.
3. Go to Workers & Pages → the iamwe Pages project → Settings → **Bindings** → Add → D1 database.
   Set the variable name to **`DB`** and the database to `iamwe-tickets`. Add it for Production (and Preview if you use preview URLs).
4. In Settings → **Variables and Secrets**, add these to Production. Use type **Secret** for the starred ones:

| Name | Value |
|---|---|
| `PAYPAL_ENV` | `sandbox` to test, then `live` |
| `PAYPAL_CLIENT_ID` | from step 1 |
| `PAYPAL_SECRET` * | from step 1 |
| `RESEND_API_KEY` * | from step 2 |
| `TICKETS_FROM` | `IAMWE <tickets@iamwe.uk>` |
| `TICKETS_REPLY_TO` | your email, so replies to a ticket email reach you |
| `DOOR_PIN` * | any PIN for the door page |
| `SITE_URL` | `https://iamwe.uk` |
| `TICKETS_BCC` | optional: get a copy of every ticket email |

5. Commit and push in GitHub Desktop as usual. Cloudflare picks up `functions/`
   automatically. Settings changes only take effect on the **next deploy**.

### 4. Test before you share it
With `PAYPAL_ENV=sandbox`, buy a ticket using a sandbox buyer account
(developer.paypal.com → Sandbox accounts). Check that the email arrives,
open the ticket, and scan it on `/tickets/door/`. Then switch to `live` with
the live keys, redeploy, and buy one real £20 ticket yourself as a final check.

Test orders end up in the database. To clear them before launch, run this in the D1 Console:
`DELETE FROM tickets; DELETE FROM orders;`

## The film

The film plays as people scroll, like the old Lottie pages. Put it at
`public/tickets/xmas-party/scroll.mp4`, with a still frame at `still.jpg`
(shown while the film loads, and used as the link preview image).

Scrubbing is only smooth if **every frame is a keyframe**. A normal export
stutters, so run your export through this first:

```bash
ffmpeg -i your_export.mov -vf "scale=1280:-2,fps=30" -c:v libx264 -g 1 -crf 26 \
  -preset veryfast -pix_fmt yuv420p -movflags +faststart -an scroll.mp4
```

- Keep it to about **6–12 seconds**. Scroll length sets the pacing, not the
  film's length, so a short film still covers the whole page.
- **Cloudflare Pages won't deploy a file over 25 MB.** All-keyframe files are
  big. If yours is over, drop to `scale=960:-2`, raise the CRF to 28–30, or shorten it.
- To make the scroll longer or shorter, change `--film-length: 520vh` in the page.
- With no film, the still slowly pushes in as people scroll. With neither,
  the page shows a moving colour wash.

The text chapters over the film are in `public/tickets/xmas-party/index.html`.
Each one shows between its `data-from` and `data-to` points (0 = start, 1 = end).

## Changing prices and details

Everything is in `functions/_lib/events.js`: name, date, time, venue,
capacity, max tickets per order, when sales close, and price tiers.
The early bird runs until `quantity` tickets have sold in total, then the next
tier starts on its own. The server always charges the price set in this file,
never the one shown in the browser.

**Still to fill in:** start/end time, how many early birds (currently 40),
and the standard price (currently £25, a placeholder).

## On the night

Open `iamwe.uk/tickets/door/` on a phone and enter the PIN. Tap **Start
camera** to scan QR codes, or type a code in by hand. You'll see:
green = in, amber = already used, red = not valid. Several phones can check
people in at once.

## The email list

On the door page, **Download buyers (CSV)** gives every buyer.
**Mailing list only** gives just the people who ticked "tell me about future
events". Only email the second list with news about future events.

## Testing locally

```bash
npm run build
printf 'PAYPAL_ENV=mock\nMOCK_ALLOWED=1\nDOOR_PIN=1234\n' > .dev.vars
npx wrangler d1 execute iamwe-tickets --local --file=schema/tickets.sql   # needs a wrangler.toml with the D1 binding
npx wrangler pages dev dist
```

`mock` mode replaces PayPal with a "test mode" button, and emails are printed
to the terminal instead of sent. It only works when `MOCK_ALLOWED` is set,
so it can never switch on in production by accident. Don't commit `.dev.vars`.
