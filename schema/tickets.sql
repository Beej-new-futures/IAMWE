-- Ticketing tables for Cloudflare D1.
-- Run once against the database bound as DB:
--   npx wrangler d1 execute iamwe-tickets --remote --file=schema/tickets.sql

-- One row per checkout. This is also the mailing list: email, name and
-- whether they ticked the "keep me posted" box.
CREATE TABLE IF NOT EXISTS orders (
  id               TEXT PRIMARY KEY,          -- long random token, used in the ticket link
  slug             TEXT NOT NULL,             -- which event
  paypal_order_id  TEXT UNIQUE,
  status           TEXT NOT NULL DEFAULT 'pending',  -- pending | paid
  name             TEXT NOT NULL,
  email            TEXT NOT NULL,
  qty              INTEGER NOT NULL,
  amount_pence     INTEGER NOT NULL,
  currency         TEXT NOT NULL,
  marketing_opt_in INTEGER NOT NULL DEFAULT 0,
  email_sent       INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT NOT NULL,
  paid_at          TEXT
);
CREATE INDEX IF NOT EXISTS orders_slug_status ON orders (slug, status);
CREATE INDEX IF NOT EXISTS orders_email ON orders (email);

-- One row per person admitted. Each has its own code and its own QR.
CREATE TABLE IF NOT EXISTS tickets (
  code           TEXT PRIMARY KEY,            -- e.g. K7QM-3XTP
  order_id       TEXT NOT NULL REFERENCES orders (id),
  slug           TEXT NOT NULL,
  created_at     TEXT NOT NULL,
  checked_in_at  TEXT
);
CREATE INDEX IF NOT EXISTS tickets_order ON tickets (order_id);
