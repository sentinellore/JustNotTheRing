#!/usr/bin/env node
/* Checks the stories section before a commit. No dependencies; run `node tools/check-stories.mjs`.
   Exit code 1 on any FAIL. There is no build step, so this is where a skipped manual step
   (an og image never made, a sitemap entry forgotten, a tag reworded) turns into a failed
   line instead of a blank preview on someone's phone. */
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

/* ---------- what index.html knows ---------- */
const INDEX = read(path.join(PUB, "index.html"));
const FONTS = (INDEX.match(/<link rel="stylesheet" href="(https:\/\/fonts\.googleapis\.com[^"]+)">/) || [])[1];
if (!FONTS) fail("public/index.html", "could not find the Google Fonts stylesheet link");

function lib(name) {
  const m = INDEX.match(new RegExp(`var ${name}=\\[([\\s\\S]*?)\\n\\];`));
  if (!m) { fail("public/index.html", `could not find var ${name}=[ ... ];`); return {}; }
  const out = {};
  for (const entry of m[1].split(/\n(?= \{id:")/)) {
    const id = (entry.match(/\{id:"([^"]+)"/) || [])[1];
    const h = (entry.match(/\bh:"((?:[^"\\]|\\.)*)"/) || [])[1];
    if (id && h !== undefined) out[id] = h.replace(/\\"/g, '"');
  }
  return out;
}
const LOC = lib("LOC_LIB"), CAP = lib("CAPTURE_LIB");
if (Object.keys(LOC).length !== 16) fail("public/index.html", `parsed ${Object.keys(LOC).length} LOC_LIB entries, expected 16`); else ok();
if (Object.keys(CAP).length !== 6) fail("public/index.html", `parsed ${Object.keys(CAP).length} CAPTURE_LIB entries, expected 6`); else ok();
const listLib = (L) => Object.entries(L).map(([k, v]) => `    ${k.padEnd(13)} "${v}"`).join("\n");

/* ---------- public/ holds only what is meant to be served ---------- */
{
  const allowed = [/^index\.html$/, /^404\.html$/, /^robots\.txt$/, /^sitemap\.xml$/, /^stories\/index\.html$/, /^stories\/stories\.css$/,
    /^stories\/[a-z0-9-]+\.html$/, /^stories\/img\/[a-z0-9-]+\.(jpg|png)$/, /^stories\/og\/[a-z0-9-]+\.png$/];
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
  for (const f of walk(PUB)) {
    const r = path.relative(PUB, f);
    if (!allowed.some((re) => re.test(r))) fail("public/" + r, "not on the list of files that belong in public/ (everything there is served to the world)"); else ok();
  }
}

/* ---------- tokens: stories.css must carry index.html's palette verbatim ---------- */
{
  const CSS = read(path.join(STORIES, "stories.css"));
  const blocks = {
    "light :root": /:root\{([^}]*--bg:[^}]*)\}/,
    "@media dark": /@media \(prefers-color-scheme: ?dark\)\{\s*:root:not\(\[data-theme="light"\]\)\{([^}]*)\}/,
    '[data-theme="dark"]': /:root\[data-theme="dark"\]\{([^}]*)\}/,
  };
  const decls = (src) => { const o = {}; for (const d of src.split(";")) { const i = d.indexOf(":"); if (i > 0) o[d.slice(0, i).trim()] = d.slice(i + 1).replace(/\s+/g, " ").trim(); } return o; };
  for (const [name, re] of Object.entries(blocks)) {
    const a = INDEX.match(re), b = CSS.match(re);
    if (!a) { fail("public/index.html", `token block ${name} not found`); continue; }
    if (!b) { fail("public/stories/stories.css", `token block ${name} not found`); continue; }
    const A = decls(a[1]), B = decls(b[1]);
    let bad = false;
    for (const k of new Set([...Object.keys(A), ...Object.keys(B)])) {
      if (!(k in B)) { bad = true; fail("public/stories/stories.css", `${name}: ${k} is in index.html (${A[k]}) but missing here`); }
      else if (!(k in A)) { bad = true; fail("public/stories/stories.css", `${name}: ${k} is here (${B[k]}) but not in index.html`); }
      else if (A[k] !== B[k]) { bad = true; fail("public/stories/stories.css", `${name}: ${k} differs\n    index.html:  ${A[k]}\n    stories.css: ${B[k]}`); }
    }
    if (!bad) ok();
  }
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

function checkWrapper(f, html) {
  const head = html.slice(0, 400);
  const order = ["<!doctype html>", '<html lang="en">', "<head>", '<meta charset="utf-8">', '<meta name="viewport"'];
  let pos = -1, good = true;
  for (const t of order) { const i = head.indexOf(t); if (i < 0 || i < pos) { good = false; fail(f, `document wrapper: expected ${t} in order (doctype, html lang, head, charset, viewport). Without the charset every em dash on the live site is mojibake.`); break; } pos = i; }
  if (good) ok();
  if (html.includes(FONTS)) ok(); else fail(f, "Google Fonts stylesheet URL is not byte-identical to index.html's, so the second page refetches the fonts");
  if (html.includes('href="/stories/stories.css"')) ok(); else fail(f, "does not link /stories/stories.css");
  for (const bad of ["[Example]", "Layout only", "hello@"]) {
    if (html.includes(bad)) fail(f, `contains "${bad}"` + (bad === "hello@" ? " — the address has no MX records; the mailto lands in its own commit once Email Routing is live (drop this check then)" : " — prototype placeholders never ship"));
    else ok();
  }
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
  for (const k of ["og:title", "og:description", "description", "og:image:alt"]) { if (!meta(html, k)) fail(f, `${k} is missing or empty`); else ok(); }
  if (!(html.match(/<title>([^<]+)<\/title>/) || [])[1]) fail(f, "<title> is missing"); else ok();
  if (linkRel(html, "canonical") !== canonical) fail(f, `canonical is "${linkRel(html, "canonical")}", expected "${canonical}" (no .html: Cloudflare redirects the .html form)`); else ok();
  const img = meta(html, "og:image");
  const p = siteFile(img);
  if (!p) return fail(f, `og:image "${img}" must be absolute under ${SITE}/`);
  if (!exists(p)) return fail(f, `og:image ${img} does not exist under public/ — for a story with no photograph run: node tools/og-card.mjs <slug> <dusk|dawn|noon> "<quote>"`);
  const d = imageDims(p);
  if (!d || d.w < 1200 || d.h < 630) fail(f, `og:image ${img} is ${d ? d.w + "x" + d.h : "unreadable"}; unfurlers want at least 1200x630`); else ok();
  if (meta(html, "og:image:width") !== String(d?.w) || meta(html, "og:image:height") !== String(d?.h)) fail(f, `og:image:width/height say ${meta(html, "og:image:width")}x${meta(html, "og:image:height")} but the file is ${d?.w}x${d?.h}`); else ok();
}

/* ---------- the stories index ---------- */
const storyFiles = fs.readdirSync(STORIES).filter((n) => n.endsWith(".html") && n !== "index.html").map((n) => n.replace(/\.html$/, "")).sort();
const IDX_PATH = path.join(STORIES, "index.html"), IDX = read(IDX_PATH), IDX_REL = rel(IDX_PATH);
checkWrapper(IDX_REL, IDX);
checkOg(IDX_REL, IDX, SITE + "/stories/", { type: "website" });
checkImages(IDX_REL, IDX, { lazy: true });
const cards = [...IDX.matchAll(/<a class="card" href="\/stories\/([a-z0-9-]+)"[\s\S]*?<\/a>/g)];
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
  checkWrapper(f, html);
  checkOg(f, html, canonical, { type: "article" });
  checkImages(f, html, { lazy: false });

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

  /* tags: the two ids on <article>, and the chips that must read as the libraries do */
  const art = (html.match(/<article\b[^>]*>/) || [])[0] || "";
  const locId = (art.match(/data-loc="([^"]*)"/) || [])[1], capId = (art.match(/data-capture="([^"]*)"/) || [])[1];
  const eyebrow = text((html.match(/<div class="view-head story-head">\s*<span class="eyebrow">([\s\S]*?)<\/span>/) || [])[1] || "");
  if (!locId) fail(f, "<article> has no data-loc id");
  else if (!(locId in LOC)) fail(f, `data-loc="${locId}" is not an id in LOC_LIB. The sixteen are:\n${listLib(LOC)}`);
  else if (eyebrow !== LOC[locId]) fail(f, `the location eyebrow reads\n    "${eyebrow}"\n  but LOC_LIB "${locId}" reads\n    "${LOC[locId]}"\n  (keep the library's wording, verbatim)`);
  else ok();
  if (!capId) fail(f, "<article> has no data-capture id");
  else if (!(capId in CAP)) fail(f, `data-capture="${capId}" is not an id in CAPTURE_LIB. The six are:\n${listLib(CAP)}`);
  else ok();
  const kw = ld ? (() => { try { return JSON.parse(ld).keywords || []; } catch { return []; } })() : [];
  if (locId in LOC && capId in CAP) {
    if (kw[0] !== LOC[locId] || kw[1] !== CAP[capId]) fail(f, `JSON-LD keywords should be exactly ["${LOC[locId]}", "${CAP[capId]}"], found ${JSON.stringify(kw)}`); else ok();
  }

  /* the fixed shape */
  const h1 = text((html.match(/<h1>([\s\S]*?)<\/h1>/) || [])[1] || "");
  if (!h1) fail(f, "no <h1> hook line"); else if (h1 !== meta(html, "og:title")) fail(f, `og:title "${meta(html, "og:title")}" is not the <h1> "${h1}"`); else ok();
  const dts = [...html.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => decode(m[1]));
  const wantDts = ["Where", "How it went", "Remembered by", "The ring", "Planned for"];
  if (JSON.stringify(dts) !== JSON.stringify(wantDts)) fail(f, `fact rows are ${JSON.stringify(dts)}; every story has exactly ${JSON.stringify(wantDts)}`); else ok();
  const paras = (html.match(/<div class="prose">([\s\S]*?)<blockquote>/) || [""])[0].match(/<p\b/g)?.length || 0;
  if (paras < 3 || paras > 6) fail(f, `${paras} body paragraphs before the pull-quote; the shape is 3 to 6`); else ok();
  if (!html.includes('<div class="diff">')) fail(f, 'no "what they would do differently" block; every story ends with it'); else ok();
  if (!html.includes("<blockquote>")) fail(f, "no pull-quote blockquote"); else ok();
  if (!html.includes('class="tiny provenance"')) fail(f, "the provenance line is missing"); else ok();
  if (html.includes('class="hour') && !meta(html, "og:image").endsWith(`/stories/og/${slug}.png`)) fail(f, `a no-photo story's og:image should be ${SITE}/stories/og/${slug}.png (the quote card), found ${meta(html, "og:image")}`); else ok();
  for (const tok of ["SLUG", "HOOK", "QUOTE", "NAMES", "LOC_ID", "CAPTURE_ID", "LOC_TEXT", "CAPTURE_TEXT", "YYYY-MM-DD"]) { if (new RegExp(`\\b${tok}\\b`).test(html)) fail(f, `template token ${tok} was never replaced`); else ok(); }

  /* the index and the sitemap know about it */
  if (!cardBySlug[slug]) fail(IDX_REL, `no card for /stories/${slug}`);
  else {
    const c = cardBySlug[slug];
    const h3 = text((c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || "");
    if (h3 !== h1) fail(IDX_REL, `card for ${slug} reads\n    "${h3}"\n  but the story's <h1> reads\n    "${h1}"`); else ok();
    const chips = [...c.matchAll(/<span class="chip(?: gold)?">([\s\S]*?)<\/span>/g)].map((m) => text(m[1]));
    if (locId in LOC && capId in CAP && (chips[0] !== LOC[locId] || chips[1] !== CAP[capId])) fail(IDX_REL, `chips on the ${slug} card are ${JSON.stringify(chips)}; the libraries read ["${LOC[locId]}", "${CAP[capId]}"]`); else ok();
    if (!c.includes(`data-loc="${locId}"`) || !c.includes(`data-capture="${capId}"`)) fail(IDX_REL, `card for ${slug} should carry data-loc="${locId}" data-capture="${capId}" (the ids are what the quiz will join on later)`); else ok();
  }
  if (!locs.includes(canonical)) fail("public/sitemap.xml", `missing <loc>${canonical}</loc>`); else ok();
}
for (const u of locs) {
  const m = u.match(new RegExp(`^${SITE}/stories/([a-z0-9-]+)$`));
  if (m && !storyFiles.includes(m[1])) fail("public/sitemap.xml", `${u} is listed but public/stories/${m[1]}.html does not exist`);
  else if (u.endsWith(".html")) fail("public/sitemap.xml", `${u} ends in .html; Cloudflare redirects that form, list the canonical`);
  else ok();
}
for (const u of [SITE + "/", SITE + "/stories/"]) { if (!locs.includes(u)) fail("public/sitemap.xml", `missing <loc>${u}</loc>`); else ok(); }

/* ---------- robots, 404, wrangler, the one nav link ---------- */
if (!read(path.join(PUB, "robots.txt")).includes(`Sitemap: ${SITE}/sitemap.xml`)) fail("public/robots.txt", `needs "Sitemap: ${SITE}/sitemap.xml"`); else ok();
const WR = read(path.join(ROOT, "wrangler.jsonc"));
if (!/"not_found_handling":\s*"404-page"/.test(WR)) fail("wrangler.jsonc", 'assets.not_found_handling should be "404-page"'); else ok();
if (!exists(path.join(PUB, "404.html"))) fail("public/404.html", "missing"); else ok();
if (!INDEX.includes(`<a href="${SITE}/stories/">Stories</a>`)) fail("public/index.html", `the bar nav should carry <a href="${SITE}/stories/">Stories</a> (absolute, so the artifact copy stays identical)`); else ok();
if (!/\.bar-nav button,\.bar-nav a\{/.test(INDEX) || !/\.nav-panel button,\.nav-panel a\{/.test(INDEX)) fail("public/index.html", "nav rules must cover the anchor as well as the buttons"); else ok();
if (INDEX.includes('data-go="stories"')) fail("public/index.html", "the Stories link must not use data-go: the click handler would swallow the navigation"); else ok();

console.log(`\n${storyFiles.length} stor${storyFiles.length === 1 ? "y" : "ies"}, ${checks} checks passed, ${fails} failed, ${warns} warning${warns === 1 ? "" : "s"}`);
process.exit(fails ? 1 : 0);
