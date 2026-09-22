/**
 * Just Not The Ring — Worker
 *
 * Serves the static site (public/) and two API routes: POST /api/plan-email, which emails
 * someone the link to the plan they just built, and /api/unsubscribe, which takes an address
 * off the opt-in list when the person asks.
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
 * Optional var:      RESEND_AUDIENCE_ID  only needed for the opt-in list. It is the id of the
 *                                        Resend segment the address is added to (the dashboard
 *                                        used to call these audiences; the name stays).
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

    if (url.pathname === "/api/unsubscribe") {
      if (request.method === "GET" || request.method === "POST") return handleUnsubscribe(request, env, url);
      return json({ error: "method_not_allowed" }, 405, { Allow: "GET, POST" });
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

  /* Only when they explicitly ticked the box, and never as a side effect of wanting their
     own plan. A failure here must not fail their email. It runs BEFORE the send so the
     email can state what actually happened: the footer is rendered from `subscription`,
     the contact id Resend returned, not from the checkbox. The box is an intent; the id is
     the fact, and only the fact gets stated. No audience configured, or the add failed,
     and the email truthfully says they are on no list. */
  let subscription = null;
  if (optIn && env.RESEND_AUDIENCE_ID) {
    try {
      subscription = await addContact(env, email);
    } catch {
      /* ignored on purpose */
    }
  }

  const link = `${SITE}/#plan=${plan}`;
  const sent = await sendMail(env, email, link, subscription);
  if (!sent.ok) return json({ error: "send_failed" }, 502);

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
  const wait = waitPhrase(retryAfter);
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


/* ============================================================
   EMAIL — one definition, two renderings
   ============================================================ */

/* A message is an ordered list of BLOCKS. Each block knows how to render itself as HTML
   and as plain text, and a template is nothing but its subject, its preheader and its block
   list. `render()` produces both bodies from the same list, so the two can never drift —
   drift between two copies of one thing is the bug this project has fought hardest.

   The frame (`shell()`) is shared with the pages the unsubscribe route serves, which is how
   we know it factors.

   Left deliberately unbuilt, for a possible second template (a reminder tied to the target
   date), which is NOT decided and must not be started here:
     - A date line. Blocked on the retention decision: a reminder needs the date stored
       somewhere and nothing is stored today. It would be one block in the list.
     - A "why you are getting this" line in the footer. A plan email arrives seconds after a
       button press and needs none; a reminder arrives weeks later, cold, and needs one.
     - The shared-inbox aside is a shared block on purpose. It matters MORE in a reminder.
     - Unsubscribe semantics differ: a plan email is transactional and carries list headers
       only when the person is actually on the list; a date-triggered reminder arguably needs
       them unconditionally. Decide that before writing that template, not after.
   The natural moment to split this section into src/email.js is that second template. */

const PRIVACY_URL = `${SITE}/#privacy`;
const UNSUB_URL = `${SITE}/api/unsubscribe`;
const DOMAIN = "justnotthering.com";

/* Colour tokens: [light, dark], copied from :root in public/index.html. Change these in
   step with the site — and nothing below may use a colour literal. The masthead is the one
   exception to light/dark switching: like the site's blue-hour panel it is dusk in both
   schemes, so its wordmark and rule take the dark-scheme gold (the site's gold for dark
   grounds) and its caption takes skyInk. */
const TOKENS = {
  ground:     ["#F5F4EF", "#101823"],
  surface:    ["#FCFCFA", "#18222F"],
  surface2:   ["#F8F7F2", "#1E2937"],
  ink:        ["#1B2430", "#EDF2F8"],
  ink2:       ["#46525F", "#BAC7D6"],
  ink3:       ["#66717E", "#93A1B1"],
  line:       ["#DBDBD4", "#2C3949"],
  accent:     ["#2F5480", "#8FB3DF"],
  accentDeep: ["#1E3A5F", "#A6C4E8"],
  accentSoft: ["#E5EBF3", "#1B2A3A"],
  gold:       ["#8A6C2C", "#DCC07C"],
  goldSoft:   ["#F3EEE1", "#2A2617"],
  /* The caption colour of the site's blue-hour panel: `.skycap{color:#EEF3FA}` in
     public/index.html. Not a :root token there; one value for both schemes because the
     panel it sits on is dusk in both. */
  skyInk:     ["#EEF3FA", "#EEF3FA"],
};
const L = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, v[0]]));
const D = Object.fromEntries(Object.entries(TOKENS).map(([k, v]) => [k, v[1]]));

/* The site's stacks. The web font is named first and resolves only if installed locally;
   the fallback does the real work. Display is for headings only, mono for the eyebrow and
   the footer wordmark, body for everything else — body copy is not a serif. */
/* Single quotes: these land inside double-quoted style attributes. */
const F = {
  display: `'Fraunces', Georgia, 'Times New Roman', serif`,
  body: `'Karla', 'Helvetica Neue', Helvetica, Arial, sans-serif`,
  mono: `'IBM Plex Mono', 'SFMono-Regular', Menlo, Consolas, monospace`,
};

const TABLE = `role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt"`;

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

/* Plain text is a first-class output, not a fallback: wrapped at 72 columns, a URL always
   on its own line and never broken. */
function wrap(s, width = 72) {
  return s
    .split("\n")
    .map((line) => {
      if (line.length <= width || /^https?:\/\//.test(line)) return line;
      const out = [];
      let cur = "";
      for (const w of line.split(" ")) {
        if (cur && (cur + " " + w).length > width) {
          out.push(cur);
          cur = w;
        } else cur = cur ? cur + " " + w : w;
      }
      if (cur) out.push(cur);
      return out.join("\n");
    })
    .join("\n");
}

/* Style helpers. Every element that sets a background also sets a colour, and every element
   that sets a colour sits on one with a background — the pairing rule that survives forced
   dark mode. Backgrounds go on as both the attribute and the inline style. The class names
   are the hooks the dark-scheme stylesheet in shell() overrides, where a client keeps it. */
const p = (font, size, lh, color, extra = "") =>
  `margin:0;font-family:${font};font-size:${size}px;line-height:${lh};mso-line-height-rule:exactly;color:${color};${extra}`;
const link = (href, label, cls = "c-accent", color = L.accent) =>
  `<a href="${esc(href)}" class="${cls}" style="color:${color};text-decoration:underline">${esc(label)}</a>`;
const pill = (tag, attrs, label) =>
  `<table ${TABLE}><tr><td bgcolor="${L.accentDeep}" class="bg-accentDeep" style="background-color:${L.accentDeep};border-radius:999px;mso-padding-alt:14px 28px">` +
  `<${tag} ${attrs} class="c-ground bg-accentDeep" style="display:inline-block;margin:0;padding:14px 28px;border:0;border-radius:999px;background-color:${L.accentDeep};font-family:${F.body};font-size:15px;line-height:1.2;mso-line-height-rule:exactly;font-weight:bold;color:${L.ground};text-decoration:none;cursor:pointer">${esc(label)}</${tag}>` +
  `</td></tr></table>`;

/* Each block returns { html, text, zone, gap }. zone is "card" (default) or "footer"; gap is
   the space the frame leaves below it in HTML, from td padding, never from <br>. Text has no
   zones: blocks read top to bottom in the order given. */
const B = {
  h1: (s) => ({ gap: 12, text: s, html: `<h1 class="c-ink" style="${p(F.display, 27, 1.24, L.ink, "font-weight:500")}">${esc(s)}</h1>` }),

  lede: (s) => ({ gap: 26, text: s, html: `<p class="c-ink2" style="${p(F.body, 16, 1.6, L.ink2)}">${esc(s)}</p>` }),

  /* The href is used exactly as given. No utm, no redirect, no click wrapper. */
  button: (href, label) => ({
    gap: 28,
    text: `${label}:\n${href}`,
    html: pill("a", `href="${esc(href)}"`, label),
  }),

  /* The shared-inbox warning. It is the most important block after the button and is styled
     as such: accentSoft ground, a 3px accent edge (border-left, which Word honours), 15px ink,
     first clause bold. Not small, not grey. */
  aside: (lead, rest) => ({
    gap: 24,
    text: `---\n\n${lead.toUpperCase()} ${rest}\n\n---`,
    html:
      `<table ${TABLE} width="100%" style="width:100%;border-collapse:collapse"><tr>` +
      `<td bgcolor="${L.accentSoft}" class="bg-accentSoft bl-accent c-ink" style="background-color:${L.accentSoft};border-left:3px solid ${L.accent};padding:16px 18px;${p(F.body, 15, 1.55, L.ink)}">` +
      `<b style="font-weight:700;color:inherit">${esc(lead)}</b> ${esc(rest)}</td></tr></table>`,
  }),

  note: (s, linkLabel, href) => ({
    gap: 0,
    text: `${s}.\n\n${linkLabel[0].toUpperCase() + linkLabel.slice(1)}:\n${href}`,
    html: `<p class="c-ink3" style="${p(F.body, 14, 1.6, L.ink3)}">${esc(s)} — ${link(href, linkLabel)}.</p>`,
  }),

  /* Exactly one of two states, decided by the contact id Resend returned — never by the
     checkbox. null means state A, and with RESEND_AUDIENCE_ID unset it is always null. */
  optIn: (subscription) => {
    if (!subscription) {
      const s = "You are not on any list. Your address was used once, to send this, and then not again.";
      return { zone: "footer", gap: 14, text: s, html: `<p class="c-ink3" style="${p(F.body, 14, 1.6, L.ink3)}">${esc(s)}</p>` };
    }
    const href = unsubscribeUrl(subscription);
    const a = "You also asked to hear from us about proposal planning, so your address is on that list now. That is a separate thing from this email: ";
    const b = "unsubscribe";
    const c = " and this link still works.";
    return {
      zone: "footer",
      gap: 14,
      text: `${a}${b}${c}\n\nUnsubscribe:\n${href}`,
      html: `<p class="c-ink3" style="${p(F.body, 14, 1.6, L.ink3)}">${esc(a)}${link(href, b)}${esc(c)}</p>`,
    };
  },

  /* The partner slot. Unset PARTNER_LINE and the block is omitted entirely; the copy is
     deliberately unwritten here and belongs to the person who runs the business. */
  partner: (env) => {
    const line = (env.PARTNER_LINE || "").trim();
    if (!line) return null;
    const url = (env.PARTNER_URL || "").trim();
    return {
      zone: "footer",
      gap: 14,
      text: `${line}${url ? `\n${url}` : ""}`,
      html: `<p class="c-ink3" style="${p(F.body, 14, 1.6, L.ink3)}">${esc(line)}${url ? ` ${link(url, "Find out more")}.` : ""}</p>`,
    };
  },

  wordmark: () => ({
    zone: "footer",
    gap: 0,
    text: `Just Not The Ring — ${DOMAIN}`,
    html: `<p class="c-ink3" style="${p(F.mono, 11, 1.6, L.ink3, "letter-spacing:.04em")}">Just Not The Ring &middot; ${DOMAIN}</p>`,
  }),

  /* A form that POSTs. Only the unsubscribe pages use it; it has no text rendering. */
  form: (action, fields, label) => ({
    gap: 28,
    text: "",
    html:
      `<form method="post" action="${esc(action)}" style="margin:0">` +
      Object.entries(fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join("") +
      pill("button", `type="submit"`, label) +
      `</form>`,
  }),
};

/* The masthead: the site's blue-hour panel, done typographically. A mono wordmark in
   champagne gold, a 40px hairline of gold, the site's own caption in the site's own caption
   colour. bgcolor cells and text only, so it renders the same in Gmail, Apple Mail and
   Word-engine Outlook. */
function masthead() {
  return (
    `<td bgcolor="${L.accentDeep}" align="center" style="background-color:${L.accentDeep};padding:28px 24px;color:${D.gold}">` +
    `<p style="${p(F.mono, 11, 1.4, D.gold, "letter-spacing:.18em;text-transform:uppercase;padding-bottom:14px")}">Just Not The Ring</p>` +
    `<table ${TABLE} width="40" align="center" style="width:40px"><tr><td height="1" width="40" bgcolor="${D.gold}" style="background-color:${D.gold};height:1px;width:40px;font-size:0;line-height:0;mso-line-height-rule:exactly">&nbsp;</td></tr></table>` +
    `<p style="${p(F.display, 15, 1.4, D.skyInk, "font-style:italic;padding-top:14px")}">the hour after sunset</p>` +
    `</td>`
  );
}
const MASTHEAD_TEXT = "JUST NOT THE RING\nthe hour after sunset";

/* Rules the client applies only where it keeps <style>: Apple Mail and some Outlook.com.
   Gmail may drop the whole block, which is why every colour above is also inline. The
   masthead has no class hooks on purpose — it stays dusk. */
function darkRules() {
  const rules = [];
  for (const k of Object.keys(TOKENS)) {
    rules.push(`.bg-${k}{background-color:${D[k]} !important}`);
    rules.push(`.c-${k}{color:${D[k]} !important}`);
  }
  rules.push(`.bl-accent{border-left-color:${D.accent} !important}`);
  rules.push(`.bd-line{border-color:${D.line} !important}`);
  return rules.join("\n    ");
}

/* The frame: head, preheader, masthead, card, footer. The column is width="100%" with
   max-width:600px, and Word-engine Outlook — which ignores max-width — gets a fixed 600px
   wrapper inside an [if mso] conditional comment that every other client discards. That
   wrapper is plain HTML, not VML. (A width="600" attribute on the column itself was tried
   first: Chrome, and so Gmail, treats it as a floor even under width:100%, and the email
   did not reflow at phone width.) The pill button is a rectangle in Word-engine Outlook,
   and that is fine. */
function shell({ title, preheader, blocks }) {
  const live = blocks.filter(Boolean);
  const rows = (zone, color) => {
    const list = live.filter((b) => (b.zone || "card") === zone);
    return list
      .map((b, i) => `<tr><td style="padding:0 0 ${i === list.length - 1 ? 0 : b.gap}px;color:${color}">${b.html}</td></tr>`)
      .join("\n            ");
  };
  /* The preheader displaces the body text a client would otherwise pull into the inbox
     list; the zero-width run after it stops real body text being pulled in behind it. */
  const pre = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${L.ground}">${esc(preheader)}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>\n`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>
  body{margin:0;padding:0;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt}
  a{text-underline-offset:2px}
  @media (prefers-color-scheme: dark){
    ${darkRules()}
  }
</style>
</head>
<body bgcolor="${L.ground}" class="bg-ground c-ink" style="margin:0;padding:0;background-color:${L.ground};color:${L.ink}">
${pre}<table ${TABLE} width="100%" bgcolor="${L.ground}" class="bg-ground" style="width:100%;border-collapse:collapse;background-color:${L.ground}">
  <tr>
    <td align="center" style="padding:24px 12px">
      <!--[if mso]><table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600"><tr><td><![endif]-->
      <table ${TABLE} width="100%" style="width:100%;max-width:600px;border-collapse:collapse">
        <tr>
          ${masthead()}
        </tr>
        <tr>
          <td bgcolor="${L.surface}" class="bg-surface bd-line c-ink" style="background-color:${L.surface};border-left:1px solid ${L.line};border-right:1px solid ${L.line};padding:30px 26px;color:${L.ink}">
            <table ${TABLE} width="100%" style="width:100%;border-collapse:collapse">
            ${rows("card", L.ink)}
            </table>
          </td>
        </tr>
        <tr>
          <td bgcolor="${L.ground}" class="bg-ground bd-line c-ink3" style="background-color:${L.ground};border:1px solid ${L.line};border-top-color:${L.line};padding:22px 26px;color:${L.ink3}">
            <table ${TABLE} width="100%" style="width:100%;border-collapse:collapse">
            ${rows("footer", L.ink3)}
            </table>
          </td>
        </tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td>
  </tr>
</table>
</body>
</html>`;
}

function plain({ blocks }) {
  const parts = [MASTHEAD_TEXT].concat(blocks.filter(Boolean).map((b) => b.text).filter(Boolean));
  return wrap(parts.join("\n\n")) + "\n";
}

function render(tpl) {
  return { subject: tpl.subject, html: shell(tpl), text: plain(tpl) };
}

/* ---- the plan email ---- */

const SHARED_INBOX_LEAD = "If anyone else reads this inbox, delete this message now.";
const SHARED_INBOX =
  "Not because anything here is sensitive on its own, but because a plan sitting in a shared inbox is the likeliest way a surprise stops being one. The link works from anywhere — your phone, a note to yourself, a browser tab. It does not need to live in your email.";
const RETENTION =
  "The link holds the scores from your answers, the boxes you ticked on the last step and the stone if you picked one, anything you changed by hand, and the city you typed. It never held a word you wrote about your partner. We kept no copy of any of it";

/* Subject and preheader are the two strings a shared inbox shows without being opened, so
   neither says proposal, plan or ring. The subject is identical for every recipient. */
function planEmail(env, link, subscription) {
  return {
    subject: "The link you asked for",
    title: "The link you asked for",
    preheader: "Everything you built is behind one link. We kept no copy of it.",
    blocks: [
      B.h1("Your plan is where you left it."),
      B.lede("One link and you are back on the same recommendation — where to ask, how to do it, and the ring spec you can hand to a jeweler. Nothing else travelled with it."),
      B.button(link, "Open the plan"),
      B.aside(SHARED_INBOX_LEAD, SHARED_INBOX),
      B.note(RETENTION, "what leaves and what doesn't", PRIVACY_URL),
      B.optIn(subscription),
      B.partner(env),
      B.wordmark(),
    ],
  };
}

/* `subscription` is the Resend contact id when the address was actually added to the list
   on this request, else null. Only then does the message carry list headers — a plan email
   with no subscription is transactional and gets none. */
async function sendMail(env, to, link, subscription) {
  const mail = render(planEmail(env, link, subscription));
  const message = { from: env.MAIL_FROM, to: [to], subject: mail.subject, html: mail.html, text: mail.text };
  if (subscription) {
    /* No mailto: variant yet: hello@ has no MX records until Cloudflare Email Routing is set
       up, so a mailto unsubscribe would bounce today. Add
       `<mailto:hello@justnotthering.com?subject=unsubscribe>` once it does. */
    message.headers = {
      "List-Unsubscribe": `<${unsubscribeUrl(subscription)}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(message),
  });
  return { ok: res.ok };
}

/* ============================================================
   THE OPT-IN LIST, AND LEAVING IT
   ============================================================ */

/* A Resend contact id. It is a UUID Resend mints and returns, unguessable and not derivable
   from the address, which is what makes it usable as the unsubscribe token on its own: no
   email address in the URL (it would land in request logs) and no signing secret (it would
   protect nothing). Anything not this shape never reaches Resend. */
const CONTACT_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unsubscribeUrl(id) {
  return `${UNSUB_URL}?c=${id}`;
}

/* Adds the address to the list and returns the contact id, or null if Resend did not give
   one. Resend's current API: contacts are account-wide, created at POST /contacts, and put
   in a list through `segments` (the dashboard used to call these audiences, which is why the
   variable is still named that). The older POST /audiences/{id}/contacts form is no longer
   documented and is not used. */
async function addContact(env, email) {
  const res = await fetch("https://api.resend.com/contacts", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, unsubscribed: false, segments: [env.RESEND_AUDIENCE_ID] }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return typeof data.id === "string" && CONTACT_RE.test(data.id) ? data.id : null;
}

/* Marks the contact unsubscribed. Idempotent: PATCHing an already-unsubscribed contact is a
   no-op on Resend's side and a success here. */
async function unsubscribeContact(env, id) {
  const res = await fetch(`https://api.resend.com/contacts/${id}`, {
    method: "PATCH",
    headers: {
      authorization: `Bearer ${env.RESEND_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ unsubscribed: true }),
  });
  return res.ok;
}

/* Generous, but not unlimited: this is an unauthenticated route that reaches a third party.
   Its own limiter instances, so it never eats into anyone's plan-email allowance.

   Two buckets, because the two ways in arrive from different places. The page in the email
   is opened by the person, so it is keyed by their network address like the send route. A
   mail client's one-click POST (List-Unsubscribe-Post) is sent by the PROVIDER's servers —
   Gmail's, Apple's — not the reader's, so an address-keyed bucket would pool every Gmail
   user's unsubscribe into one counter and start refusing them once the site had any
   traffic. That path gets one site-wide bucket instead, wide enough that only abuse
   reaches it: what it bounds is the number of Resend calls a stranger can provoke by
   posting that body with made-up ids. */
const UNSUB_RULES = [
  { limit: 10, windowMs: HOUR },
  { limit: 40, windowMs: DAY },
];
const ONE_CLICK_RULES = [
  { limit: 300, windowMs: HOUR },
  { limit: 2000, windowMs: DAY },
];

/* "a minute", "about 12 minutes", "about 3 hours" — shared with the send route's message. */
function waitPhrase(retryAfter) {
  const mins = Math.max(1, Math.ceil(retryAfter / 60));
  return mins >= 90 ? `about ${Math.round(mins / 60)} hours` : mins === 1 ? "a minute" : `about ${mins} minutes`;
}

function htmlPage(html, status = 200, extra = {}) {
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer",
      "x-robots-tag": "noindex",
      ...extra,
    },
  });
}

/* The pages the route serves. The frame is the email's own. */
function unsubPage(title, h1, lede, extra = []) {
  return shell({
    title,
    preheader: "",
    blocks: [B.h1(h1), B.lede(lede)].concat(extra, [B.wordmark()]),
  });
}
const PRIVACY_NOTE = () => B.note("Unsubscribing changes one thing on one list. Nothing about your plan is stored with us, so there is nothing else to remove", "what leaves and what doesn't", PRIVACY_URL);

/* GET shows a page with a button and changes nothing — link scanners, Safe Links and
   antivirus prefetchers follow GETs in email, and a GET that unsubscribed would fire by
   accident. POST does the work. The token comes from the form body, or from the query for
   a mail client's one-click POST (whose body is `List-Unsubscribe=One-Click`).

   THIS ROUTE FAILS OPEN, and that is the opposite of the send route, on purpose. If the
   limiter is missing or broken the send route sends nothing, because an unlimited send
   button runs up a bill and burns the sender's reputation. Here the same outage would mean
   a person cannot leave a mailing list — the one failure on this Worker with compliance
   weight, and a broken promise on the privacy page. The harm in the other direction is
   bounded: all the route can do is PATCH a contact id the caller already holds. So with no
   limiter, or a limiter error, the unsubscribe still goes through. Do not "fix" this back. */
async function handleUnsubscribe(request, env, url) {
  let c = (url.searchParams.get("c") || "").trim();
  let oneClick = false;
  if (request.method === "POST") {
    try {
      const form = await request.formData();
      const v = form.get("c");
      if (typeof v === "string" && v.trim()) c = v.trim();
      oneClick = form.get("List-Unsubscribe") === "One-Click";
    } catch {
      /* not a form body; the query may still carry it */
    }
  }

  if (!CONTACT_RE.test(c)) {
    return htmlPage(
      unsubPage("Not one of ours", "That link is not one we sent.", `Unsubscribe links only come from our own emails — open the one in your inbox and try again. If it keeps happening, write to hello@${DOMAIN} and we will take you off by hand.`),
      400
    );
  }

  if (request.method === "GET") {
    return htmlPage(
      unsubPage(
        "Leave the list",
        "Leave the list?",
        "This takes your address off the proposal-planning list. It is a separate thing from your plan: any plan link you have still works, and nothing about it changes.",
        [B.form(UNSUB_URL, { c }, "Unsubscribe"), PRIVACY_NOTE()]
      )
    );
  }

  const failed = (status) =>
    htmlPage(
      unsubPage("Try again", "That did not go through.", `Nothing changed. Try the button in your email again in a minute, or write to hello@${DOMAIN} and we will take you off by hand.`),
      status
    );

  if (!env.RESEND_API_KEY) return failed(503);

  if (env.LIMITER) {
    let slot = null;
    try {
      slot = oneClick
        ? await takeSlot(env, "unsub:one-click", ONE_CLICK_RULES)
        : await takeSlot(env, "unsub:" + clientKey(request), UNSUB_RULES);
    } catch {
      /* limiter broken: fail open, see above */
    }
    if (slot && !slot.ok) {
      const wait = waitPhrase(slot.retryAfter);
      return htmlPage(
        unsubPage(
          "Try again",
          "Too many at once.",
          oneClick
            ? `More unsubscribes have arrived than we allow at once. Nothing changed — try again in ${wait}, or write to hello@${DOMAIN} and we will take you off by hand.`
            : `That is the limit for this connection for now. Nothing changed — try again in ${wait}, or write to hello@${DOMAIN} and we will take you off by hand.`
        ),
        429,
        { "retry-after": String(slot.retryAfter) }
      );
    }
  }

  const ok = await unsubscribeContact(env, c);
  if (!ok) return failed(502);
  return htmlPage(
    unsubPage("Off the list", "You are off the list.", "Your address is no longer on the proposal-planning list. Any plan link you have still works — leaving the list never touched it.", [PRIVACY_NOTE()])
  );
}
