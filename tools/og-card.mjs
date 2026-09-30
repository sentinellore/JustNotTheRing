#!/usr/bin/env node
/* Makes the 1200x630 preview card for a story with no photograph: the blue-hour panel from
   stories.css with the pull-quote over it, rendered by headless Chrome and written to
   public/stories/og/<slug>.png. No dependencies. Run by hand when a story is added;
   tools/check-stories.mjs fails until the file exists.

     node tools/og-card.mjs <slug> <dusk|dawn|noon> "<pull-quote>"
     node tools/og-card.mjs default dusk            (the index's own card, no quote)

   Set CHROME to the browser binary if it is not at the usual macOS path. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const CSS = path.join(ROOT, "public/stories/stories.css");
const OUT_DIR = path.join(ROOT, "public/stories/og");
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const [slug, hour = "dusk", quote = ""] = process.argv.slice(2);
if (!slug || !/^[a-z0-9-]+$/.test(slug)) die("usage: og-card.mjs <slug> <dusk|dawn|noon> \"<quote>\"");
if (!["dusk", "dawn", "noon"].includes(hour)) die("hour must be dusk, dawn or noon");
if (slug !== "default" && !quote) die("a story card needs the pull-quote");
if (!fs.existsSync(CHROME)) die("Chrome not found at " + CHROME + " (set CHROME=)");

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const DIAMOND = '<svg viewBox="0 0 200 200" fill="none" aria-hidden="true"><circle cx="100" cy="100" r="78" stroke="#F0DCA8" stroke-width="1.7"/><circle cx="100" cy="100" r="54" stroke="#F0DCA8" stroke-width="1.5" stroke-opacity=".95"/><circle cx="100" cy="100" r="33" stroke="#EAF2FD" stroke-width="1.5" stroke-opacity=".95"/><path d="M100 22v55M155 59l-39 27M178 100h-55M155 141l-39-27M100 178v-55M45 141l39-27M22 100h55M45 59l39 27" stroke="#F0DCA8" stroke-width="1.4" stroke-opacity=".92" stroke-linecap="round"/><path d="M64 50l36 25 36-25M64 150l36-25 36 25" stroke="#EAF2FD" stroke-width="1.3" stroke-opacity=".78" stroke-linecap="round"/></svg>';

const centre = slug === "default"
  ? '<div class="site"><span class="name">Just <em>Not</em> The Ring</span><span class="sub">Stories</span></div>'
  : '<q>' + esc(quote) + '</q>';

const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500&family=Karla:wght@300;400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="file://${CSS}">
<style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
.card{position:relative;width:1200px;height:630px}
.hour{padding:70px 110px}
.hour svg{width:420px;height:420px;opacity:.45}
.hour q{font-size:54px;line-height:1.28;max-width:920px;text-shadow:0 2px 28px rgba(11,20,34,.6)}
.site{position:relative;text-align:center;color:#F2F6FC;text-shadow:0 2px 28px rgba(11,20,34,.6)}
.site .name{display:block;font-family:var(--display);font-size:82px;font-weight:500;letter-spacing:-.01em}
.site .name em{font-style:italic;color:#F0DCA8}
.site .sub{display:block;margin-top:14px;font-family:var(--mono);font-size:22px;letter-spacing:.18em;text-transform:uppercase;color:#D8E4F4}
.strip{position:absolute;left:0;right:0;bottom:0;padding:22px 40px;display:flex;align-items:center;justify-content:space-between;
  font-family:var(--mono);font-size:19px;letter-spacing:.14em;text-transform:uppercase;color:#D8E4F4;
  background:linear-gradient(180deg,rgba(13,22,36,0),rgba(13,22,36,.5))}
.strip b{font-family:var(--display);font-weight:500;font-size:26px;letter-spacing:0;text-transform:none;color:#F2F6FC}
.strip b em{font-style:italic;color:#F0DCA8}
</style></head><body>
<div class="card"><div class="hour ${hour}">${DIAMOND}${centre}</div>
${slug === "default" ? "" : '<div class="strip"><b>Just <em>Not</em> The Ring</b><span>A real proposal, in their words</span></div>'}
</div></body></html>`;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "og-card-"));
const page = path.join(tmp, "card.html");
fs.writeFileSync(page, html);
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, slug + ".png");

execFileSync(CHROME, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
  "--force-device-scale-factor=1", "--window-size=1200,630", "--virtual-time-budget=10000",
  "--screenshot=" + out, "file://" + page,
], { stdio: ["ignore", "ignore", "inherit"] });

const b = fs.readFileSync(out);
const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
if (w !== 1200 || h !== 630) die(`wrote ${out} but it is ${w}x${h}, not 1200x630`);
console.log(`wrote ${path.relative(ROOT, out)} (${w}x${h}, ${Math.round(b.length / 1024)}KB)`);

function die(m) { console.error(m); process.exit(1); }
