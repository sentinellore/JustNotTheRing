# Just Not The Ring

An engagement planning site, live at [justnotthering.com](https://justnotthering.com). A
relationship quiz produces a location, a proposal method and a ring specification; the rest
of the site is the planning that follows from it.

Nine sections, numbered on the site:

1. **The quiz** — multiple choice plus free text, scored in the browser, ending in a
   recommendation and a shareable plan link.
2. **Locations** — eight kinds of place, and a city lens that turns them into local searches.
3. **The trip** — destination ideas, flight and hotel hand-offs, and an outreach kit that
   drafts the email to a hotel, restaurant, venue, photographer, picnic company or charter.
4. **Who to hire** — on who to hire, what they cost and what to ask them. Searches, never a
   directory.
5. **Diamonds** — an interactive 4Cs grading bench with a live stone.
6. **The ring** — settings, metals, sizing and what a budget buys.
7. **How** — eight ways to actually do it, and who should know beforehand.
8. **What to say** — on the words themselves.
9. **When** — pick a date and work backwards into a timeline.

Plus an unnumbered **privacy page** at `#privacy`, linked from the footer and from the email
panel. It says what leaves the browser and what does not.

## What it is

Two files do the work. `public/index.html` is the whole site — all markup, styles and
JavaScript in one file. `src/index.js` is a small Cloudflare Worker that serves that file and
answers one API route. There is no build step, no package manager and no dependencies to
install.

```
wrangler.jsonc        main, assets → ./public, the LIMITER Durable Object, vars
src/index.js          the Worker: POST /api/plan-email and its rate limiter
public/index.html     the whole site
```

## Plan links

The quiz result carries a link of the form `https://justnotthering.com/#plan=<code>`. The code
is base64url JSON holding the computed axis scores and the city, if one was typed — never the
answers themselves and never the free text. Because it sits after the `#`, browsers do not
send it to any server; the page decodes it and rebuilds the same recommendation, on load and
on `hashchange`.

## The Worker route

`POST /api/plan-email` emails someone the link to the plan they just built.

Request body: `{ "email": "...", "plan": "<code>", "optIn": false }`.

The email is a fixed template. The only variable that reaches it is the plan code, which must
match `^[A-Za-z0-9_-]{8,2000}$`, so the route cannot be used to send arbitrary content. The
address and the link go to [Resend](https://resend.com) for delivery; the Worker stores
neither. If `optIn` is `true` and an audience is configured, the address is also added to
that Resend audience.

| Status | Body | Meaning |
|---|---|---|
| 200 | `{"ok":true}` | sent |
| 400 | `{"error":"bad_request" \| "bad_email" \| "bad_plan"}` | rejected before any send |
| 405 | `{"error":"method_not_allowed"}` | not a POST |
| 429 | `{"error":"rate_limited","scope":"you" \| "site","retryAfter":<seconds>,"message":"..."}` | over a limit; `message` is written to be shown as-is |
| 502 | `{"error":"send_failed"}` | Resend refused it |
| 503 | `{"error":"not_configured" \| "limiter_unavailable"}` | no API key yet, or the limiter is missing — the route fails closed |

**Rate limits.** Per network address (IPv6 counted by /64): 5 sends an hour and 20 a day.
Site-wide: a hard ceiling per 24 hours, `SEND_CEILING_PER_DAY`, default 80. Both are kept by
the `SendLimiter` Durable Object in `src/index.js`, which stores send times and nothing else
and deletes them once they age out. A slot is taken before the send, so a failing send cannot
be retried for free.

## Environment

| Name | Kind | Required | What it is |
|---|---|---|---|
| `RESEND_API_KEY` | secret | yes | Resend API key. Until it is set the route returns 503 and the rest of the site is unaffected. |
| `MAIL_FROM` | var | yes | The From header, e.g. `Just Not The Ring <hello@justnotthering.com>`. Set in `wrangler.jsonc`. |
| `SEND_CEILING_PER_DAY` | var | no | Site-wide cap on sends per 24 hours. Default 80. |
| `RESEND_AUDIENCE_ID` | var | no | Resend audience for people who tick the opt-in box. Unset, the box adds nobody to anything. |
| `PARTNER_LINE` | var | no | One line of text for the email footer. Unset, the block is omitted. |
| `PARTNER_URL` | var | no | Link shown after `PARTNER_LINE`. |
| `LIMITER` | binding | yes | The `SendLimiter` Durable Object. Declared in `wrangler.jsonc`; nothing to create by hand. |

Set the secret with `npx wrangler secret put RESEND_API_KEY`. Never commit it. For local work
it goes in `.dev.vars`, which is gitignored. In the Cloudflare dashboard it belongs under the
Worker's runtime Variables and Secrets, not its build-time variables — a key saved in the
build panel is invisible to `env` and the route keeps answering 503.

`MAIL_FROM` must be an address on a domain verified in Resend. `justnotthering.com` is
verified. Resend's shared test sender, `onboarding@resend.dev`, only delivers to the account
owner's own address, so it is no use for visitors.

## Running it locally

Open `public/index.html` in a browser. Everything except the email button works from the
file, and the button says so when it cannot reach the route.

To run the Worker as well: `npx wrangler dev`, with `RESEND_API_KEY` in `.dev.vars` if you want
it to send.

## Deploying

Deployed to Cloudflare as a Worker with static assets. `wrangler.jsonc` names `src/index.js`
as `main` and `public/` as the assets directory; requests that match a file are served from
assets, and everything else reaches the Worker. There is no build step.

Pushes to `main` redeploy automatically. To deploy by hand: `npx wrangler deploy`.

Only `index.html` belongs in `public/` — everything in that folder is served to the world.

The site itself is a single static file, so it will also run on any static host (Netlify,
Vercel, GitHub Pages) by serving `public/` as the web root. The email button will report that
it only works on justnotthering.com; everything else is unaffected.

## Two things to know

**Fonts load from Google Fonts.** Fraunces, Karla and IBM Plex Mono are fetched at
runtime, which means every visitor's browser makes a request to Google. Offline, the page
falls back to system serif and sans — still legible, slightly different. To remove the
dependency, inline the fonts as base64 `@font-face` rules (adds roughly 200KB).

**The trip planner's destination suggestions only work inside the Claude artifact viewer.**
That feature calls `window.claude.use("sample")`, which exists only when the page is served by
claude.ai. Hosted anywhere else, the page detects its absence and says so, and everything else
on the page — the quiz, the diamond bench, the budget and timeline tools, the flight and hotel
searches, the outreach email generator — works normally, since all of it runs locally in the
browser. To get AI suggestions on your own domain, add a second route to `src/index.js` that
calls an LLM API with your own key, and have the page call that route instead of
`window.claude`. Quiz free-text answers must stay out of it.

## Structure

The site lives in `public/index.html`:

- **Styles** — CSS custom properties on `:root`, redefined for dark mode under both
  `prefers-color-scheme` and `[data-theme="dark"]`. Change the palette in one place.
- **Routing** — `showView()` plus `popstate` and `hashchange`; each section is a `.view` and
  only one is visible at a time. `VIEWS` lists them; `privacy` is in the list but not the nav.
- **Data** — `SHAPES`, `CUTS`, `COLORS`, `CLARITY` drive the diamond bench and its live SVG.
- **Quiz** — `Q` holds the questions and their axis weights; `LEXICON` scores free-text
  answers; `composeResult()` assembles the recommendation; `planLink()` and
  `applyPlanHash()` write and read `#plan=` links.
- **Trip** — link builders for the booking hand-offs; `buildNote()` holds the outreach
  templates.
- **Hire** — `HIRE_TERMS` and `renderHire()` build the local searches.

The Worker lives in `src/index.js`: the `fetch` handler, `handlePlanEmail()`, the rate limiter
(`checkLimits()` and the `SendLimiter` class) and the email template in `sendMail()`.

## A note on the content

Grading standards referenced are GIA's. Where a price figure has a source it is cited and
linked; the rest are labelled orientation ranges, not quotes, and they move with the market.
The site is a planning guide, not a jeweler or an appraiser.
