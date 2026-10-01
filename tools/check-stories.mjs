#!/usr/bin/env node
/* Checks everything under public/ before a commit. No dependencies; run `node tools/check-stories.mjs`.
   Exit code 1 on any FAIL. There is no build step, so this is where a skipped manual step
   (an og image never made, a sitemap entry forgotten, a tag reworded, a nav link changed on
   one page and not the other twelve) turns into a failed line instead of a broken page.

   It began as the stories verifier and kept the name. Since the site became one page per
   section it also checks the pages themselves: the wrapper, the shared header and footer,
   that every link and script resolves, and that nothing is loaded from another site. */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PUB = path.join(ROOT, "public");
const SITE = "https://justnotthering.com";
const STORIES = path.join(PUB, "stories");
let fails = 0, warns = 0, checks = 0;
const fail = (f, m) => { fails++; console.log(`FAIL ${f}: ${m}`); };
const warn = (f, m) => { warns++; console.log(`warn ${f}: ${m}`); };
const ok = () => { checks++; };
const rel = (p) => path.relative(ROOT, p);
const read = (p) => fs.readFileSync(p, "utf8");
const exists = (p) => fs.existsSync(p);
const decode = (s) => String(s).replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&middot;/g, "·").replace(/\s+/g, " ").trim();
const text = (html) => decode(html.replace(/<[^>]+>/g, ""));
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);

/* The nine numbered sections, in order, and the unnumbered privacy page. */
const SECTIONS = ["quiz", "locations", "trip", "hire", "diamonds", "rings", "how", "words", "when"];
const PAGE_DIRS = [...SECTIONS, "privacy"];
const SCRIPTS = ["app", "budget", "data", "gem", "hire", "lens", "quiz", "timeline", "trip"];

/* ---------- what the data file knows ---------- */
const DATA_PATH = path.join(PUB, "assets/data.js"), DATA_REL = "public/assets/data.js";
const DATA = exists(DATA_PATH) ? read(DATA_PATH) : "";
if (!DATA) fail(DATA_REL, "missing");

function lib(name) {
  const m = DATA.match(new RegExp(`var ${name}=\\[([\\s\\S]*?)\\n\\];`));
  if (!m) { fail(DATA_REL, `could not find var ${name}=[ ... ];`); return {}; }
  const out = {};
  for (const entry of m[1].split(/\n(?= \{id:")/)) {
    const id = (entry.match(/\{id:"([^"]+)"/) || [])[1];
    const h = (entry.match(/\bh:"((?:[^"\\]|\\.)*)"/) || [])[1];
    if (id && h !== undefined) out[id] = h.replace(/\\"/g, '"');
  }
  return out;
}
const LOC = lib("LOC_LIB"), CAP = lib("CAPTURE_LIB");
if (Object.keys(LOC).length !== 16) fail(DATA_REL, `parsed ${Object.keys(LOC).length} LOC_LIB entries, expected 16`); else ok();
if (Object.keys(CAP).length !== 6) fail(DATA_REL, `parsed ${Object.keys(CAP).length} CAPTURE_LIB entries, expected 6`); else ok();
const listLib = (L) => Object.entries(L).map(([k, v]) => `    ${k.padEnd(13)} "${v}"`).join("\n");

/* ---------- public/ holds only what is meant to be served ---------- */
const ALL = walk(PUB);
{
  const allowed = [/^index\.html$/, /^404\.html$/, /^robots\.txt$/, /^sitemap\.xml$/,
    new RegExp(`^(${PAGE_DIRS.join("|")})/index\\.html$`),
    /^assets\/styles\.css$/, new RegExp(`^assets/(${SCRIPTS.join("|")})\\.js$`),
    /^assets\/fonts\/[a-z-]+\.woff2$/, /^assets\/fonts\/OFL\.txt$/,
    /^stories\/index\.html$/, /^stories\/stories\.css$/,
    /^stories\/[a-z0-9-]+\.html$/, /^stories\/img\/[a-z0-9-]+\.(jpg|png)$/, /^stories\/og\/[a-z0-9-]+\.png$/];
  for (const f of ALL) {
    const r = path.relative(PUB, f);
    if (!allowed.some((re) => re.test(r))) fail("public/" + r, "not on the list of files that belong in public/ (everything there is served to the world)"); else ok();
  }
}

/* ---------- nothing is loaded from anywhere else ---------- */
/* The privacy page says loading a page asks no other company for anything. A font service, a
   CDN script or an analytics tag would make that sentence false, so none may appear. Ordinary
   links out (<a href>) are a different thing and are not what this looks for. */
{
  const LOADS = [/<link\b[^>]*\bhref="(?:https?:)?\/\/[^"]*"/gi, /<script\b[^>]*\bsrc="(?:https?:)?\/\/[^"]*"/gi, /<(?:img|iframe|source|video|audio)\b[^>]*\bsrc="(?:https?:)?\/\/[^"]*"/gi,
    /url\(\s*["']?(?:https?:)?\/\/[^)]*\)/gi, /@import\b[^;]*/gi, /fonts\.(?:googleapis|gstatic)\.com/gi];
  for (const f of ALL.filter((f) => /\.(html|css|js)$/.test(f))) {
    let src = read(f);
    /* canonical and og:image are addresses of this site, written out in full; they load nothing */
    src = src.replace(/<link rel="canonical" href="[^"]*">/g, "");
    const hits = LOADS.flatMap((re) => src.match(re) || []);
    if (hits.length) fail(rel(f), `loads something from another site: ${hits[0].slice(0, 90)} (the privacy page says no page here does)`); else ok();
  }
}

/* ---------- design tokens: defined once, in styles.css ---------- */
const CSS_PATH = path.join(PUB, "assets/styles.css");
const CSS = exists(CSS_PATH) ? read(CSS_PATH) : "";
{
  if (!CSS) fail("public/assets/styles.css", "missing");
  const defined = new Set([...CSS.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));
  /* set from script or inline style rather than declared in the stylesheet */
  const RUNTIME = new Set(["--i", "--d", "--p", "--rx", "--ry", "--mx", "--my", "--dock", "--top", "--mid", "--hor", "--glow", "--stars", "--sink"]);
  for (const f of ALL.filter((f) => /\.(html|css|js)$/.test(f))) {
    const used = new Set([...read(f).matchAll(/var\((--[a-z0-9-]+)/gi)].map((m) => m[1]));
    const missing = [...used].filter((v) => !defined.has(v) && !RUNTIME.has(v));
    if (missing.length) fail(rel(f), `uses ${missing.join(", ")}, which styles.css does not define (an undefined token paints nothing)`); else ok();
  }
  const sc = exists(path.join(STORIES, "stories.css")) ? read(path.join(STORIES, "stories.css")) : "";
  if (/(^|[;{\s])--[a-z0-9-]+\s*:/i.test(sc)) fail("public/stories/stories.css", "defines a token; tokens live in assets/styles.css only, so there is one palette and nothing to keep in step"); else ok();
  let depth = 0, neg = false;
  for (const ch of CSS) { if (ch === "{") depth++; else if (ch === "}") { depth--; if (depth < 0) neg = true; } }
  if (depth !== 0 || neg) fail("public/assets/styles.css", "braces do not balance"); else ok();
  if (!/color-scheme:\s*light\b/.test(CSS)) fail("public/assets/styles.css", ":root should declare color-scheme:light (the design is one light look; without it a dark-mode device draws dark form controls on it)"); else ok();
}

/* ---------- helpers for pages ---------- */
const meta = (html, key) => decode((html.match(new RegExp(`<meta (?:property|name)="${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" content="([^"]*)"`)) || [])[1] ?? "");
const linkRel = (html, r) => (html.match(new RegExp(`<link rel="${r}" href="([^"]*)"`)) || [])[1] || "";
function imageDims(p) {
  const b = fs.readFileSync(p);
  if (b[0] === 0x89 && b[1] === 0x50) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), kind: "png" };
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7), kind: "jpg" };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return null;
}
function siteFile(url) { return url.startsWith(SITE + "/") ? path.join(PUB, url.slice(SITE.length + 1)) : null; }
/* Where a site-absolute path is served from. Folder indexes are served with the trailing
   slash (html_handling "auto-trailing-slash"), single files without their extension. */
function resolves(href) {
  const p = href.split("#")[0].split("?")[0];
  if (p === "/") return exists(path.join(PUB, "index.html"));
  if (p.endsWith("/")) return exists(path.join(PUB, p, "index.html"));
  if (/\.[a-z0-9]+$/i.test(p)) return exists(path.join(PUB, p));
  return exists(path.join(PUB, p + ".html"));
}

/* The blocks every page carries. A page is hand-written, so its copy of the header can drift
   from the others; this is compared across all of them with aria-current taken out. */
const chrome = (html) => {
  const a = html.indexOf('<a class="skip"'), b = html.indexOf('<main id="main">');
  const c = html.indexOf('<div class="night">'), d = html.indexOf("<script src=", c);
  if (a < 0 || b < 0 || c < 0) return null;
  let foot = html.slice(c, d < 0 ? html.indexOf("</body>", c) : d);
  foot = foot.replace(/  <section class="wrap finale"[\s\S]*?<\/section>\n/, ""); // the home page's closing panel
  return (html.slice(a, b) + foot).replace(/ aria-current="page"/g, "").trim();
};
let CHROME = null, CHROME_FROM = "";

function checkWrapper(f, html, { canonical, noindex = false, story = false } = {}) {
  const head = html.slice(0, 400);
  const order = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">', '<meta name="viewport"'];
  let pos = -1, good = true;
  for (const t of order) { const i = head.indexOf(t); if (i < 0 || i < pos) { good = false; fail(f, `document wrapper: expected ${t} in order (doctype, html lang, head, charset, viewport). Without the charset every em dash on the live site is mojibake.`); break; } pos = i; }
  if (good) ok();
  if (!/<meta name="viewport" content="[^"]*viewport-fit=cover[^"]*">/.test(html)) fail(f, "the viewport meta needs viewport-fit=cover (the header and the phone bench strip sit against the safe area)"); else ok();
  if (!html.includes('<meta name="color-scheme" content="light">')) fail(f, 'needs <meta name="color-scheme" content="light">, matching :root in styles.css'); else ok();
  if (!(html.match(/<title>([^<]+)<\/title>/) || [])[1]) fail(f, "<title> is missing"); else ok();
  if (!meta(html, "description")) fail(f, "meta description is missing or empty"); else ok();
  if (noindex) { if (!html.includes('<meta name="robots" content="noindex">')) fail(f, "should carry robots noindex"); else ok(); }
  else if (canonical && linkRel(html, "canonical") !== canonical) fail(f, `canonical is "${linkRel(html, "canonical")}", expected "${canonical}"`); else ok();
  if (!html.includes('<link rel="stylesheet" href="/assets/styles.css">')) fail(f, "does not link /assets/styles.css"); else ok();
  if (story) { if (!html.includes('<link rel="stylesheet" href="/stories/stories.css">')) fail(f, "does not link /stories/stories.css"); else ok(); }
  /* the page-transition opt-in is inline in the head on purpose: see the note beside it */
  const style = (html.match(/<style>([\s\S]*?)<\/style>/) || [])[1] || "";
  if (!/@view-transition\{navigation:auto\}/.test(style) || !/@media \(prefers-reduced-motion:reduce\)\{@view-transition\{navigation:none\}\}/.test(style)) fail(f, "the <head> should declare @view-transition{navigation:auto} and its reduced-motion navigation:none inline"); else ok();
  if ((html.match(/view-transition-name:\s*stone|class="[^"]*\bvt-stone\b|id="traveler"/g) || []).length > 1) fail(f, "more than one element holds view-transition-name: stone; only one per page may"); else ok();
  if (!/<h1\b[^>]*data-words/.test(html)) fail(f, "the page heading should be an <h1 data-words>"); else ok();
  if ((html.match(/<h1\b/g) || []).length !== 1) fail(f, `has ${(html.match(/<h1\b/g) || []).length} <h1> elements; a page has one`); else ok();

  /* header, menu, footer: the same on every page */
  const c = chrome(html);
  if (!c) fail(f, "could not find the skip link, <main id=\"main\"> and the night band, which every page carries in that order");
  else if (CHROME === null) { CHROME = c; CHROME_FROM = f; ok(); }
  else if (c !== CHROME) {
    const A = CHROME.split("\n"), B = c.split("\n"); let i = 0; while (i < A.length && A[i] === B[i]) i++;
    fail(f, `its header, menu or footer differs from ${CHROME_FROM}'s (first difference near: ${(B[i] || "").trim().slice(0, 100)}). They are the same block on every page; change one, change all.`);
  } else ok();

  /* every link and script on the page goes somewhere */
  for (const m of html.matchAll(/\b(?:href|src)="(\/[^"]*)"/g)) {
    const h = m[1];
    if (/^\/#/.test(h)) { fail(f, `links to ${h}: the site no longer routes on the #, link the page itself`); continue; }
    if (!resolves(h)) fail(f, `${h} does not resolve to a file under public/`); else ok();
    if (/^\/(quiz|locations|trip|hire|diamonds|rings|how|words|when|privacy|stories)(#|$)/.test(h)) fail(f, `${h} lacks its trailing slash; the page is served at /${h.split("/")[1].split("#")[0]}/ and the short form costs a redirect on every click`);
  }
  if (/\bdata-go=/.test(html)) fail(f, "still carries data-go, the old single page's router attribute"); else ok();
  for (const bad of ["[Example]", "Layout only"]) { if (html.includes(bad)) fail(f, `contains "${bad}" — prototype placeholders never ship`); else ok(); }
}
function checkCurrent(f, html, href, count) {
  const cur = [...html.matchAll(/<a\b[^>]*href="([^"]*)"[^>]*aria-current="page"/g)].map((m) => m[1]);
  if (cur.length !== count || cur.some((h) => h !== href)) fail(f, `should mark ${href} with aria-current="page" ${count === 2 ? "in both the bar and the menu" : "once"}; found ${JSON.stringify(cur)}`); else ok();
}
function checkScripts(f, html, want) {
  const got = [...html.matchAll(/<script src="\/assets\/([a-z]+)\.js"><\/script>/g)].map((m) => m[1]);
  if (JSON.stringify(got) !== JSON.stringify(want)) fail(f, `loads scripts ${JSON.stringify(got)}, expected ${JSON.stringify(want)} in that order (data before whatever reads it, app last)`); else ok();
}
function checkImages(f, html, { lazy }) {
  for (const tag of html.match(/<img\b[^>]*>/g) || []) {
    const attr = (n) => (tag.match(new RegExp(`\\b${n}="([^"]*)"`)) || [])[1];
    const src = attr("src") || "";
    for (const n of ["width", "height"]) { if (!attr(n)) fail(f, `<img ${src}> has no ${n} attribute (the page reflows when it loads)`); else ok(); }
    if (!attr("alt")) fail(f, `<img ${src}> has no alt text (describe the picture)`); else ok();
    const isLazy = attr("loading") === "lazy";
    if (lazy && !isLazy) fail(f, `<img ${src}> on the index needs loading="lazy" (the cards are below the fold)`); else if (!lazy && isLazy) warn(f, `<img ${src}> is the hero, above the fold; loading="lazy" delays it`); else ok();
    const p = src.startsWith("/") ? path.join(PUB, src) : null;
    if (!p || !exists(p)) { fail(f, `<img ${src}> does not exist under public/ (src must be site-absolute, /stories/img/...)`); continue; }
    const d = imageDims(p); const kb = Math.round(fs.statSync(p).size / 1024);
    if (!d) fail(f, `${src} is not a PNG or JPEG`); else if (String(d.w) !== attr("width") || String(d.h) !== attr("height")) fail(f, `${src} is ${d.w}x${d.h} but the tag says ${attr("width")}x${attr("height")}`); else ok();
    if (kb > 250) warn(f, `${src} is ${kb}KB; the budget is about 250KB`); else ok();
  }
}
function checkOg(f, html, canonical, { type }) {
  const want = { "og:type": type, "og:url": canonical, "twitter:card": "summary_large_image", "og:site_name": "Just Not The Ring" };
  for (const [k, v] of Object.entries(want)) { if (meta(html, k) !== v) fail(f, `${k} is "${meta(html, k)}", expected "${v}"`); else ok(); }
  for (const k of ["og:title", "og:description", "og:image:alt"]) { if (!meta(html, k)) fail(f, `${k} is missing or empty`); else ok(); }
  const img = meta(html, "og:image");
  const p = siteFile(img);
  if (!p) return fail(f, `og:image "${img}" must be absolute under ${SITE}/`);
  if (!exists(p)) return fail(f, `og:image ${img} does not exist under public/ — for a story with no photograph run: node tools/og-card.mjs <slug> <dusk|dawn|noon> "<quote>"`);
  const d = imageDims(p);
  if (!d || d.w < 1200 || d.h < 630) fail(f, `og:image ${img} is ${d ? d.w + "x" + d.h : "unreadable"}; unfurlers want at least 1200x630`); else ok();
  if (meta(html, "og:image:width") !== String(d?.w) || meta(html, "og:image:height") !== String(d?.h)) fail(f, `og:image:width/height say ${meta(html, "og:image:width")}x${meta(html, "og:image:height")} but the file is ${d?.w}x${d?.h}`); else ok();
}

/* ---------- the pages ---------- */
const WANT_SCRIPTS = { "": ["gem", "app"], quiz: ["data", "quiz", "app"], locations: ["lens", "app"], trip: ["trip", "app"], hire: ["hire", "app"],
  diamonds: ["data", "gem", "app"], rings: ["data", "gem", "budget", "app"], how: ["app"], words: ["app"], when: ["timeline", "app"], privacy: ["app"] };
const titles = new Map();
const HOME_PATH = path.join(PUB, "index.html"), HOME = exists(HOME_PATH) ? read(HOME_PATH) : "";
for (const dir of ["", ...PAGE_DIRS]) {
  const p = path.join(PUB, dir, "index.html"), f = rel(p);
  if (!exists(p)) { fail(f, "missing: every section is its own page"); continue; }
  const html = read(p), url = dir ? `/${dir}/` : "/";
  checkWrapper(f, html, { canonical: SITE + url });
  checkCurrent(f, html, url, dir === "" || dir === "privacy" ? 1 : 2);
  checkScripts(f, html, WANT_SCRIPTS[dir]);
  const t = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
  if (titles.has(t)) fail(f, `shares its <title> "${t}" with ${titles.get(t)}; each page has its own`); else { titles.set(t, f); ok(); }
  if (dir && SECTIONS.includes(dir)) {
    const n = String(SECTIONS.indexOf(dir) + 1).padStart(2, "0");
    if (!new RegExp(`<span class="stamp">${n} — `).test(html)) fail(f, `its page head should be stamped "${n} — …", the number it has in the menu`); else ok();
  }
}
{
  const p = path.join(PUB, "404.html"), f = "public/404.html";
  if (!exists(p)) fail(f, "missing");
  else { const html = read(p); checkWrapper(f, html, { noindex: true }); checkScripts(f, html, ["app"]); if (/aria-current/.test(html)) fail(f, "the 404 page is no section and marks none as current"); else ok(); }
}

/* ---------- the home page: old links, and question one ---------- */
if (HOME) {
  const f = "public/index.html";
  /* the old site routed on the #; the home page moves those addresses to the new pages */
  if (!/location\.replace\("\/quiz\/"\+location\.hash\)/.test(HOME)) fail(f, 'an old plan link (/#plan=…) must be moved to "/quiz/"+location.hash, keeping the payload in the fragment'); else ok();
  const m = HOME.match(/var PAGES=\[([^\]]*)\]/);
  const listed = m ? m[1].replace(/"/g, "").split(",").map((s) => s.trim()).sort().join() : "";
  if (listed !== [...PAGE_DIRS].sort().join()) fail(f, `the old-link redirect should know exactly these pages: ${PAGE_DIRS.join(", ")}; it lists ${listed || "none"}`); else ok();
  if (/[?&]plan=/.test(HOME) || /[?&]plan=/.test(exists(path.join(PUB, "assets/quiz.js")) ? read(path.join(PUB, "assets/quiz.js")) : "")) fail(f, "a plan must never travel in a query string: a fragment is the only part of an address a browser does not send"); else ok();
  /* the tile repeats question one by hand; it has to stay the question the quiz asks */
  const q0 = DATA.match(/var Q=\[\s*\{p:"((?:[^"\\]|\\.)*)",n:"((?:[^"\\]|\\.)*)",\s*own:"((?:[^"\\]|\\.)*)"[\s\S]*?\bo:\[([\s\S]*?)\]\},/);
  if (!q0) fail(DATA_REL, "could not read question one out of Q");
  else {
    const opts = [...q0[4].matchAll(/\["((?:[^"\\]|\\.)*)",\{/g)].map((x) => x[1]);
    const tile = [...HOME.matchAll(/<a class="q-opt(?: q-other)?" href="\/quiz\/" data-q1="(\d)"><span class="q-key">[A-E]<\/span>([^<]*)<\/a>/g)].map((x) => [x[1], decode(x[2])]);
    const want = opts.map((o, i) => [String(i), o]).concat([[String(opts.length), "None of these — " + q0[3]]]);
    if (JSON.stringify(tile) !== JSON.stringify(want)) fail(f, `the question-one tile reads ${JSON.stringify(tile.map((t) => t[1]))}; data.js asks ${JSON.stringify(want.map((t) => t[1]))}`); else ok();
    if (!HOME.includes(`<p class="q-prompt">${q0[1]}</p>`) || !HOME.includes(`<p class="q-note">${q0[2]}</p>`)) fail(f, "the tile's question and note should read exactly as Q[0].p and Q[0].n in data.js"); else ok();
  }
  /* figures on the home page are sourced, and the source is linked from the footer */
  for (const src of ["theknot.com", "rapaport.com", "gia.edu", "caratyes.com"]) { if (!HOME.includes(src)) fail(f, `the footer's Sources list should link ${src}: a figure with no linked source does not ship`); else ok(); }
}

/* ---------- the stories index ---------- */
const storyFiles = fs.readdirSync(STORIES).filter((n) => n.endsWith(".html") && n !== "index.html").map((n) => n.replace(/\.html$/, "")).sort();
const IDX_PATH = path.join(STORIES, "index.html"), IDX = read(IDX_PATH), IDX_REL = rel(IDX_PATH);
const noHello = (f, html) => { if (html.includes("hello@")) fail(f, 'contains "hello@" — the address has no MX records; the mailto lands in its own commit once Email Routing is live (drop this check then)'); else ok(); };
checkWrapper(IDX_REL, IDX, { canonical: SITE + "/stories/", story: true });
checkCurrent(IDX_REL, IDX, "/stories/", 2);
checkScripts(IDX_REL, IDX, ["app"]);
checkOg(IDX_REL, IDX, SITE + "/stories/", { type: "website" });
checkImages(IDX_REL, IDX, { lazy: true });
noHello(IDX_REL, IDX);
const cards = [...IDX.matchAll(/<a class="card story-card" href="\/stories\/([a-z0-9-]+)"[\s\S]*?<\/a>/g)];
const cardBySlug = Object.fromEntries(cards.map((m) => [m[1], m[0]]));
if (storyFiles.length === 0) {
  if (IDX.includes('class="empty"')) ok(); else fail(IDX_REL, "no story files exist, so the index needs its written empty state");
} else if (IDX.includes('class="empty"')) fail(IDX_REL, "stories exist; remove the empty state");
for (const slug of Object.keys(cardBySlug)) { if (!storyFiles.includes(slug)) fail(IDX_REL, `card links to /stories/${slug} but public/stories/${slug}.html does not exist`); else ok(); }
if (!IDX.includes('class="tiny provenance"')) fail(IDX_REL, "the provenance line is missing"); else ok();

/* ---------- each story ---------- */
const SITEMAP = read(path.join(PUB, "sitemap.xml"));
const locs = [...SITEMAP.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
for (const slug of storyFiles) {
  const f = `public/stories/${slug}.html`, html = read(path.join(STORIES, slug + ".html"));
  const canonical = `${SITE}/stories/${slug}`;
  checkWrapper(f, html, { canonical, story: true });
  checkCurrent(f, html, "/stories/", 2);
  checkScripts(f, html, ["app"]);
  checkOg(f, html, canonical, { type: "article" });
  checkImages(f, html, { lazy: false });
  noHello(f, html);

  const ld = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || [])[1];
  if (!ld) fail(f, "no JSON-LD Article");
  else {
    try {
      const j = JSON.parse(ld);
      if (j["@type"] !== "Article") fail(f, `JSON-LD @type is ${j["@type"]}, expected Article`); else ok();
      for (const k of ["headline", "datePublished", "author", "image"]) { if (!j[k]) fail(f, `JSON-LD ${k} missing`); else ok(); }
      if (j.mainEntityOfPage !== canonical) fail(f, `JSON-LD mainEntityOfPage is ${j.mainEntityOfPage}, expected ${canonical}`); else ok();
      if (j.image !== meta(html, "og:image")) fail(f, "JSON-LD image differs from og:image"); else ok();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(j.datePublished || "")) fail(f, `JSON-LD datePublished "${j.datePublished}" is not YYYY-MM-DD`); else ok();
    } catch (e) { fail(f, "JSON-LD does not parse: " + e.message); }
  }

  /* tags: the two ids on <article>, and the labels that must read as the libraries do */
  const art = (html.match(/<article\b[^>]*>/) || [])[0] || "";
  const locId = (art.match(/data-loc="([^"]*)"/) || [])[1], capId = (art.match(/data-capture="([^"]*)"/) || [])[1];
  const eyebrow = text((html.match(/<div class="wrap pagehead story-head">[\s\S]*?<span class="stamp">([\s\S]*?)<\/span>/) || [])[1] || "");
  if (!locId) fail(f, "<article> has no data-loc id");
  else if (!(locId in LOC)) fail(f, `data-loc="${locId}" is not an id in LOC_LIB. The sixteen are:\n${listLib(LOC)}`);
  else if (eyebrow !== LOC[locId]) fail(f, `the location stamp reads\n    "${eyebrow}"\n  but LOC_LIB "${locId}" reads\n    "${LOC[locId]}"\n  (keep the library's wording, verbatim)`);
  else ok();
  if (!capId) fail(f, "<article> has no data-capture id");
  else if (!(capId in CAP)) fail(f, `data-capture="${capId}" is not an id in CAPTURE_LIB. The six are:\n${listLib(CAP)}`);
  else ok();
  const kw = ld ? (() => { try { return JSON.parse(ld).keywords || []; } catch { return []; } })() : [];
  if (locId in LOC && capId in CAP) {
    if (kw[0] !== LOC[locId] || kw[1] !== CAP[capId]) fail(f, `JSON-LD keywords should be exactly ["${LOC[locId]}", "${CAP[capId]}"], found ${JSON.stringify(kw)}`); else ok();
  }

  /* the fixed shape */
  const h1 = text((html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || "");
  if (!h1) fail(f, "no <h1> hook line"); else if (h1 !== meta(html, "og:title")) fail(f, `og:title "${meta(html, "og:title")}" is not the <h1> "${h1}"`); else ok();
  const dts = [...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => decode(m[1]));
  const wantDts = ["Where", "How it went", "Remembered by", "The ring", "Planned for"];
  if (JSON.stringify(dts) !== JSON.stringify(wantDts)) fail(f, `fact rows are ${JSON.stringify(dts)}; every story has exactly ${JSON.stringify(wantDts)}`); else ok();
  const paras = (html.match(/<div class="prose">([\s\S]*?)<blockquote>/) || [""])[0].match(/<p\b/g)?.length || 0;
  if (paras < 3 || paras > 6) fail(f, `${paras} body paragraphs before the pull-quote; the shape is 3 to 6`); else ok();
  if (!html.includes('<div class="diff">')) fail(f, 'no "what they would do differently" block; every story ends with it'); else ok();
  if (!html.includes("<blockquote>")) fail(f, "no pull-quote blockquote"); else ok();
  if (!html.includes('class="tiny provenance"')) fail(f, "the provenance line is missing"); else ok();
  if ((html.match(/<div class="story-hero">/g) || []).length !== 1) fail(f, "keep exactly one of the template's two heroes, the photograph or the blue-hour panel"); else ok();
  if (html.includes('class="hour') && !meta(html, "og:image").endsWith(`/stories/og/${slug}.png`)) fail(f, `a no-photo story's og:image should be ${SITE}/stories/og/${slug}.png (the quote card), found ${meta(html, "og:image")}`); else ok();
  for (const tok of ["SLUG", "HOOK", "QUOTE", "NAMES", "LOC_ID", "CAPTURE_ID", "LOC_TEXT", "CAPTURE_TEXT", "YYYY-MM-DD"]) { if (new RegExp(`\\b${tok}\\b`).test(html)) fail(f, `template token ${tok} was never replaced`); else ok(); }

  /* the index and the sitemap know about it */
  if (!cardBySlug[slug]) fail(IDX_REL, `no card for /stories/${slug}`);
  else {
    const c = cardBySlug[slug];
    const h3 = text((c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || "");
    if (h3 !== h1) fail(IDX_REL, `card for ${slug} reads\n    "${h3}"\n  but the story's <h1> reads\n    "${h1}"`); else ok();
    const chips = [...c.matchAll(/<span class="tag(?: gold)?">([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
    if (locId in LOC && capId in CAP && (chips[0] !== LOC[locId] || chips[1] !== CAP[capId])) fail(IDX_REL, `tags on the ${slug} card are ${JSON.stringify(chips)}; the libraries read ["${LOC[locId]}", "${CAP[capId]}"]`); else ok();
    if (!c.includes(`data-loc="${locId}"`) || !c.includes(`data-capture="${capId}"`)) fail(IDX_REL, `card for ${slug} should carry data-loc="${locId}" data-capture="${capId}" (the ids are what the quiz will join on later)`); else ok();
  }
  if (!locs.includes(canonical)) fail("public/sitemap.xml", `missing <loc>${canonical}</loc>`); else ok();
}

/* ---------- the story template stays in step with the pages ---------- */
{
  const p = path.join(ROOT, "tools/story-template.html"), f = "tools/story-template.html";
  if (!exists(p)) fail(f, "missing");
  else { const c = chrome(read(p)); if (CHROME && c !== CHROME) fail(f, `its header, menu or footer differs from ${CHROME_FROM}'s; a story copied from it would fail on its first run`); else ok(); }
}

/* ---------- sitemap ---------- */
for (const u of locs) {
  const m = u.match(new RegExp(`^${SITE}/stories/([a-z0-9-]+)$`));
  if (m && !storyFiles.includes(m[1])) fail("public/sitemap.xml", `${u} is listed but public/stories/${m[1]}.html does not exist`);
  else if (u.endsWith(".html")) fail("public/sitemap.xml", `${u} ends in .html; Cloudflare redirects that form, list the canonical`);
  else if (!m && !resolves(u.slice(SITE.length))) fail("public/sitemap.xml", `${u} is listed but nothing is served there`);
  else ok();
}
for (const u of [SITE + "/", ...PAGE_DIRS.map((d) => `${SITE}/${d}/`), SITE + "/stories/"]) { if (!locs.includes(u)) fail("public/sitemap.xml", `missing <loc>${u}</loc>`); else ok(); }

/* ---------- robots, 404, wrangler, the Worker's two links ---------- */
if (!read(path.join(PUB, "robots.txt")).includes(`Sitemap: ${SITE}/sitemap.xml`)) fail("public/robots.txt", `needs "Sitemap: ${SITE}/sitemap.xml"`); else ok();
const WR = read(path.join(ROOT, "wrangler.jsonc"));
if (!/"not_found_handling":\s*"404-page"/.test(WR)) fail("wrangler.jsonc", 'assets.not_found_handling should be "404-page"'); else ok();
if (!/"html_handling":\s*"auto-trailing-slash"/.test(WR)) fail("wrangler.jsonc", 'assets.html_handling should be "auto-trailing-slash": every canonical, every nav link and the sitemap are written for it (/diamonds/ served, /diamonds redirected, /stories/<slug> without .html)'); else ok();
{
  const W = read(path.join(ROOT, "src/index.js"));
  /* the email carries the plan link; it has to open the page the quiz now lives on */
  if (!W.includes("`${SITE}/quiz/#plan=${plan}`")) fail("src/index.js", "the plan email's link should be `${SITE}/quiz/#plan=${plan}`: the quiz page, payload in the fragment"); else ok();
  if (!W.includes("const PLAN_RE = /^[A-Za-z0-9_-]{8,2000}$/;")) fail("src/index.js", "PLAN_RE changed; it is the only thing between a request and the content of an email"); else ok();
  if (!W.includes("`${SITE}/privacy/`")) fail("src/index.js", "PRIVACY_URL should be `${SITE}/privacy/`"); else ok();
}
/* gem.js is the reference's renderer, copied unchanged; when the reference is on disk, compare */
{
  const refGem = path.join(ROOT, "design/dusk-gallery/reference/assets/gem.js"), gem = path.join(PUB, "assets/gem.js");
  if (exists(refGem) && exists(gem)) { if (read(refGem) !== read(gem)) fail("public/assets/gem.js", "differs from design/dusk-gallery/reference/assets/gem.js; it is meant to be that file, unchanged"); else ok(); }
  if (exists(gem) && /\bfetch\(|XMLHttpRequest|WebSocket|sendBeacon|importScripts/.test(read(gem))) fail("public/assets/gem.js", "the renderer must make no network requests"); else ok();
}

console.log(`\n${1 + PAGE_DIRS.length} pages, ${storyFiles.length} stor${storyFiles.length === 1 ? "y" : "ies"}, ${checks} checks passed, ${fails} failed, ${warns} warning${warns === 1 ? "" : "s"}`);
process.exit(fails ? 1 : 0);
