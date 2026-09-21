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
 * Required binding:  LIMITER             the SendLimiter Durable Object, below. No limiter,
 *                                        no send — the route fails closed.
 * Optional var:      SEND_CEILING_PER_DAY  site-wide cap on sends per 24h. Default 80.
 * Optional var:      RESEND_AUDIENCE_ID  only needed for the opt-in list
 * Optional vars:     PARTNER_LINE, PARTNER_URL — the Alexandrite line in the footer.
 *                    Leave unset and the block is omitted entirely.
 */

const SITE = "https://justnotthering.com";
const MAX_PLAN = 2000;

/* Sending limits. Per network address: 5 an hour, 20 a day. Site-wide: a hard ceiling per
   24h, so a distributed attempt cannot run up a bill or burn the sender's reputation. */
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const IP_RULES = [
  { limit: 5, windowMs: HOUR },
  { limit: 20, windowMs: DAY },
];
const DEFAULT_CEILING_PER_DAY = 80;

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

  /* Only a request that would otherwise send takes a slot, and it takes it before the
     send, so a failing send cannot be retried for free. */
  const limited = await checkLimits(request, env);
  if (limited) return limited;

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

/* ============================================================
   RATE LIMITING
   ============================================================ */

/* The key is the caller's network address, never the email address they typed — nothing
   about who a plan was sent to is kept. IPv6 is cut to its /64, because one machine
   holds a whole /64 and could otherwise walk through it for free. */
function clientKey(request) {
  const ip = (request.headers.get("cf-connecting-ip") || "unknown").trim().toLowerCase();
  if (ip.indexOf(":") < 0) return ip;
  const halves = ip.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length > 1 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length > 1 ? new Array(Math.max(0, 8 - head.length - tail.length)).fill("0") : [];
  return head.concat(fill, tail).slice(0, 4).join(":") + "::/64";
}

function ceilingPerDay(env) {
  const n = parseInt(env.SEND_CEILING_PER_DAY, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CEILING_PER_DAY;
}

async function takeSlot(env, name, rules) {
  const stub = env.LIMITER.get(env.LIMITER.idFromName(name));
  const res = await stub.fetch("https://limiter/take", { method: "POST", body: JSON.stringify(rules) });
  if (!res.ok) throw new Error("limiter " + res.status);
  return res.json();
}

function tooMany(scope, retryAfter) {
  const mins = Math.max(1, Math.ceil(retryAfter / 60));
  const wait = mins >= 90 ? `about ${Math.round(mins / 60)} hours` : mins === 1 ? "a minute" : `about ${mins} minutes`;
  const message =
    scope === "site"
      ? "Email is paused for today — more plans have gone out than we allow in a day. Copy the link above instead; it is the same plan."
      : `That is the limit for emailed plans from your connection. Copy the link above instead, or try again in ${wait}.`;
  return json({ error: "rate_limited", scope, retryAfter, message }, 429, { "retry-after": String(retryAfter) });
}

/* Returns a Response when the request must stop, or null when it may send. Fails closed:
   if the limiter is missing or broken, nothing is sent. */
async function checkLimits(request, env) {
  if (!env.LIMITER) return json({ error: "limiter_unavailable" }, 503);
  try {
    const mine = await takeSlot(env, "ip:" + clientKey(request), IP_RULES);
    if (!mine.ok) return tooMany("you", mine.retryAfter);
    const site = await takeSlot(env, "site", [{ limit: ceilingPerDay(env), windowMs: DAY }]);
    if (!site.ok) return tooMany("site", site.retryAfter);
    return null;
  } catch {
    return json({ error: "limiter_unavailable" }, 503);
  }
}

/* One instance per network address, plus one named "site". Each holds a list of send
   times and nothing else: no email address, no plan, not even the address it is counting
   for (the platform addresses the instance by a hash of its name).

   Every time is deleted once it is as old as the longest window — 24 hours — not merely
   ignored: the alarm is always set for the moment the OLDEST stored time expires, prunes
   it from storage, and re-arms for the next one. The privacy page promises this; keep
   the two in step.

   All requests for one name reach the same single-threaded instance. The list lives in
   memory and the check-then-count below has no await inside it, so two requests cannot
   both see the last free slot — that is what makes the site-wide ceiling a hard one.
   Storage is only there so the count survives the instance being evicted. */
export class SendLimiter {
  constructor(state) {
    this.state = state;
    this.stamps = null;
  }

  async fetch(request) {
    const rules = await request.json();
    if (this.stamps === null) {
      const saved = (await this.state.storage.get("stamps")) || [];
      if (this.stamps === null) this.stamps = saved;
    }

    /* ---- no await from here to the push ---- */
    const now = Date.now();
    const horizon = Math.max.apply(null, rules.map((r) => r.windowMs));
    this.stamps = this.stamps.filter((t) => now - t < horizon);
    let retryAfter = 0;
    for (const r of rules) {
      const inWindow = this.stamps.filter((t) => now - t < r.windowMs);
      if (inWindow.length >= r.limit) {
        /* a slot frees when the oldest of the last `limit` sends leaves the window */
        const frees = inWindow[inWindow.length - r.limit] + r.windowMs;
        retryAfter = Math.max(retryAfter, Math.ceil((frees - now) / 1000));
      }
    }
    if (retryAfter > 0) return Response.json({ ok: false, retryAfter });
    this.stamps.push(now);
    /* ---- counted ---- */

    /* `this.stamps` is read at call time on purpose, here and in alarm(): whichever write
       lands last carries the latest list. */
    await this.state.storage.put({ stamps: this.stamps, horizon });
    await this.state.storage.setAlarm(this.stamps[0] + horizon);
    return Response.json({ ok: true });
  }

  async alarm() {
    const horizon = (await this.state.storage.get("horizon")) || DAY;
    if (this.stamps === null) {
      const saved = (await this.state.storage.get("stamps")) || [];
      if (this.stamps === null) this.stamps = saved;
    }
    const now = Date.now();
    this.stamps = this.stamps.filter((t) => now - t < horizon);
    if (this.stamps.length === 0) {
      await this.state.storage.deleteAll();
      return;
    }
    await this.state.storage.put("stamps", this.stamps);
    await this.state.storage.setAlarm(this.stamps[0] + horizon);
  }
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
