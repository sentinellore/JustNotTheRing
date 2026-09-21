# Just Not The Ring

An engagement planning site: a relationship quiz that produces a location, a proposal method
and a ring specification; an interactive 4Cs grading bench; a trip planner; and a venue
outreach kit.

## What it is

One file. `public/index.html` contains all markup, styles and JavaScript. There is no build
step, no package manager, no server code and no dependencies to install.

## Running it locally

Open `public/index.html` in a browser. That's it.

## Deploying

Deployed to Cloudflare as a Worker with static assets. `wrangler.jsonc` points at
`public/`, there is no `main` entry and no build step — Cloudflare uploads the
directory and serves it.

Pushes to `main` redeploy automatically. To deploy by hand: `npx wrangler deploy`.

The site is a single static file, so it will also run on any other static host
(Netlify, Vercel, GitHub Pages) by serving `public/` as the web root.

## Two things to know

**Fonts load from Google Fonts.** Fraunces, Karla and IBM Plex Mono are fetched at
runtime. On a live site this is fine. Offline, the page falls back to system serif and sans —
still legible, slightly different. To remove the dependency, inline the fonts as base64
`@font-face` rules (adds roughly 200KB).

**The trip planner's destination suggestions only work inside the Claude artifact viewer.**
That feature calls `window.claude.use("sample")`, which exists only when the page is served by
claude.ai. Hosted anywhere else, the page detects its absence and says so, and everything else
on the page — the quiz, the diamond bench, the budget and timeline tools, the flight and hotel
searches, the outreach email generator — works normally, since all of it runs locally in the
browser. To get AI suggestions on your own domain, add a Worker function to this project — the
site is already on Cloudflare Workers, so that means a `main` entry in `wrangler.jsonc` alongside
the static assets. The function calls an LLM API with your own key, and the page calls the
function instead of `window.claude`.

## Structure

Everything lives in `public/index.html`:

- **Styles** — CSS custom properties on `:root`, redefined for dark mode under both
  `prefers-color-scheme` and `[data-theme="dark"]`. Change the palette in one place.
- **Routing** — `showView()` plus `hashchange`; each section is a `.view` and only one is
  visible at a time.
- **Data** — `SHAPES`, `CUTS`, `COLORS`, `CLARITY` drive the diamond bench and its live SVG.
- **Quiz** — `Q` holds the questions and their axis weights; `LEXICON` scores free-text
  answers; `composeResult()` assembles the recommendation.
- **Trip** — link builders for the booking hand-offs; `buildNote()` holds the outreach
  templates.

## A note on the content

Grading standards referenced are GIA's. Price figures are orientation ranges, not quotes, and
they move with the market. The site is a planning guide, not a jeweler or an appraiser.
