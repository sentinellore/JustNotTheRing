# CLAUDE.md

Guidance for AI agents working in this repo.

## What this is

A single-file website plus one small Worker. `public/index.html` contains the entire site —
markup, CSS and JavaScript in one file, roughly 3,000 lines. `src/index.js` is the Worker: it
serves `public/` and answers one API route. There is no build step, no bundler, no
package.json and no dependencies.

```
.gitignore
CLAUDE.md             this file
README.md
wrangler.jsonc        main, assets → ./public, the LIMITER Durable Object, vars
src/index.js          the Worker: POST /api/plan-email and its rate limiter
public/index.html     the whole site
```

Only `index.html` belongs in `public/` — everything in that folder is served to the world.

## Hard constraints

**Do not reformat, prettify or minify `public/index.html`.** It is deliberately one file and
deliberately hand-formatted. Make targeted edits; never run a formatter over it.

**Do not add a build system**, package.json, bundler, framework or CI workflow. If a change
seems to require one, stop and ask first — that is an architecture decision, not a detail.

**Never remove the document wrapper.** The file must keep, in this order at the top:
`<!doctype html>`, `<html lang="en">`, `<head>`, `<meta charset="utf-8">`, and the viewport
meta. Without the charset, every em dash and arrow on the deployed site renders as mojibake
(`â€"`), because Cloudflare does not send a charset header. This has broken once already.

**A parallel copy exists as a Claude artifact**, and it must NOT have that wrapper — the
Claude viewer supplies its own `<head>`. The two files are otherwise identical. The artifact
copy is generated from this file by stripping the wrapper, and is maintained by Claude in the
project chat. An agent working in this repo does not need to update it and should not flag it
as out of date.

**Commit as `swetharozario@alexandriteevents.com`.**

## Deploying

Cloudflare Workers: static assets from `public/`, plus a `main` at `src/index.js` serving one
route, `POST /api/plan-email`. Any push to `main` redeploys automatically. Manual deploy:
`npx wrangler deploy`. Secrets (`RESEND_API_KEY`) are set with `wrangler secret put` and never
committed; the README lists the full environment.

## Content rules

These are what make the site trustworthy. Preserve them.

- **Never invent prices, fares, availability or inventory.** Every figure the site shows
  traces to a cited, linked source, and where no figure can be sourced the page makes an
  observation instead of a claim. The trip planner links out to Google Flights and Booking.com
  with dates pre-filled and says plainly that it has no connection to those sites. Budget
  figures are labelled orientation ranges, not quotes.
- **Keep stated limitations visible in the UI.** The free-text quiz answers tell the reader
  they are keyword-matched and to trust themselves over the result. AI suggestions say who
  wrote them and to verify seasons independently. Do not quietly remove these.
- **Diamond grading follows GIA standards** throughout. Do not mix in other scales.

## Privacy

Everything runs in the browser EXCEPT `POST /api/plan-email`, which receives an email address
and a validated plan code, hands them to Resend to deliver one message, and stores neither.
The route is rate-limited: the limiter keeps send times per network address for up to 24
hours — never an email address, never a plan. There are no analytics, no cookies and no
database of users.

**QUIZ FREE-TEXT ANSWERS NEVER LEAVE THE BROWSER.** They are intimate by nature — people
describing their partner. Not to this Worker, not to a third party, not in a URL, not in an
email, not in a log. Nothing that transmits or stores them is acceptable, for any reason, and
no feature is worth an exception. The plan code carries scores and a city, never the text. If
a change seems to need them server-side, stop and ask.

The site has a privacy page at `#privacy` — an unnumbered view, in `VIEWS` but deliberately not
in the nav. **Any change to what the code transmits, or to whom, requires a matching edit to
that page in the same commit.**

## Making changes

- Colours are CSS custom properties on `:root`, redefined under both
  `@media (prefers-color-scheme: dark)` and `:root[data-theme="dark"]`. The palette is
  blue-hour: warm off-white ground, sapphire accent (`#2F5480`), deep navy (`#1E3A5F`) and
  champagne gold for section numbers — those are the light-mode values; dark mode redefines
  each token. Change tokens, not individual rules. Every new colour needs a definition in all
  three places.
- Fonts: Fraunces (display), Karla (body), IBM Plex Mono (data and labels).
- Check any visual change at 390px width as well as desktop, and in both light and dark.
- Key structures: `showView()` for routing; `SHAPES`/`CUTS`/`COLORS`/`CLARITY` drive the
  diamond bench; `Q` and `LEXICON` drive the quiz; `composeResult()` builds the
  recommendation; `buildNote()` holds the venue outreach templates.

## Known gap

The trip planner's AI destination suggestions call `window.claude.use("sample")`, which only
exists inside the Claude artifact viewer. On the live site the page detects its absence and
degrades gracefully. Making it work here means adding a Worker endpoint — see the project
notes, which live outside this repo.
