// PayPal Orders v2, called from the server so the secret never reaches
// the browser and the amount is always the one in events.js.
//
// PAYPAL_ENV = "sandbox" | "live" | "mock"
//   mock skips PayPal entirely — for local testing only. It is refused
//   unless MOCK_ALLOWED is also set, so a typo in production can't turn
//   the shop into a free giveaway.

const BASES = {
  sandbox: 'https://api-m.sandbox.paypal.com',
  live: 'https://api-m.paypal.com',
};

export function paypalMode(env) {
  const mode = (env.PAYPAL_ENV || 'sandbox').toLowerCase();
  if (mode === 'mock') {
    if (!env.MOCK_ALLOWED) throw new Error('PAYPAL_ENV=mock is only for local testing');
    return 'mock';
  }
  if (!BASES[mode]) throw new Error(`Unknown PAYPAL_ENV "${mode}"`);
  return mode;
}

async function accessToken(env, base) {
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      authorization: 'Basic ' + btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`),
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal auth failed (${res.status})`);
  return (await res.json()).access_token;
}

async function call(env, path, body) {
  const mode = paypalMode(env);
  const base = BASES[mode];
  const token = await accessToken(env, base);
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const issue = data?.details?.[0]?.issue || data?.name || res.status;
    const err = new Error(`PayPal error: ${issue}`);
    err.issue = issue;
    throw err;
  }
  return data;
}

export async function createPaypalOrder(env, { orderId, event, slug, qty, value, unitValue }) {
  if (paypalMode(env) === 'mock') return { id: `MOCK-${orderId.slice(0, 10).toUpperCase()}` };
  return call(env, '/v2/checkout/orders', {
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: slug,
      custom_id: orderId,
      description: event.name.slice(0, 127),
      amount: {
        currency_code: event.currency,
        value,
        breakdown: { item_total: { currency_code: event.currency, value } },
      },
      items: [{
        name: `Ticket — ${event.name}`.slice(0, 127),
        quantity: String(qty),
        unit_amount: { currency_code: event.currency, value: unitValue },
        category: 'DIGITAL_GOODS',
      }],
    }],
    application_context: {
      brand_name: 'IAMWE',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'PAY_NOW',
    },
  });
}

// Returns { ok, value, currency, captureId } — ok only when the money has
// actually moved.
export async function capturePaypalOrder(env, paypalOrderId, expected) {
  if (paypalMode(env) === 'mock') {
    return { ok: true, value: expected.value, currency: expected.currency, captureId: 'MOCKCAPTURE' };
  }
  const data = await call(env, `/v2/checkout/orders/${encodeURIComponent(paypalOrderId)}/capture`);
  const cap = data?.purchase_units?.[0]?.payments?.captures?.[0];
  return {
    ok: data.status === 'COMPLETED' && cap?.status === 'COMPLETED',
    value: cap?.amount?.value,
    currency: cap?.amount?.currency_code,
    captureId: cap?.id,
    payerEmail: data?.payer?.email_address,
  };
}
