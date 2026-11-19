// /api/tickets/* — every ticketing endpoint, routed from one file.
//
//   GET  /api/tickets/config               PayPal client id for the page
//   GET  /api/tickets/event/<slug>         price, tickets left, on sale?
//   POST /api/tickets/create-order         { slug, qty, name, email, optIn } → { paypalOrderId }
//   POST /api/tickets/capture              { paypalOrderId } → { token }
//   GET  /api/tickets/order/<token>        the buyer's tickets
//   GET  /api/tickets/qr?o=<token>&c=<code>  QR image (GIF — renders in email)
//   POST /api/tickets/checkin              { pin, code } — door
//   GET  /api/tickets/stats?slug=&pin=     sold / checked in — door
//   GET  /api/tickets/export?slug=&pin=    CSV of buyers (the mailing list)
//
// Bindings (Cloudflare Pages → Settings): DB (D1). Secrets/vars: see
// TICKETS.md.

import { getEvent, currentTier, poundsString } from '../../_lib/events.js';
import {
  json, fail, readJson, nowIso, ticketCode, orderToken, normaliseCode,
  validEmail, safeEqual, soldCount, salesOpen, siteUrl,
} from '../../_lib/util.js';
import { paypalMode, createPaypalOrder, capturePaypalOrder } from '../../_lib/paypal.js';
import { sendTicketEmail } from '../../_lib/email.js';
import qrcode from '../../_lib/qrcode.mjs';

export async function onRequest(context) {
  const { request, env, params } = context;
  const parts = Array.isArray(params.path) ? params.path : [params.path].filter(Boolean);
  const [route, arg] = parts;
  const method = request.method;

  if (!env.DB) return fail('Ticketing database not connected (DB binding missing)', 500);

  try {
    if (method === 'GET' && route === 'config') return config(env);
    if (method === 'GET' && route === 'event') return eventInfo(env, arg);
    if (method === 'POST' && route === 'create-order') return createOrder(env, request);
    if (method === 'POST' && route === 'capture') return capture(env, request);
    if (method === 'GET' && route === 'order') return orderInfo(env, arg);
    if (method === 'GET' && route === 'qr') return qr(env, request);
    if (method === 'POST' && route === 'checkin') return checkin(env, request);
    if (method === 'GET' && route === 'stats') return stats(env, request);
    if (method === 'GET' && route === 'export') return exportCsv(env, request);
    return fail('Not found', 404);
  } catch (err) {
    console.log('tickets error', err && err.stack || err);
    return fail(err.message || 'Something went wrong', 500);
  }
}

// ─── Public ─────────────────────────────────────────────────────────────

function config(env) {
  const mode = paypalMode(env);
  return json({ ok: true, mode, paypalClientId: mode === 'mock' ? null : env.PAYPAL_CLIENT_ID });
}

async function eventInfo(env, slug) {
  const event = getEvent(slug);
  if (!event) return fail('No such event', 404);
  const sold = await soldCount(env.DB, slug);
  const left = Math.max(0, event.capacity - sold);
  const tier = currentTier(event, sold);
  const next = event.tiers[event.tiers.indexOf(tier) + 1];
  return json({
    ok: true,
    slug,
    name: event.name,
    dateLabel: event.dateLabel,
    timeLabel: event.timeLabel,
    venue: event.venue,
    tier: tier.label,
    price: poundsString(tier.pricePence),
    pricePence: tier.pricePence,
    nextTier: next ? { label: next.label, price: poundsString(next.pricePence) } : null,
    currency: event.currency,
    maxPerOrder: Math.min(event.maxPerOrder, left),
    left,
    onSale: salesOpen(event) && left > 0,
    soldOut: left === 0,
    closed: !salesOpen(event),
  });
}

async function createOrder(env, request) {
  const body = await readJson(request);
  if (!body) return fail('Bad request');
  const slug = String(body.slug || '');
  const event = getEvent(slug);
  if (!event) return fail('No such event', 404);
  if (!salesOpen(event)) return fail('Sales for this event have closed');

  const name = String(body.name || '').trim().slice(0, 120);
  const email = String(body.email || '').trim().toLowerCase();
  const qty = Number.parseInt(body.qty, 10);
  if (!name) return fail('Please add your name');
  if (!validEmail(email)) return fail('Please check your email address');
  if (!Number.isInteger(qty) || qty < 1 || qty > event.maxPerOrder) return fail('Pick between 1 and ' + event.maxPerOrder + ' tickets');

  const sold = await soldCount(env.DB, slug);
  const left = event.capacity - sold;
  if (left <= 0) return fail('Sold out');
  if (qty > left) return fail(`Only ${left} left`);

  // Charge what the page showed. If the tier moved on between the buyer
  // loading the page and pressing pay, tell them rather than surprise them.
  const tier = currentTier(event, sold);
  if (body.expectPence != null && Number(body.expectPence) !== tier.pricePence) {
    return json({ ok: false, error: `${tier.label} tickets are now £${poundsString(tier.pricePence)} each`, priceChanged: true, pricePence: tier.pricePence }, 409);
  }

  const id = orderToken();
  const amountPence = tier.pricePence * qty;
  const pp = await createPaypalOrder(env, {
    orderId: id, event, slug, qty,
    value: poundsString(amountPence),
    unitValue: poundsString(tier.pricePence),
  });

  await env.DB.prepare(
    `INSERT INTO orders (id, slug, paypal_order_id, status, name, email, qty, amount_pence, currency, marketing_opt_in, created_at)
     VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, slug, pp.id, name, email, qty, amountPence, event.currency, body.optIn ? 1 : 0, nowIso()).run();

  return json({ ok: true, paypalOrderId: pp.id });
}

async function capture(env, request) {
  const body = await readJson(request);
  const ppId = body && String(body.paypalOrderId || '');
  if (!ppId) return fail('Bad request');

  const order = await env.DB.prepare('SELECT * FROM orders WHERE paypal_order_id = ?').bind(ppId).first();
  if (!order) return fail('Order not found', 404);
  if (order.status === 'paid') return json({ ok: true, token: order.id });

  const event = getEvent(order.slug);
  if (!event) return fail('No such event', 404);

  // Last check before money moves. If this fails the PayPal order is
  // simply never captured — the buyer isn't charged.
  const left = event.capacity - (await soldCount(env.DB, order.slug));
  if (order.qty > left) return fail(left > 0 ? `Sorry — only ${left} left now` : 'Sorry — it just sold out', 409);

  const expected = { value: poundsString(order.amount_pence), currency: order.currency };
  let result;
  try {
    result = await capturePaypalOrder(env, ppId, expected);
  } catch (err) {
    if (err.issue === 'ORDER_ALREADY_CAPTURED') {
      const again = await env.DB.prepare('SELECT id, status FROM orders WHERE id = ?').bind(order.id).first();
      if (again && again.status === 'paid') return json({ ok: true, token: again.id });
    }
    if (err.issue === 'INSTRUMENT_DECLINED') return fail('Your payment was declined — try another card or account', 402);
    throw err;
  }
  if (!result.ok) return fail('Payment did not complete', 402);
  if (result.value !== expected.value || result.currency !== expected.currency) {
    console.log('AMOUNT MISMATCH', order.id, result, expected);
    return fail('Payment amount did not match — please contact us', 409);
  }

  // Flip to paid exactly once, even if capture is called twice at the
  // same moment; only the call that flips it issues tickets.
  const flip = await env.DB.prepare(
    "UPDATE orders SET status = 'paid', paid_at = ? WHERE id = ? AND status = 'pending'"
  ).bind(nowIso(), order.id).run();
  if (!flip.meta || flip.meta.changes !== 1) return json({ ok: true, token: order.id });

  const codes = [];
  const created = nowIso();
  for (let i = 0; i < order.qty; i++) codes.push(ticketCode());
  await env.DB.batch(codes.map((c) =>
    env.DB.prepare('INSERT INTO tickets (code, order_id, slug, created_at) VALUES (?, ?, ?, ?)').bind(c, order.id, order.slug, created)
  ));

  const base = siteUrl(env, request);
  const sent = await sendTicketEmail(env, {
    to: order.email,
    name: order.name,
    event,
    codes,
    ticketUrl: `${base}/tickets/view/?o=${order.id}`,
    qrUrl: (c) => `${base}/api/tickets/qr?o=${order.id}&c=${encodeURIComponent(c)}`,
  });
  if (sent.ok && !sent.skipped) await env.DB.prepare('UPDATE orders SET email_sent = 1 WHERE id = ?').bind(order.id).run();

  return json({ ok: true, token: order.id });
}

async function orderInfo(env, token) {
  if (!token) return fail('Not found', 404);
  const order = await env.DB.prepare("SELECT * FROM orders WHERE id = ? AND status = 'paid'").bind(token).first();
  if (!order) return fail('Not found', 404);
  const event = getEvent(order.slug) || { name: order.slug };
  const { results } = await env.DB.prepare('SELECT code, checked_in_at FROM tickets WHERE order_id = ? ORDER BY rowid').bind(token).all();
  return json({
    ok: true,
    name: order.name,
    email: order.email,
    event: { slug: order.slug, name: event.name, dateLabel: event.dateLabel, timeLabel: event.timeLabel, venue: event.venue, ticketNote: event.ticketNote },
    tickets: results.map((t) => ({ code: t.code, used: !!t.checked_in_at })),
    emailSent: !!order.email_sent,
  });
}

async function qr(env, request) {
  const url = new URL(request.url);
  const token = url.searchParams.get('o');
  const code = normaliseCode(url.searchParams.get('c'));
  if (!token || !code) return fail('Not found', 404);
  const row = await env.DB.prepare('SELECT code FROM tickets WHERE code = ? AND order_id = ?').bind(code, token).first();
  if (!row) return fail('Not found', 404);

  const q = qrcode(0, 'M');
  q.addData(code);
  q.make();
  const dataUrl = q.createDataURL(8, 2);          // GIF — the one image format every mail client shows
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Response(bytes, { headers: { 'content-type': 'image/gif', 'cache-control': 'private, max-age=31536000, immutable' } });
}

// ─── Door (PIN protected) ───────────────────────────────────────────────

function doorOk(env, pin) {
  return !!env.DOOR_PIN && safeEqual(pin, env.DOOR_PIN);
}

async function checkin(env, request) {
  const body = await readJson(request);
  if (!body || !doorOk(env, body.pin)) return fail('Wrong PIN', 401);
  const code = normaliseCode(body.code);
  if (!code) return json({ ok: true, result: 'invalid', message: 'Not a ticket code' });

  const t = await env.DB.prepare(
    `SELECT t.code, t.slug, t.checked_in_at, o.name, o.qty FROM tickets t JOIN orders o ON o.id = t.order_id WHERE t.code = ?`
  ).bind(code).first();
  if (!t) return json({ ok: true, result: 'invalid', code, message: 'No ticket with this code' });
  if (body.slug && t.slug !== body.slug) {
    return json({ ok: true, result: 'wrong-event', code, name: t.name, message: `Ticket is for ${t.slug}` });
  }
  if (t.checked_in_at) {
    return json({ ok: true, result: 'used', code, name: t.name, at: t.checked_in_at, message: 'Already checked in' });
  }
  const upd = await env.DB.prepare('UPDATE tickets SET checked_in_at = ? WHERE code = ? AND checked_in_at IS NULL').bind(nowIso(), code).run();
  if (!upd.meta || upd.meta.changes !== 1) return json({ ok: true, result: 'used', code, name: t.name, message: 'Already checked in' });
  return json({ ok: true, result: 'admitted', code, name: t.name, partySize: t.qty });
}

async function stats(env, request) {
  const url = new URL(request.url);
  if (!doorOk(env, url.searchParams.get('pin'))) return fail('Wrong PIN', 401);
  const slug = url.searchParams.get('slug');
  const event = getEvent(slug);
  if (!event) return fail('No such event', 404);
  const sold = await soldCount(env.DB, slug);
  const ci = await env.DB.prepare('SELECT COUNT(*) AS n FROM tickets WHERE slug = ? AND checked_in_at IS NOT NULL').bind(slug).first();
  return json({ ok: true, name: event.name, sold, capacity: event.capacity, checkedIn: Number(ci?.n || 0) });
}

async function exportCsv(env, request) {
  const url = new URL(request.url);
  if (!doorOk(env, url.searchParams.get('pin'))) return fail('Wrong PIN', 401);
  const slug = url.searchParams.get('slug');
  const optInOnly = url.searchParams.get('optin') === '1';
  let sql = "SELECT slug, name, email, qty, amount_pence, marketing_opt_in, paid_at FROM orders WHERE status = 'paid'";
  const binds = [];
  if (slug) { sql += ' AND slug = ?'; binds.push(slug); }
  if (optInOnly) sql += ' AND marketing_opt_in = 1';
  sql += ' ORDER BY paid_at';
  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@]/.test(s)) s = "'" + s;          // stop spreadsheets running a "name" as a formula
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ['event,name,email,tickets,paid_gbp,mailing_list,paid_at'];
  for (const r of results) {
    lines.push([r.slug, r.name, r.email, r.qty, poundsString(r.amount_pence), r.marketing_opt_in ? 'yes' : 'no', r.paid_at].map(cell).join(','));
  }
  return new Response(lines.join('\n') + '\n', {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="iamwe-${slug || 'all'}-buyers.csv"`,
      'cache-control': 'no-store',
    },
  });
}
