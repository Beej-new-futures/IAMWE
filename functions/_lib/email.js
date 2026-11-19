// Ticket email, sent through Resend (resend.com). With no RESEND_API_KEY
// set it logs instead of sending, so local testing needs no account.

import { escapeHtml } from './util.js';

export async function sendTicketEmail(env, { to, name, event, codes, ticketUrl, qrUrl }) {
  const subject = `Your tickets — ${event.name}`;
  const n = codes.length;

  const codeBlocks = codes.map((c, i) => `
    <tr><td style="padding:0 0 28px 0;text-align:center">
      <img src="${qrUrl(c)}" width="200" height="200" alt="QR code ${c}" style="display:block;margin:0 auto 10px;border:0">
      <div style="font-family:Menlo,Consolas,monospace;font-size:22px;letter-spacing:4px;color:#141414">${c}</div>
      <div style="font-family:Menlo,Consolas,monospace;font-size:11px;letter-spacing:2px;color:#888;text-transform:uppercase">Admit one · ${i + 1} of ${n}</div>
    </td></tr>`).join('');

  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f1">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f1;padding:32px 12px">
  <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;padding:36px 28px">
    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-weight:800;letter-spacing:6px;font-size:13px;color:#141414;padding-bottom:28px">IAMWE</td></tr>
    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:28px;line-height:1.1;font-weight:800;color:#141414;padding-bottom:12px">${escapeHtml(event.name)}</td></tr>
    <tr><td style="font-family:Menlo,Consolas,monospace;font-size:12px;letter-spacing:1px;color:#555;text-transform:uppercase;padding-bottom:28px;line-height:1.7">
      ${[event.dateLabel, event.timeLabel, event.venue].filter(Boolean).map(escapeHtml).join('<br>')}</td></tr>
    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#141414;padding-bottom:28px">
      Hi ${escapeHtml(name)} — you're in. ${n === 1 ? 'Here is your ticket.' : `Here are your ${n} tickets.`}
      ${escapeHtml(event.ticketNote || '')}</td></tr>
    ${codeBlocks}
    <tr><td style="text-align:center;padding:8px 0 28px">
      <a href="${ticketUrl}" style="display:inline-block;background:#141414;color:#ffffff;text-decoration:none;font-family:Menlo,Consolas,monospace;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:14px 22px">Open tickets on your phone</a>
    </td></tr>
    <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#888;border-top:1px solid #eee;padding-top:18px">
      Keep this email — the codes are your tickets. Questions? Just reply.</td></tr>
  </table></td></tr></table></body></html>`;

  const text = [
    `IAMWE — ${event.name}`,
    [event.dateLabel, event.timeLabel, event.venue].filter(Boolean).join(' · '),
    '',
    `Hi ${name} — you're in. ${event.ticketNote || ''}`,
    '',
    ...codes.map((c, i) => `Ticket ${i + 1}: ${c}`),
    '',
    `Open your tickets: ${ticketUrl}`,
  ].join('\n');

  if (!env.RESEND_API_KEY) {
    console.log(`[email not sent — no RESEND_API_KEY] to=${to} subject="${subject}"\n${text}`);
    return { ok: true, skipped: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: env.TICKETS_FROM || 'IAMWE <tickets@iamwe.uk>',
      to: [to],
      reply_to: env.TICKETS_REPLY_TO || undefined,
      bcc: env.TICKETS_BCC ? [env.TICKETS_BCC] : undefined,
      subject,
      html,
      text,
    }),
  });
  if (!res.ok) {
    console.log('Resend error', res.status, await res.text().catch(() => ''));
    return { ok: false };
  }
  return { ok: true };
}
