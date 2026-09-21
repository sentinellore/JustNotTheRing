/**
 * Just Not The Ring — Worker
 *
 * Serves the static site (public/) and one API route: POST /api/plan-email,
 * which emails someone the link to the plan they just built.
 *
 * Design note, deliberate: the email carries the PLAN LINK, never a body the
 * browser supplied. The only variable that reaches the message is a base64url
 * string this Worker validates, so there is no way to send arbitrary content
 * from this domain. It also means the recommendation logic lives in exactly one
 * place — the page — instead of being duplicated here and drifting out of sync.
 *
 * Required secret:   RESEND_API_KEY      (wrangler secret put RESEND_API_KEY)
 * Required var:      MAIL_FROM           e.g. "Just Not The Ring <hello@justnotthering.com>"
 * Optional var:      RESEND_AUDIENCE_ID  only needed for the opt-in list
 * Optional vars:     PARTNER_LINE, PARTNER_URL — the Alexandrite line in the footer.
 *                    Leave unset and the block is omitted entirely.
 */

const SITE = "https://justnotthering.com";
const MAX_PLAN = 2000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/plan-email") {
      if (request.method === "POST") return handlePlanEmail(request, env);
      return json({ error: "method_not_allowed" }, 405, { Allow: "POST" });
    }

    // Everything else is the static site.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra },
  });
}

/* A plan code is base64url and nothing else. Anything that is not this shape
   never reaches an email. */
const PLAN_RE = /^[A-Za-z0-9_-]{8,2000}$/;
/* Deliberately permissive but bounded: real validation is the send itself. */
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s.]{1,63}(\.[^@\s.]{1,63}){1,4}$/;

async function handlePlanEmail(request, env) {
  if (!env.RESEND_API_KEY || !env.MAIL_FROM) {
    return json({ error: "not_configured" }, 503);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "bad_request" }, 400);
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  const plan = typeof body.plan === "string" ? body.plan.trim() : "";
  const optIn = body.optIn === true;

  if (email.length > 254 || !EMAIL_RE.test(email)) return json({ error: "bad_email" }, 400);
  if (plan.length > MAX_PLAN || !PLAN_RE.test(plan)) return json({ error: "bad_plan" }, 400);

  const link = `${SITE}/#plan=${plan}`;
  const sent = await sendMail(env, email, link);
  if (!sent.ok) return json({ error: "send_failed" }, 502);

  /* Only when they explicitly ticked the box, and never as a side effect of
     wanting their own plan. A failure here must not fail their email. */
  if (optIn && env.RESEND_AUDIENCE_ID) {
    try {
      await addContact(env, email);
    } catch {
      /* ignored on purpose */
    }
  }

  return json({ ok: true });
}

function partnerBlock(env, asText) {
  const line = (env.PARTNER_LINE || "").trim();
  if (!line) return "";
  const url = (env.PARTNER_URL || "").trim();
  if (asText) return `\n\n${line}${url ? `\n${url}` : ""}`;
  const safe = esc(line);
  return url
    ? `<p style="margin:26px 0 0;font-size:14px;color:#5A6470">${safe} <a href="${esc(url)}" style="color:#2F5480">Find out more</a>.</p>`
    : `<p style="margin:26px 0 0;font-size:14px;color:#5A6470">${safe}</p>`;
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

async function sendMail(env, to, link) {
  const html = `<!doctype html>
<html><body style="margin:0;padding:28px 18px;background:#F5F4EF;font-family:Georgia,'Times New Roman',serif;color:#1B2430">
  <div style="max-width:560px;margin:0 auto;background:#FCFCFA;border:1px solid #DBDBD4;border-radius:14px;padding:32px 30px">
    <p style="margin:0 0 6px;font-family:Menlo,monospace;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#8A6C2C">Just Not The Ring</p>
    <h1 style="margin:0 0 16px;font-size:26px;font-weight:500;line-height:1.24">Here is the plan you built</h1>
    <p style="margin:0 0 22px;font-size:16px;line-height:1.6;color:#46525F">Open this and you will land straight back on your recommendation — where to ask, how to do it, and the ring spec you can take to a jeweler.</p>
    <p style="margin:0 0 26px"><a href="${esc(link)}" style="display:inline-block;padding:14px 26px;background:#1E3A5F;color:#F7F6F1;border-radius:999px;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:bold;text-decoration:none">Open my plan</a></p>
    <p style="margin:0 0 6px;font-size:13px;line-height:1.6;color:#66717E">The link holds the scores from your answers and the city you named. It never held anything you wrote about your partner, and we have kept no copy of it.</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#66717E"><b>One thing:</b> if this inbox is shared, delete this message. A plan sitting in a shared inbox is how a surprise stops being one.</p>
    ${partnerBlock(env, false)}
  </div>
</body></html>`;

  const text = `Just Not The Ring — here is the plan you built.

Open it: ${link}

The link holds the scores from your answers and the city you named. It never
held anything you wrote about your partner, and we have kept no copy of it.

One thing: if this inbox is shared, delete this message. A plan sitting in a
shared inbox is how a surprise stops being one.${partnerBlock(env, true)}`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      from: env.MAIL_FROM,
      to: [to],
      subject: "Your proposal plan",
      html,
      text,
    }),
  });
  return { ok: res.ok };
}

async function addContact(env, email) {
  await fetch(`https://api.resend.com/audiences/${env.RESEND_AUDIENCE_ID}/contacts`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, unsubscribed: false }),
  });
}
