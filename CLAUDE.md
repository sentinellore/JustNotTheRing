# CLAUDE.md

Guidance for AI agents working in this repo.

## What this is

A small static website plus one small Worker. Each of the nine sections is its own page under
`public/`, with one shared stylesheet and a handful of plain scripts under `public/assets/`.
`src/index.js` is the Worker: it serves `public/` and answers two API routes. `public/stories/`
is the stories section: hand-written pages on the same stylesheet. There is no build step, no
bundler, no package.json and no dependencies.

```
.gitignore
CLAUDE.md                     this file
README.md
wrangler.jsonc                main, assets → ./public, the LIMITER Durable Object, vars
src/index.js                  the Worker: POST /api/plan-email, /api/unsubscribe, the rate limiter
public/index.html             home: the hero, the nine tiles, question one, old-link redirects
public/quiz/index.html        the quiz, its result, the plan link, the email panel
public/locations/ trip/ hire/ diamonds/ rings/ how/ words/ when/ privacy/   one index.html each
public/404.html               served for any unknown path (wrangler not_found_handling)
public/assets/styles.css      the one stylesheet: tokens, type, every component
public/assets/app.js          motion, menu, travelling stone, diamond bench, ring builder
public/assets/gem.js          the 3D stone renderer (WebGL2); the designer's file, unchanged, pinned by hash in the verifier
public/assets/data.js         SHAPES, CUTS, COLORS, CLARITY, Q, SAID, STONES, LEXICON, the libraries
public/assets/quiz.js         the quiz engine: scoring, composeResult(), plan links, the email panel
public/assets/trip.js lens.js hire.js timeline.js budget.js   one feature each
public/assets/fonts/          Newsreader, Geist, Geist Mono (woff2) and their licence
public/robots.txt             Cloudflare merges its managed content-signals block above it
public/sitemap.xml            hand-written; one entry per page and per story
public/stories/index.html     the story cards, or the written empty state
public/stories/stories.css    what only a story needs; loaded after styles.css, defines no tokens
public/stories/<slug>.html    one file per story
public/stories/img/<slug>.jpg the photograph, where there is one (1600x900, under ~250KB)
public/stories/og/<slug>.png  the 1200x630 preview card for a story with no photograph
tools/check-stories.mjs       the verifier; run before every commit that touches public/
tools/og-card.mjs             makes an og/<slug>.png with headless Chrome
tools/story-template.html     copy this to start a story
preview/wrangler.jsonc        a throwaway Worker, justnotthering-preview on workers.dev, for testing a branch
preview/worker.js             its entry: the production Worker plus X-Robots-Tag: noindex on every response
```

Everything in `public/` is served to the world. The verifier fails on any file there that is
not on its list, including a stray `.DS_Store`. Templates and tools live in `tools/`. A design
handoff (`design/`) is reference material: never copy it into `public/`.

Each page loads only the scripts it needs, in order: `data.js` before whatever reads it,
`app.js` last. The verifier knows the list per page.

## Hard constraints

**Do not reformat, prettify or minify the pages, the stylesheet or the scripts.** They are
deliberately hand-formatted. Make targeted edits; never run a formatter over them.

**Do not add a build system**, package.json, bundler, framework or CI workflow. If a change
seems to require one, stop and ask first — that is an architecture decision, not a detail.

**Never remove the document wrapper.** Every HTML file in `public/` must keep, in this order
at the top: `<!doctype html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, and
the viewport meta (with `viewport-fit=cover`). Without the charset, every em dash and arrow on
the deployed site renders as mojibake (`â€"`), because Cloudflare does not send a charset
header. This has broken once already. Each page also carries `<meta name="color-scheme"
content="light">`, its own `<title>`, meta description and canonical URL.

**The header, the menu and the footer are the same block on every page, copied by hand.**
That is the cost of no build step, and it is accepted. Change the navigation on one page and
you change it on all of them, the 404 page, the stories index and `tools/story-template.html`
included. The verifier compares them with `aria-current` taken out and fails when one differs.
Mark the current page with `aria-current="page"` in both the bar and the menu.

**URLs are the form that is served.** `html_handling` is `auto-trailing-slash`, so a folder
page lives at `/diamonds/` and `/diamonds` redirects to it; both load. Canonicals, nav links
and the sitemap all use the trailing slash, so a click never costs a redirect. Stories are
single files and are served without `.html`.

**Old links must keep working.** The site used to be one page that routed on the `#`. The home
page moves `/#diamonds`-style addresses to the new pages and `/#plan=…` to `/quiz/#plan=…`
with `location.replace`. Do not remove that script.

**The single-file rule is retired, recorded (30 September 2026).** Until the Dusk Gallery
redesign the whole tool was `public/index.html`, kept identical to a Claude artifact copy but
for its wrapper, and this file forbade splitting it. The redesign made it one page per section
so each has its own URL, title and description. The Claude artifact is now a separate
multi-file prototype and is **not** kept in lockstep: an agent working in this repo does not
update it and should not flag it as out of date. Nothing in `public/` is generated from
anything else.

**Commit as `swetharozario@alexandriteevents.com`.**

**Run `node tools/check-stories.mjs` before committing anything under `public/`.** It has no
dependencies. It kept its name from when it checked only the stories; it now checks the whole
site: the wrapper on every page, that the header and footer match everywhere, that every link
and script resolves (links written by the scripts included), that every design token used is
defined, that the home page's question-one tile reads as `data.js` does, the sitemap, the
Worker's plan link, and for stories the og tags, images and the two tags against the quiz's
libraries. It also keeps three short lists and fails on anything outside them: the outside
hosts the site may name, the one `fetch`, and the two storage keys. Those are tripwires that
read source text, not proofs; they catch the ordinary ways a tracker or a new request gets
added, not a determined one. A failed line here is what a skipped manual step looks like.

## Deploying

Cloudflare Workers: static assets from `public/`, plus a `main` at `src/index.js` serving two
routes, `POST /api/plan-email` and `/api/unsubscribe`. Any push to `main` redeploys automatically. Manual deploy:
`npx wrangler deploy`. Secrets (`RESEND_API_KEY`) are set with `wrangler secret put` and never
committed; the README lists the full environment.

**To put a branch in front of real phones before it merges**, deploy the preview Worker, never
production: `npx wrangler deploy --config preview/wrangler.jsonc`, and remove it afterwards
with `npx wrangler delete --config preview/wrangler.jsonc`. It is a separate Worker with its
own name and limiter and no secrets, so its email route answers 503 and it can send nothing;
every response carries `X-Robots-Tag: noindex`. `wrangler versions upload` gives no preview
URL here, because Cloudflare makes none for a Worker that implements a Durable Object.
Deploying it creates something public in the owner's Cloudflare account: ask first.

**The Cloudflare dashboard has two separate variable panels for this Worker: build-time and
runtime.** Anything the code reads through `env` must be in the runtime one (Settings →
Variables and Secrets), not under the build settings. A secret saved in the build panel looks
present in the dashboard while `env.RESEND_API_KEY` is `undefined` at request time, and the
route answers 503 `not_configured`. This cost an afternoon. To check from outside without
sending mail: `POST /api/plan-email` with body `{}` returns 503 while the key is missing and
400 `bad_email` once it is there.

## Content rules

These are what make the site trustworthy. Preserve them.

- **Every story is real**, told by the people it happened to, and published with written
  agreement from both of them. Nothing composed, nothing merged from several couples,
  nothing written to fill a slot. One invented story makes every other one unbelievable. If
  there are no real stories, the index ships with its written empty state, never examples.
  Photographers contribute their own stories, not their clients'. The provenance line on
  every stories page states this rule; keep it.
- **A story's two tags are the quiz's own wording.** `data-loc` and `data-capture` carry ids
  from `LOC_LIB` and `CAPTURE_LIB` in `assets/data.js`; the visible text is the library's `h`
  string, verbatim. The ids are what the quiz result will join on when stories appear beside
  the archetype they demonstrate. Not built yet; do not make it expensive.
- **Stories have no contact address yet.** `hello@justnotthering.com` has no MX records.
  The "tell us yours" copy and its mailto land in one later commit with any privacy-page
  change they need, once Cloudflare Email Routing is live. Until then the verifier fails on
  `hello@` anywhere under `public/stories/`.

- **Never invent prices, fares, availability or inventory.** Every figure the site shows is
  one of two things, and the page always makes clear which: (a) sourced — traceable to a
  cited, linked source, or (b) the site's own orientation estimate, labelled in the UI as an
  estimate and never as a quote. A figure that is neither does not ship. Flights, hotels and
  vendor availability are always (a) or a hand-off to the vendor; the site never states its
  own number for those.
- **Keep stated limitations visible in the UI.** The free-text quiz answers tell the reader
  they are keyword-matched and to trust themselves over the result. AI suggestions say who
  wrote them and to verify seasons independently. Do not quietly remove these.
- **Diamond grading follows GIA standards** throughout. Do not mix in other scales.

## Privacy

Everything runs in the browser EXCEPT two routes, and nothing is loaded from any other site:
the fonts are files under `public/assets/fonts/`. Adding an outside host, a second `fetch`, a
beacon or a storage key fails the verifier until its list is changed, and its list changes
only in the commit that changes the privacy page. (Analytics switched on in the Cloudflare
dashboard would inject a script the repo never sees; that would make the privacy page false
just the same.) `POST /api/plan-email` receives an email
address and a validated plan code, hands them to Resend to deliver one message, and stores
neither. `/api/unsubscribe` receives an opaque Resend contact id — never an address — and on
`POST` marks that contact unsubscribed; a `GET` only shows the confirmation page and changes
nothing, because link scanners follow GETs. Both routes are rate-limited: the limiter keeps
request times per network address for up to 24 hours — never an email address, never a plan.
There are no analytics, no cookies and no database of users.

The email itself carries the plan link and nothing decoded from it — the Worker never reads
the plan, so it cannot put the city in a message that may sit in a shared inbox. It has no
images and loads no fonts (an image in an email is an open-tracking pixel), and the link is
the bare plan URL with no redirect. Resend's open and click tracking must stay off for the
domain; either would contradict the privacy page. HTML and text bodies are rendered from one
block list in `src/index.js`; edit the block, never one rendering.

**QUIZ FREE-TEXT ANSWERS NEVER LEAVE THE BROWSER.** They are intimate by nature — people
describing their partner. Not to this Worker, not to a third party, not in a URL, not in an
email, not in a log. Nothing that transmits or stores them is acceptable, for any reason, and
no feature is worth an exception. The plan code carries scores and a city, never the text. If
a change seems to need them server-side, stop and ask.

**Not in storage either.** Answers and typed text live in the page's memory and nowhere
else. The site stores exactly two things, both in `sessionStorage`, so both are one tab's and
go when it closes:

- `jntr-plan` — the plan a result came to: the same string the share link carries after
  `#plan=` (scores, closed-vocabulary ids, the city), never an answer and never free text.
  Written whenever a result is shown or adjusted, read when `/quiz/` loads with no `#plan=`
  fragment, removed by "Start over" and by starting again from the home page's tile. It is
  read back through `readPlanCode()`, the same checks a link gets. Decided 1 October 2026,
  so a result survives a look at another page.
- `jntr-q1` — the index (0 to 4) of the option tapped on the home page's question-one tile,
  removed as the quiz reads it.

**Never write the plan into the address bar.** A `#plan=` put there by the page would sit in
browser history, and history on a shared laptop is how a surprise gets found. A plan reaches
the address only when a person opens a link. Never carry typed text between pages. Anything
else that must cross pages goes in a URL fragment, the way the plan link and the result's
link to Locations (`/locations/#lens=…&city=…`) do, because a fragment is never sent in a
request. Never a query string. A third stored thing, or a longer-lived one (`localStorage`,
a cookie), is a privacy-page decision: stop and ask.

The two boxes people describe their partner in carry `spellcheck="false"`, because some
browsers' spellcheckers send what is typed to their maker.

The site has a privacy page at `/privacy/` — unnumbered, linked from the menu's foot, the
footer and the email panel, and deliberately not one of the nine in the nav. **Any change to
what the code transmits or stores, or to whom, requires a matching edit to that page in the
same commit.**

## Making changes

- **One light look.** Colours are CSS custom properties on `:root` in `assets/styles.css`, and
  that is the only place a token is defined: porcelain ground, sapphire (`#1E3A5F`, `#2F5480`),
  champagne gold for numbers and stamps, peach on the night band. There is no dark scheme, by
  choice: `:root` declares `color-scheme:light`, so a dark-mode device still draws light form
  controls. Change tokens, not individual rules.
- Fonts: Newsreader (display), Geist (body), Geist Mono (labels and grades), self-hosted.
- Build new sections from the existing components: `.pagehead`, `.prose-grid`, `.steps`,
  `.callout`, `.cards5`, `.card`, `.panel`, `.table-wrap`, `.quotes`, `.pager`, `.tags`.
- **Motion is cinematic for everyone, calm for reduced motion.** `app.js` sets `data-motion`
  on `<html>`; there is no switch. Headings use `data-words`. Sections with `data-reveal` rise
  in; nothing may be left invisible at rest. The page-transition opt-in
  (`@view-transition{navigation:auto}`) is inline in every page's `<head>`, not in the
  stylesheet: declared in the stylesheet, Chrome dropped about half the transitions in
  testing. Only one element per page may hold `view-transition-name: stone`.
- Check any visual change at 390px width as well as desktop, with reduced motion on, and on a
  dark-mode device. On the diamonds and rings pages the stone must stay in view on a phone
  while the controls are used (the sticky strips in `styles.css`). Without WebGL2 the stone
  is a fixed drawing, and the pages say so (`data-nogl`); without script the bar shows its
  links (`<noscript>` in every head).
- Key structures: `Q` and `LEXICON` (in `data.js`) drive the quiz; `composeResult()` in
  `quiz.js` builds the recommendation; `planLink()` and `readPlanFromUrl()` write and read
  `#plan=`; `renderBench()` and `renderRing()` in `app.js` write state onto the `gem.js`
  canvases through `data-*` attributes; `buildNote()` in `trip.js` holds the venue outreach
  templates.
- **When a result has several parts and the UI says changing one moves the rest, test that
  claim directly.** Three times the same bug has shipped in the quiz result: dimensions that
  compose in real life (place, occasion, how it is remembered) were ranked as if independent,
  and a control that promised to move the whole plan moved only part of it. Override each
  control in turn and check every other card actually changes, with a strongly-weighted
  profile as well as a neutral one; a nudge that moves a neutral tally can be too small to
  move a decided one. And when a weight is added by id or key, confirm something reads that
  key, or the code will describe an influence the output never shows.

## Adding a story

1. Copy `tools/story-template.html` to `public/stories/<slug>.html` and fill every token.
   The URL is `/stories/<slug>`, no `.html`: Cloudflare serves the file at the short form
   and redirects the long one, so canonical, og:url and the sitemap use the short form.
2. Photograph: `img/<slug>.jpg` at 1600x900, under about 250KB. It is the hero, the index
   card and the og:image. No photograph: `node tools/og-card.mjs <slug> <dusk|dawn|noon>
   "<quote>"` makes `og/<slug>.png`, and the page uses the blue-hour panel. That panel is a
   first-class state, not a fallback: "nothing at all" is one of the six capture options.
3. Add the card to `public/stories/index.html` (delete the empty state if it is the first),
   add the URL to `public/sitemap.xml`, run the verifier, look at the page at 390px and on
   desktop.

## Known gap

The trip planner's AI destination suggestions (`assets/trip.js`) call
`window.claude.use("sample")`, which only exists inside the Claude artifact viewer. On the live site the page detects its absence and
degrades gracefully. Making it work here means adding a Worker endpoint — see the project
notes, which live outside this repo.
