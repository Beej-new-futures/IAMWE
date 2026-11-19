// Shared helpers for the ticketing functions.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

export function fail(message, status = 400) {
  return json({ ok: false, error: message }, status);
}

export async function readJson(request) {
  try { return await request.json(); } catch { return null; }
}

export const nowIso = () => new Date().toISOString();

// No 0/O, 1/I/L — codes get read out loud at a door in the dark.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function randomFrom(alphabet, length) {
  const out = [];
  const bytes = new Uint8Array(length * 2);
  crypto.getRandomValues(bytes);
  // Rejection sampling so every character is equally likely.
  const limit = 256 - (256 % alphabet.length);
  let i = 0;
  while (out.length < length) {
    if (i >= bytes.length) { crypto.getRandomValues(bytes); i = 0; }
    const b = bytes[i++];
    if (b < limit) out.push(alphabet[b % alphabet.length]);
  }
  return out.join('');
}

export const ticketCode = () => `${randomFrom(ALPHABET, 4)}-${randomFrom(ALPHABET, 4)}`;
export const orderToken = () => randomFrom('abcdefghijkmnpqrstuvwxyz23456789', 24);

export function normaliseCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return s.length === 8 ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

export function validEmail(email) {
  return typeof email === 'string' && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Constant-time-ish comparison for the door PIN.
export function safeEqual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export async function soldCount(db, slug) {
  const row = await db.prepare(
    "SELECT COALESCE(SUM(qty), 0) AS n FROM orders WHERE slug = ? AND status = 'paid'"
  ).bind(slug).first();
  return row ? Number(row.n) : 0;
}

export function salesOpen(event) {
  return !event.salesEnd || Date.now() < Date.parse(event.salesEnd);
}

export function siteUrl(env, request) {
  return (env.SITE_URL || new URL(request.url).origin).replace(/\/$/, '');
}
