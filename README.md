# Just Not The Ring

An engagement planning site, live at [justnotthering.com](https://justnotthering.com). A
relationship quiz produces a location, a proposal method and a ring specification; the rest
of the site is the planning that follows from it.

Nine sections, numbered on the site, each its own page (`/quiz/`, `/locations/`, `/trip/`,
`/hire/`, `/diamonds/`, `/rings/`, `/how/`, `/words/`, `/when/`):

1. **The quiz** — multiple choice plus free text, scored in the browser, ending in a
   recommendation and a shareable plan link.
2. **Locations** — sixteen kinds of place, and a city lens that turns them into local searches.
3. **The trip** — destination ideas, flight and hotel hand-offs, and an outreach kit that
   drafts the email to a hotel, restaurant, venue, photographer, picnic company or charter.
4. **Who to hire** — on who to hire, what they cost and what to ask them. Searches, never a
   directory.
5. **Diamonds** — an interactive 4Cs grading bench with a live 3D stone, side-on and face-up.
6. **The ring** — a ring you can build and turn over, then settings, metals, sizing and what a
   budget buys.
7. **How** — six ways to actually do it, six ways it is remembered, and who should know
   beforehand.
8. **What to say** — on the words themselves.
9. **When** — pick a date and work backwards into a timeline.

Plus an unnumbered **privacy page** at `/privacy/`, linked from the menu, the footer and the
email panel. It says what leaves the browser and what does not.

And an unnumbered **stories section** at `/stories/`: real proposals told by the people who
planned them, one static page each, with a preview card for sharing. Unnumbered because the
nine sections are decisions and a story is not one.

## What it is

Plain files. Each section is a page under `public/`, sharing one stylesheet
(`public/assets/styles.css`) and a few scripts (`public/assets/*.js`). `src/index.js` is a
small Cloudflare Worker that serves `public/` and answers two API routes. There is no build
step, no package manager and no dependencies to install; the header and footer are repeated in
every page by hand, and the verifier fails when one copy drifts.

```
wrangler.jsonc                main, assets → ./public, the LIMITER Durable Object, vars
src/index.js                  the Worker: POST /api/plan-email, /api/unsubscribe, the rate limiter
public/index.html             home
public/<section>/index.html   quiz, locations, trip, hire, diamonds, rings, how, words, when, privacy
public/404.html               the not-found page
public/assets/                styles.css, app.js, gem.js, data.js, quiz.js, trip.js, lens.js,
                              hire.js, timeline.js, budget.js, fonts/
public/robots.txt, sitemap.xml
public/stories/               index.html, stories.css, one <slug>.html per story, img/, og/
tools/                        check-stories.mjs (verifier), og-card.mjs, story-template.html
```

Until September 2026 the whole tool was one file, `public/index.html`, routing on the `#`.
Addresses from then still work: the home page moves `/#diamonds` to `/diamonds/` and
`/#plan=…` to `/quiz/#plan=…`.

## Plan links

The quiz result carries a link of the form `https://justnotthering.com/quiz/#plan=<code>`. The code
is base64url JSON with four fields: `t`, the computed axis scores; `k`, the fixed ids of the
boxes ticked on the final step, plus `stone.<id>` if a stone was picked; `o`, any location,
method, capture (how it is remembered) or spec changed by hand on the result; and `c`, the city,
if one was typed. Never the answers themselves and never the free text. Every id in `k` and `o`
is checked against the page's own lists on read, and anything unrecognised is dropped. Because
it sits after the `#`, browsers do not send it to any server; the quiz page decodes it and
rebuilds the same recommendation, on load and on `hashchange`. It must stay a fragment, never a
query string. `/quiz#plan=…` (no slash) and the old `/#plan=…` both arrive at the same page
with the fragment intact.

## The Worker routes

`POST /api/plan-email` emails someone the link to the plan they just built.

Request body: `{ "email": "...", "plan": "<code>", "optIn": false }`.

The email is a fixed template. The only variable that reaches it is the plan code, which must
match `^[A-Za-z0-9_-]{8,2000}$`, so the route cannot be used to send arbitrary content. The
address and the link go to [Resend](https://resend.com) for delivery; the Worker stores
neither. If `optIn` is `true` and `RESEND_AUDIENCE_ID` is set, the address is first added as
a Resend contact in that segment, and the email then says so and carries an unsubscribe link
and `List-Unsubscribe` headers. If the add fails or no segment is configured, the email says
the address is on no list — the footer states what happened, not what was ticked.

The message has no images and loads no fonts, so opening it reports nothing to anyone; the
link is the bare plan URL. The HTML and plain-text bodies are rendered from one list of blocks
in `src/index.js`, so they cannot drift apart. Resend's open and click tracking must stay off.

`/api/unsubscribe?c=<contact id>` takes an address off that list. `GET` shows a confirmation
page and changes nothing (link scanners follow GETs); `POST` marks the contact unsubscribed
with Resend and is idempotent. Mail clients' one-click unsubscribe POSTs here too. The id is
the opaque UUID Resend assigned to the contact — the address never appears in the URL — and
anything that is not a UUID is rejected before Resend is called. The page path is
rate-limited per network address, 10 an hour and 40 a day; one-click POSTs come from the
mail provider's servers, so they share one site-wide bucket, 300 an hour, instead. Unlike
the send route this one fails open: with the limiter missing or broken the unsubscribe still
goes through, because a person must always be able to leave the list.

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
| `RESEND_AUDIENCE_ID` | var | no | Id of the Resend segment (formerly "audience") for people who tick the opt-in box. Unset, the box adds nobody to anything and every email says so. |
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

`npx wrangler dev`, then open the address it prints. That runs the Worker and serves `public/`
with the same URL rules as production (`/diamonds` redirecting to `/diamonds/`, the 404 page),
with `RESEND_API_KEY` in `.dev.vars` if you want it to send. If wrangler's local runtime is
older than the `compatibility_date` in `wrangler.jsonc`, add `--compatibility-date` with an
earlier date on the command line rather than editing the file.

The pages link their stylesheet and scripts by site-absolute path (`/assets/…`), so opening a
file straight from disk no longer works; any static server pointed at `public/` does
(`python3 -m http.server` inside it), without the email route.

## Deploying

Deployed to Cloudflare as a Worker with static assets. `wrangler.jsonc` names `src/index.js`
as `main` and `public/` as the assets directory; requests that match a file are served from
assets, and everything else reaches the Worker. There is no build step.

Pushes to `main` redeploy automatically. To deploy by hand: `npx wrangler deploy`.

Everything in `public/` is served to the world; `node tools/check-stories.mjs` fails on any file
there it does not expect. `html_handling` is `auto-trailing-slash`: a section is served at
`/diamonds/` and `/diamonds` redirects to it, story URLs are extensionless (`/stories/<slug>`)
and the `.html` form redirects to the short one, and an unknown path gets `public/404.html`.

The site itself is static files, so it will also run on any static host (Netlify, Vercel,
GitHub Pages) by serving `public/` as the web root. The email button will report that
it only works on justnotthering.com; everything else is unaffected.

## Two things to know

**Nothing is loaded from another site.** The three typefaces (Newsreader, Geist, Geist Mono)
are woff2 files under `public/assets/fonts/`, with their Open Font License beside them, and
the 3D stones are drawn in the browser by `gem.js`, which needs WebGL2 and falls back to a
drawn gold-line stone without it. A page load makes no request to anyone but this site, the
privacy page says so, and the verifier fails if a font service, CDN or analytics tag appears.

**The trip planner's destination suggestions only work inside the Claude artifact viewer.**
That feature calls `window.claude.use("sample")`, which exists only when the page is served by
claude.ai. Hosted anywhere else, the page detects its absence and says so, and everything else
on the site — the quiz, the diamond bench, the budget and timeline tools, the flight and hotel
searches, the outreach email generator — works normally, since all of it runs locally in the
browser. To get AI suggestions on your own domain, add a second route to `src/index.js` that
calls an LLM API with your own key, and have `assets/trip.js` call that route instead of
`window.claude`. Quiz free-text answers must stay out of it.

## Structure

- **Styles** — `assets/styles.css`. CSS custom properties on `:root`, one light look
  (`color-scheme:light`; there is no dark scheme, by choice). Change the palette in one place.
- **Shared behaviour** — `assets/app.js`: motion (`data-motion` is `cinematic`, or `calm` when
  the device asks for reduced motion), the menu, the home page's travelling stone, the diamond
  bench (`renderBench()`) and the ring builder (`renderRing()`). Page-to-page transitions use
  the View Transitions API; the opt-in is inline in each page's `<head>`.
- **The stones** — `assets/gem.js`, a ray-traced renderer. Any `<canvas data-gem>` is picked
  up and re-reads its `data-*` attributes when they change; the bench and the ring builder
  draw by writing their state onto those attributes.
- **Data** — `assets/data.js`: `SHAPES`, `CUTS`, `COLORS`, `CLARITY` for the bench; `Q`, `SAID`,
  `STONES`, `LEXICON` and the location, method and capture libraries for the quiz.
- **Quiz** — `assets/quiz.js`: `tally()` and `scoreText()` score the answers;
  `composeResult()` assembles the recommendation; `planLink()` and `applyPlanHash()` write and
  read `#plan=` links. The home page's question-one tile hands the tapped option's index to
  the quiz page through `sessionStorage` (`jntr-q1`), read once and removed; nothing typed is
  ever stored.
- **Trip** — `assets/trip.js`: link builders for the booking hand-offs; `buildNote()` holds the
  outreach templates.
- **Locations, hire, when, budget** — `lens.js`, `hire.js`, `timeline.js`, `budget.js`, one
  small file each. The quiz result links to `/locations/#lens=…&city=…` so the city lens
  opens on the quiz's answer; like a plan link, that travels in the fragment only.

The Worker lives in `src/index.js`: the `fetch` handler, `handlePlanEmail()`, the rate limiter
(`checkLimits()` and the `SendLimiter` class), the email — colour tokens `TOKENS`, block
renderers `B`, the frame `shell()`, `planEmail()` and `sendMail()` — and `handleUnsubscribe()`.

## Stories

`public/stories/` is hand-written HTML on the site's stylesheet plus `stories.css`, with only
the shared `app.js` (menu and motion), so every story has its own URL and its own preview card
when shared. Each page carries a title, meta
description, Open Graph and Twitter tags, a canonical link and a JSON-LD Article. A story with
a photograph uses it (1600x900) as hero, index card and preview; a story with none uses the
site's blue-hour panel with the pull-quote over it, and a 1200x630 version of that panel made
by `tools/og-card.mjs` with headless Chrome.

Every story is real, told by the people it happened to, and published with written agreement
from both of them. Nothing is composed, merged or written to fill a slot. With no stories yet
the index shows a written empty state. To add one, copy `tools/story-template.html`, follow the
comments in it, and run `node tools/check-stories.mjs` before committing.

## A note on the content

Grading standards referenced are GIA's. Where a price figure has a source it is cited and
linked; the rest are labelled orientation ranges, not quotes, and they move with the market.
The site is a planning guide, not a jeweler or an appraiser.
