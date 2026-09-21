# CLAUDE.md

Guidance for AI agents working in this repo.

## What this is

A single-file static website. `public/index.html` contains the entire site — markup, CSS and
JavaScript in one file, roughly 2,500 lines. There is no build step, no bundler, no
package.json and no dependencies. Cloudflare uploads `public/` and serves it.

```
.gitignore
CLAUDE.md             this file
README.md
wrangler.jsonc        name, compatibility_date, assets → ./public
public/index.html     the whole site
```

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

Cloudflare Workers, static assets only, no `main` entry. Any push to `main` redeploys
automatically. Manual deploy: `npx wrangler deploy`.

## Content rules

These are what make the site trustworthy. Preserve them.

- **Never invent prices, fares, availability or inventory.** The site shows no numbers of its
  own for these. The trip planner links out to Google Flights and Booking.com with dates
  pre-filled and says plainly that it has no connection to those sites. Budget figures are
  labelled orientation ranges, not quotes.
- **Keep stated limitations visible in the UI.** The free-text quiz answers tell the reader
  they are keyword-matched and to trust themselves over the result. AI suggestions say who
  wrote them and to verify seasons independently. Do not quietly remove these.
- **Diamond grading follows GIA standards** throughout. Do not mix in other scales.

## Privacy

Everything runs in the browser. Nothing a user types is sent anywhere — no analytics, no
backend, no storage. Quiz free-text answers are intimate by nature (people describing their
partner).

**Never add code that transmits or stores quiz answers.** If a backend is added for any
reason, that is a deliberate decision requiring a privacy policy, and the free-text answers
stay out of it regardless.

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
