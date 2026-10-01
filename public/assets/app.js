/* Just Not The Ring — Dusk Gallery: motion and interactions shared by every page.
   Each block only runs when its markup is on the page. No network, no storage of anything typed.
   The one thing this file stores is on the home page: the number of the option tapped on
   question one, kept for this tab only so the quiz page can open with it selected (see "home
   quiz tile"). The quiz page keeps one more thing for the tab, the plan; that is in quiz.js. */
(function () {
  "use strict";
  var D = window.SITE || {};
  var root = document.documentElement;
  var reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  // One motion mode for everyone; people who ask their device for less motion get the calm version.
  root.dataset.motion = reduce ? "calm" : "cinematic";
  var cinematic = !reduce;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function ease(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function hex(h) { var n = parseInt(h.slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
  function mixHex(a, b, t) { var x = hex(a), y = hex(b); return "rgb(" + [0, 1, 2].map(function (i) { return Math.round(x[i] + (y[i] - x[i]) * t); }).join(",") + ")"; }
  function ramp(stops, t) {
    for (var i = 1; i < stops.length; i++) if (t <= stops[i][0]) { var a = stops[i - 1], b = stops[i]; return mixHex(a[1], b[1], (t - a[0]) / (b[0] - a[0] || 1)); }
    return stops[stops.length - 1][1];
  }
  function session(k, v) { try { if (v === undefined) { var x = sessionStorage.getItem(k); sessionStorage.removeItem(k); return x; } sessionStorage.setItem(k, v); } catch (e) { } return null; }

  /* ---------- headlines, word by word ---------- */
  var wc = 0;
  function splitWords(el) {
    Array.prototype.slice.call(el.childNodes).forEach(function (n) {
      if (n.nodeType === 3) {
        var frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(function (part) {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          var w = document.createElement("span"); w.className = "w"; w.setAttribute("aria-hidden", "true");
          var i = document.createElement("span"); i.className = "wi"; i.style.setProperty("--i", wc++); i.textContent = part;
          w.appendChild(i); frag.appendChild(w);
        });
        n.parentNode.replaceChild(frag, n);
      } else if (n.nodeType === 1 && n.tagName !== "BR") splitWords(n);
    });
  }
  $$("[data-words]").forEach(function (el) {
    var label = el.textContent.replace(/\s+/g, " ").trim();
    wc = 0; splitWords(el);
    var sr = document.createElement("span"); sr.className = "sr-only"; sr.textContent = label;
    sr.style.cssText = "position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap";
    el.appendChild(sr);
    el.classList.add("play");
    // drop the masks once the last word lands, so nothing can stay clipped
    setTimeout(function () { el.classList.add("done"); }, cinematic ? 120 + wc * 65 + 1150 : 700);
  });

  /* ---------- reveal on scroll ---------- */
  var revealEls = $$("[data-reveal]");
  revealEls.forEach(function (el) {
    $$(":scope > *", el).forEach(function (c, i) { c.style.setProperty("--d", Math.min(i, 8)); });
    if (cinematic && el.getBoundingClientRect().top > innerHeight * 0.9) el.classList.add("pre");
  });
  var counted = new WeakSet();
  function countUp(el) {
    if (counted.has(el) || !cinematic) return; counted.add(el);
    var to = +el.dataset.count, pre = el.dataset.prefix || "", suf = el.dataset.suffix || "", t0 = performance.now();
    (function step(now) {
      var t = clamp((now - t0) / 1500, 0, 1), v = Math.round(to * (1 - Math.pow(1 - t, 3)));
      el.textContent = pre + v.toLocaleString("en-US") + suf;
      if (t < 1) requestAnimationFrame(step);
    })(t0);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (!e.isIntersecting) return; e.target.classList.add("in"); $$("[data-count]", e.target).forEach(countUp); io.unobserve(e.target); });
    }, { rootMargin: "0px 0px -10% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
    $$("[data-count]").forEach(function (el) { if (!el.closest("[data-reveal]")) countUp(el); });
  } else revealEls.forEach(function (el) { el.classList.add("in"); });

  /* ---------- tilt ---------- */
  $$(".tilt").forEach(function (el) {
    el.addEventListener("pointermove", function (e) {
      if (!cinematic || e.pointerType !== "mouse") return;
      var r = el.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      el.style.setProperty("--ry", (x * 8).toFixed(2) + "deg"); el.style.setProperty("--rx", (-y * 8).toFixed(2) + "deg");
      el.style.setProperty("--mx", ((x + 0.5) * 100).toFixed(1) + "%"); el.style.setProperty("--my", ((y + 0.5) * 100).toFixed(1) + "%");
    });
    el.addEventListener("pointerleave", function () { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); });
  });

  /* ---------- hamburger menu ---------- */
  var menuBtn = $(".menu-btn"), menu = $("#menu");
  if (menuBtn && menu) {
    $$("li", menu).forEach(function (li, i) { li.style.setProperty("--d", i); });
    var lastFocus = null;
    function setMenu(open) {
      menuBtn.setAttribute("aria-expanded", String(open));
      menuBtn.querySelector(".lbl").textContent = open ? "Close" : "Menu";
      document.body.classList.toggle("menu-open", open);
      if (open) {
        menu.hidden = false; void menu.offsetWidth; menu.classList.add("open");
        lastFocus = document.activeElement;
        setTimeout(function () { var a = $("a", menu); a && a.focus({ preventScroll: true }); }, cinematic ? 250 : 0);
      } else {
        menu.classList.remove("open");
        setTimeout(function () { if (!menu.classList.contains("open")) menu.hidden = true; }, cinematic ? 650 : 0);
        if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
      }
    }
    menuBtn.addEventListener("click", function () { setMenu(menuBtn.getAttribute("aria-expanded") !== "true"); });
    document.addEventListener("keydown", function (e) {
      if (menuBtn.getAttribute("aria-expanded") !== "true") return;
      if (e.key === "Escape") { setMenu(false); return; }
      if (e.key === "Tab") { // keep focus inside the open menu (and its button)
        var f = [menuBtn].concat($$("a,button", menu)), i = f.indexOf(document.activeElement);
        if (e.shiftKey && i <= 0) { f[f.length - 1].focus(); e.preventDefault(); }
        else if (!e.shiftKey && i === f.length - 1) { f[0].focus(); e.preventDefault(); }
      }
    });
    var wide = matchMedia("(min-width:1101px)"), onWide = function (m) { if (m.matches && menuBtn.getAttribute("aria-expanded") === "true") setMenu(false); };
    if (wide.addEventListener) wide.addEventListener("change", onWide); else if (wide.addListener) wide.addListener(onWide); // older Safari
    // Coming Back to a page kept whole in the browser's back/forward cache would show it as it
    // was left: menu open, page behind it locked. Shut it without the animation.
    addEventListener("pageshow", function (e) {
      if (!e.persisted || menuBtn.getAttribute("aria-expanded") !== "true") return;
      menuBtn.setAttribute("aria-expanded", "false"); menuBtn.querySelector(".lbl").textContent = "Menu";
      document.body.classList.remove("menu-open"); menu.classList.remove("open"); menu.hidden = true;
    });
  }

  /* ---------- home: the travelling stone and the sky ---------- */
  var trav = $("#traveler"), travGem = trav && $("canvas", trav), dockLink = trav && $(".dock-link", trav), hs = $("#slotHero");
  var H = null, TW = 1, docked = false;
  function docRect(el) { var r = el.getBoundingClientRect(); return { x: r.left, y: r.top + scrollY, w: r.width, h: r.height }; }
  function layout() {
    if (!trav || !hs) return;
    if (!cinematic) { trav.hidden = true; return; }
    trav.hidden = false; H = docRect(hs); TW = Math.max(H.w, 1);
    trav.style.width = TW + "px"; trav.style.height = TW + "px";
    // Place it now rather than on the next animation frame. Until it has a position the stone is
    // a fixed square over the top-left of the window, taking the taps meant for whatever is under
    // it, and a tab opened in the background gets no animation frame until it is looked at.
    travTick();
  }
  function travTick() {
    if (!trav || trav.hidden || !H) return;
    var y = scrollY, vw = innerWidth, vh = innerHeight, small = vw < 760;
    var p = clamp(y / Math.max(1, H.y + H.h * 0.55), 0, 1), k = ease(p);
    var h = { x: H.x, y: H.y - y, w: H.w };
    var ds = small ? 76 : 120, dock = { x: vw - ds - (small ? 8 : 18), y: vh - ds - (small ? 20 : 28), w: ds };
    var r = { x: h.x + (dock.x - h.x) * k, y: h.y + (dock.y - h.y) * k, w: h.w + (dock.w - h.w) * k };
    trav.style.transform = "translate3d(" + r.x.toFixed(1) + "px," + r.y.toFixed(1) + "px,0) scale(" + (r.w / TW).toFixed(4) + ")";
    trav.style.setProperty("--dock", k.toFixed(3));
    var d = k > 0.97;
    if (d !== docked) { docked = d; trav.classList.toggle("docked", d); dockLink.tabIndex = d ? 0 : -1; dockLink.setAttribute("aria-hidden", String(!d)); }
  }
  /* The window's sky from sunset to first stars, as [scroll position, colour] stops. */
  var SKY = {
    top: [[0, "#E9B9A0"], [0.5, "#8E8DB5"], [1, "#2B4673"]],
    mid: [[0, "#C9A4B4"], [0.5, "#6F7FAE"], [1, "#3E5A8C"]],
    hor: [[0, "#F6D2B4"], [0.5, "#C9A3A8"], [1, "#7383B0"]]
  };
  var sky = $(".sky"), clock = $("#clock");
  function skyTick() {
    var max = Math.max(1, document.documentElement.scrollHeight - innerHeight), t = clamp(scrollY / max, 0, 1);
    if (sky && SKY) {
      var st = clamp(scrollY / (+sky.dataset.range || 900), 0, 1);
      sky.style.setProperty("--top", ramp(SKY.top, st)); sky.style.setProperty("--mid", ramp(SKY.mid, st)); sky.style.setProperty("--hor", ramp(SKY.hor, st));
      sky.style.setProperty("--glow", (1 - smooth(0.05, 0.8, st)).toFixed(3)); sky.style.setProperty("--stars", smooth(0.3, 0.8, st).toFixed(3));
      sky.style.setProperty("--sink", (smooth(0, 1, st) * 18).toFixed(2) + "%");
    }
    if (clock) { var m = Math.round(t * 60); clock.querySelector("b").textContent = m === 0 ? "Sunset" : "+" + m + " min"; clock.querySelector("i").style.setProperty("--p", t.toFixed(3)); }
  }
  var lastY = -1, force = true;
  function frame() { if (scrollY !== lastY || force) { lastY = scrollY; force = false; travTick(); skyTick(); } requestAnimationFrame(frame); }
  if (trav || sky || clock) {
    addEventListener("resize", function () { layout(); force = true; });
    addEventListener("load", function () { layout(); force = true; });
    if ("ResizeObserver" in window) new ResizeObserver(function () { layout(); force = true; }).observe(document.body);
    layout(); requestAnimationFrame(frame);
  }

  /* home quiz tile: the first answer travels to the quiz page for this tab only. What is kept
     is the option's index, 0 to 4, and the quiz page removes it as it reads it. "None of
     these" carries its index like any other; the words are typed on the quiz page and are
     never stored. */
  $$("[data-q1]").forEach(function (a) { a.addEventListener("click", function () { session("jntr-q1", a.dataset.q1); }); });

  /* ---------- when the device cannot draw the stone ---------- */
  /* gem.js needs WebGL2 and, without it, draws one fixed gold-line stone that does not change.
     The pages say the stone follows the controls, so where it cannot, they say that instead. */
  var noGl = $$("[data-nogl]");
  if (noGl.length) {
    var hasGl = false;
    try { var probe = document.createElement("canvas").getContext("webgl2"); hasGl = !!probe; var lose = probe && probe.getExtension("WEBGL_lose_context"); if (lose) lose.loseContext(); } catch (e) { }
    if (!hasGl) noGl.forEach(function (el) { el.hidden = false; });
  }

  /* ---------- diamond bench ---------- */
  /* The bench's state, and everything said about a grade, come from the site as it was; what
     changed is the stone. Both canvases are gem.js stones that re-read their data-* attributes,
     so drawing is one line: write the state onto them. */
  var VERD = { buy: "Where value lives", care: "Judge in person", skip: "Skip this" };
  var TABS = ["cut", "color", "clarity", "carat", "shape"];
  var bench = { tab: "cut", shape: "round", carat: 1.00, color: 3, clarity: 5, cut: 0, group: "classic" };
  var MAGIC = [0.50, 0.75, 1.00, 1.50, 2.00, 3.00];
  function caratToMm(ct, shape) {
    var d = 6.4 * Math.pow(ct, 1 / 3);
    return d * (D.SHAPES[shape] ? D.SHAPES[shape].spread : 1);
  }
  /* The outline of each shape, for the small drawing on its button in the shape picker. */
  function shapePath(shape) {
    switch (shape) {
      case "oval":      return '<ellipse cx="100" cy="100" rx="58" ry="80"/>';
      case "cushion":   return '<path d="M42 30 Q30 30 30 42 L30 158 Q30 170 42 170 L158 170 Q170 170 170 158 L170 42 Q170 30 158 30 Z"/>';
      case "emerald":   return '<path d="M62 24 L138 24 L170 56 L170 144 L138 176 L62 176 L30 144 L30 56 Z"/>';
      case "princess":  return '<rect x="28" y="28" width="144" height="144"/>';
      case "radiant":   return '<path d="M60 26 L140 26 L172 58 L172 142 L140 174 L60 174 L28 142 L28 58 Z"/>';
      case "pear":      return '<path d="M100 18 C132 60 158 92 158 122 C158 154 132 180 100 180 C68 180 42 154 42 122 C42 92 68 60 100 18 Z"/>';
      case "marquise":  return '<path d="M100 16 C132 54 148 82 148 100 C148 118 132 146 100 184 C68 146 52 118 52 100 C52 82 68 54 100 16 Z"/>';
      case "asscher":   return '<path d="M58 24 L142 24 L176 58 L176 142 L142 176 L58 176 L24 142 L24 58 Z"/>';
      case "elongated": return '<path d="M50 34 Q34 34 34 50 L34 150 Q34 166 50 166 L150 166 Q166 166 166 150 L166 50 Q166 34 150 34 Z"/>';
      case "hexagon":   return '<path d="M100 18 L168 59 L168 141 L100 182 L32 141 L32 59 Z"/>';
      case "kite":      return '<path d="M100 14 L164 86 L100 186 L36 86 Z"/>';
      case "shield":    return '<path d="M38 28 L162 28 L162 108 Q162 150 100 180 Q38 150 38 108 Z"/>';
      case "trillion":  return '<path d="M100 24 L172 160 Q176 170 166 170 L34 170 Q24 170 28 160 Z"/>';
      case "oldmine":   return '<path d="M46 32 Q32 32 32 46 L32 154 Q32 168 46 168 L154 168 Q168 168 168 154 L168 46 Q168 32 154 32 Z"/>';
      default:          return '<circle cx="100" cy="100" r="76"/>';
    }
  }
  function ratioText(sh) { return sh.ratio === 1 ? "1.00" : sh.ratio.toFixed(2); }
  function chipHTML(label, sel, data, cls) { return '<button type="button" class="' + (cls || "chip") + '" aria-pressed="' + sel + '" ' + data + ">" + esc(label) + "</button>"; }
  function shapeKeys() {
    return Object.keys(D.SHAPES).filter(function (k) { return bench.group === "alt" ? !!D.SHAPES[k].alt : !D.SHAPES[k].alt; });
  }
  function caratDetail() {
    var ct = bench.carat, mm = caratToMm(ct, bench.shape), nearMagic = null, head, body, tag;
    MAGIC.forEach(function (m) { if (ct > m && ct <= m + 0.09) nearMagic = m; });
    if (nearMagic) {
      head = "Just over a threshold"; tag = "care";
      body = "At " + ct.toFixed(2) + " ct you're paying the premium for crossing " + nearMagic.toFixed(2) + " without the size to show for it. Drop to about " + (nearMagic - 0.05).toFixed(2) + " ct — roughly " + caratToMm(nearMagic - 0.05, bench.shape).toFixed(1) + " mm against " + mm.toFixed(1) + " mm — and nobody will ever see the difference.";
    } else if (ct < 0.55) {
      head = "Small and sharp"; tag = "buy";
      body = "Under about 0.55 ct you can drop two color grades and a clarity grade with no visible cost — tint and inclusions simply don't show at this size. Put every spare dollar into cut instead.";
    } else if (ct < 1.0) {
      head = "The value band"; tag = "buy";
      body = "Between 0.6 and 0.95 ct, stones sit below the one-carat price wall while looking almost identical to it. A 0.92 ct reads as a carat to everyone who isn't holding a scale.";
    } else if (ct < 1.8) {
      head = "Where color starts to show"; tag = "buy";
      body = "Above a carat, warmth becomes visible from the side and inclusions get easier to spot. Hold the line at G color and VS2 clarity here rather than trading them for weight.";
    } else {
      head = "Large enough to be scrutinized"; tag = "care";
      body = "At " + ct.toFixed(2) + " ct every grade is visible — color face-up, inclusions to the naked eye, and any cut compromise. This is the size where paying for F/VS1 and an Excellent cut stops being vanity. Also check the setting: a stone this size needs six prongs or a bezel.";
    }
    return { eyebrow: "At this weight", head: head, body: body, v: tag };
  }
  function benchDetail() {
    var c;
    if (bench.tab === "cut") { c = D.CUTS[bench.cut]; return { eyebrow: "Cut grade", head: c.g, body: c.d, v: c.v }; }
    if (bench.tab === "color") { c = D.COLORS[bench.color]; return { eyebrow: c.band, head: "Grade " + c.g, body: c.d, v: c.v }; }
    if (bench.tab === "clarity") { c = D.CLARITY[bench.clarity]; return { eyebrow: c.name, head: c.g, body: c.d, v: c.v }; }
    if (bench.tab === "carat") return caratDetail();
    c = D.SHAPES[bench.shape];
    return { eyebrow: "Length-to-width " + ratioText(c) + " · about " + Math.round((c.spread - 1) * 100) + "% spread vs a round", head: c.name, body: c.note, tip: c.tip };
  }
  function buildScales() {
    $("#cutScale").innerHTML = D.CUTS.map(function (g, i) { return chipHTML(g.g, false, 'data-k="cut" data-i="' + i + '"'); }).join("");
    $("#colorScale").innerHTML = D.COLORS.map(function (g, i) { return chipHTML(g.g, false, 'data-k="color" data-i="' + i + '"'); }).join("");
    $("#clarityScale").innerHTML = D.CLARITY.map(function (g, i) { return chipHTML(g.g, false, 'data-k="clarity" data-i="' + i + '"'); }).join("");
  }
  function buildShapes() {
    $("#shapeGrid").innerHTML = shapeKeys().map(function (k) {
      return '<button type="button" class="chip wide shape" aria-pressed="false" data-k="shape" data-i="' + k + '">' +
        '<svg viewBox="0 0 200 200" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="12" stroke-linejoin="round">' + shapePath(k) + "</g></svg>" +
        esc(D.SHAPES[k].name) + "</button>";
    }).join("");
  }
  function renderBench(changed) {
    var s = bench, sh = D.SHAPES[s.shape];
    TABS.forEach(function (t) {
      var on = s.tab === t, tab = $("#tab-" + t);
      tab.setAttribute("aria-selected", String(on)); tab.tabIndex = on ? 0 : -1;
      $("#panel-" + t).hidden = !on;
      var f = $("#facts-" + t); if (f) f.hidden = !on;
    });
    $$("#bench [data-k]").forEach(function (b) {
      var k = b.dataset.k;
      b.setAttribute("aria-pressed", String(k === "shape" ? b.dataset.i === s.shape : +b.dataset.i === s[k]));
    });
    $$("#shapeModes [data-group]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.group === s.group)); });
    var mm = caratToMm(s.carat, s.shape);
    $("#caratVal").textContent = s.carat.toFixed(2) + " ct";
    $("#caratMm").textContent = mm.toFixed(1) + " mm across, " + sh.name.toLowerCase();
    var d = benchDetail(), pill = $("#verdictPill");
    pill.hidden = !d.v;
    if (d.v) { pill.textContent = VERD[d.v] || VERD.care; pill.dataset.v = VERD[d.v] ? d.v : "care"; }
    $("#verdictGrade").textContent = d.eyebrow; $("#verdictHead").textContent = d.head; $("#verdictText").textContent = d.body;
    $("#verdictTip").hidden = !d.tip; $("#verdictTip span").textContent = d.tip || "";
    var spec = { shape: sh.name, carat: s.carat.toFixed(2) + " ct", mm: mm.toFixed(1) + " mm", color: D.COLORS[s.color].g, clarity: D.CLARITY[s.clarity].g, cut: D.CUTS[s.cut].g };
    $$("[data-spec]").forEach(function (el) { el.textContent = spec[el.dataset.spec]; });
    $$("[data-bench-gem]").forEach(function (c) {
      c.dataset.shape = s.shape; c.dataset.cut = spec.cut; c.dataset.color = spec.color; c.dataset.clarity = spec.clarity; c.dataset.carat = String(s.carat);
      c.setAttribute("aria-label", (c.dataset.view === "top" ? "Face-up: " : "From the side: ") + sh.name + ", " + s.carat.toFixed(2) + " carat, color " + spec.color + ", clarity " + spec.clarity + ", " + spec.cut + " cut");
    });
    if (changed && cinematic) {
      var card = $("#verdict"); card.classList.remove("swap"); void card.offsetWidth; card.classList.add("swap");
      var st = $("#benchStage"); st.classList.remove("pulse"); void st.offsetWidth; st.classList.add("pulse");
    }
  }
  if ($("#bench")) {
    buildScales(); buildShapes();
    $("#bench").addEventListener("click", function (e) {
      var t = e.target.closest("button"); if (!t) return;
      if (t.dataset.tab) { bench.tab = t.dataset.tab; renderBench(false); return; }
      if (t.dataset.group) { bench.group = t.dataset.group; buildShapes(); renderBench(false); return; }
      if (t.dataset.k) { bench[t.dataset.k] = t.dataset.k === "shape" ? t.dataset.i : +t.dataset.i; renderBench(true); }
    });
    $("#benchTabs").addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var i = TABS.indexOf(bench.tab);
      bench.tab = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length]; renderBench(false); $("#tab-" + bench.tab).focus(); e.preventDefault();
    });
    $("#caratSlider").addEventListener("input", function (e) { bench.carat = parseInt(e.target.value, 10) / 100; renderBench(false); });
    renderBench(false);
  }

  /* ---------- ring builder ---------- */
  var SETTINGS = [
    { id: "six", name: "Six-prong", tag: "Most secure solitaire", word: "six-prong solitaire", d: "One stone, six prongs. The default for a reason: it never looks dated and it puts every dollar into the center. Six prongs are more secure; four show more stone." },
    { id: "four", name: "Four-prong", tag: "Shows more stone", word: "four-prong solitaire", d: "One stone, four prongs. Slightly more of the diamond on show and a squarer look from above, with two fewer points holding it, so have the prongs checked every year or two." },
    { id: "bezel", name: "Bezel", tag: "Best for active hands", word: "full bezel", d: "A metal rim around the whole stone. The most secure setting there is, and the one that doesn't snag on gloves, hair, climbing holds or patients. Slightly modern, slightly less sparkle." },
    { id: "halo", name: "Halo", tag: "Maximizes size", word: "halo", d: "A ring of small stones around the center, making it read half a carat larger. Maximum apparent size per dollar. A hidden halo, visible only from the side, gets the sparkle without the era stamp." }
  ];
  var METALS = [
    { id: "platinum", name: "Platinum", sw: "#D6D7D8", upkeep: "None required; develops a soft grey patina that can be polished back.", pick: "They have a nickel allergy, or you want prongs that hold for decades without re-tipping." },
    { id: "white", name: "14k white gold", sw: "#E6E4DD", upkeep: "Rhodium replating every 1–3 years to stay bright white.", pick: "You want the platinum look for less, and don't mind the replating appointment." },
    { id: "yellow", name: "18k yellow gold", sw: "#D8AE62", upkeep: "Low; polish occasionally. Softer than 14k, so it scratches and softens over time.", pick: "They wear warm tones, or the stone is I–K and you want the warmth hidden." },
    { id: "rose", name: "Rose gold", sw: "#D49C8A", upkeep: "Low; never needs plating. Very durable thanks to the copper alloy.", pick: "They like it. Note that copper can irritate sensitive skin." }
  ];
  var RSHAPES = ["round", "oval", "cushion", "emerald", "pear", "princess", "marquise", "radiant"];
  var ring = { setting: "six", metal: "platinum", shape: "oval", carat: 1.2 };
  function renderRing(changed) {
    var s = ring;
    $("#ringSettings").innerHTML = SETTINGS.map(function (x) { return '<button type="button" class="opt" aria-pressed="' + (x.id === s.setting) + '" data-r="setting" data-v="' + x.id + '"><b>' + esc(x.name) + "</b><small>" + esc(x.tag) + "</small></button>"; }).join("");
    $("#ringMetals").innerHTML = METALS.map(function (x) { return '<button type="button" class="opt metal" aria-pressed="' + (x.id === s.metal) + '" data-r="metal" data-v="' + x.id + '"><span class="sw" style="background:' + x.sw + '"></span>' + esc(x.name) + "</button>"; }).join("");
    $("#ringShapes").innerHTML = RSHAPES.map(function (id) { return chipHTML(D.SHAPES[id].name, id === s.shape, 'data-r="shape" data-v="' + id + '"', "chip wide"); }).join("");
    var set = SETTINGS.filter(function (x) { return x.id === s.setting; })[0], met = METALS.filter(function (x) { return x.id === s.metal; })[0], sh = D.SHAPES[s.shape];
    var mm = 6.4 * Math.pow(s.carat, 1 / 3) * (sh.spread || 1);
    $("#setName").textContent = set.name; $("#setText").textContent = set.d;
    $("#metName").textContent = met.name; $("#upkeep").textContent = met.upkeep; $("#pickIf").textContent = met.pick;
    $("#shapeName").textContent = sh.name; $("#shapeTip").textContent = sh.tip;
    $("#ringCaratOut").textContent = s.carat.toFixed(2) + " ct · " + mm.toFixed(1) + " mm";
    // GIA issues a cut grade for round brilliants only; for every other shape the line asks for
    // the two finish grades a report does carry, as the cut tab on the diamonds page says.
    $("#spec").textContent = s.carat.toFixed(2) + " ct " + sh.name.toLowerCase() + " · " + set.word + " · " + met.name.toLowerCase() + " · G VS2, " + (s.shape === "round" ? "Excellent cut" : "Excellent polish and symmetry");
    var g = $("#ringGem"); g.dataset.shape = s.shape; g.dataset.setting = s.setting; g.dataset.metal = s.metal; g.dataset.carat = String(s.carat);
    if (changed && cinematic && g.__gem) g.__gem.vyaw = 6.5;
  }
  if ($("#ring")) {
    $("#ring").addEventListener("click", function (e) {
      var t = e.target.closest("button[data-r]"); if (!t) return;
      ring[t.dataset.r] = t.dataset.v; renderRing(true);
      var b = $('#ring button[data-r="' + t.dataset.r + '"][data-v="' + t.dataset.v + '"]'); b && b.focus();
    });
    $("#ringRange").addEventListener("input", function (e) { ring.carat = Math.max(0.3, +e.target.value / 100); renderRing(false); });
    $("#copySpec").addEventListener("click", function () {
      var txt = $("#spec").textContent, msg = $("#copyMsg");
      function done(ok) { msg.textContent = ok ? "Copied" : "Select the line above and copy it"; msg.hidden = false; setTimeout(function () { msg.hidden = true; }, 2400); }
      function selectSpec() { var r = document.createRange(); r.selectNodeContents($("#spec")); var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); }
      try { navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { selectSpec(); done(false); }); } catch (err) { selectSpec(); done(false); }
    });
    renderRing(false);
  }
})();
