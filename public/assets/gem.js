/* Just Not The Ring — live 3D diamond renderer.
 *
 * A physically-based, ray-traced stone: every facet is a plane, light enters
 * through the crown, bounces inside with total internal reflection and real
 * Fresnel loss, picks up colour by Beer–Lambert absorption, is dimmed by
 * inclusions, and leaves split by wavelength (dispersion = "fire").
 * Optional ray-marched setting (prongs / bezel / halo) and band.
 *
 * Usage: any <canvas data-gem="1"> on the page is picked up automatically,
 * and re-reads its data-* attributes whenever they change.
 *
 *   data-shape    round oval cushion elongated princess radiant emerald asscher
 *                 pear marquise hexagon trillion kite shield rosecut oldmine
 *   data-cut      Excellent | Very Good | Good | Fair | Poor   (or 0–4)
 *   data-color    D … Z  (or "N–R", "S–Z")
 *   data-clarity  FL IF VVS1 VVS2 VS1 VS2 SI1 SI2 I1 I2–I3
 *   data-carat    number (stone is drawn to true relative size)
 *   data-setting  none | four | six | bezel | halo        (ring mode if not none)
 *   data-metal    platinum | white | yellow | rose
 *   data-env      dusk | studio | night
 *   data-spin     degrees/second (default 16; 0 = still). Reduced motion → 0.
 *   data-tilt     camera elevation in degrees
 *   data-view     angle | top | side
 *   data-fit      fill (frame the stone) | scale (fixed camera: carat changes size)
 *   data-zoom     multiplier on the framing
 *   data-scroll   degrees of extra rotation per 1000px of page scroll
 *   data-exposure number, default 1
 *   data-fire     dispersion multiplier, default 1
 */
(function () {
  "use strict";
  if (window.__JNTRGem) return;

  /* ---------------- grade tables ---------------- */
  var CUT = {
    // crown angle, pavilion angle, table, girdle half-thickness
    "excellent": [34.5, 40.8, 0.56, 0.018],
    "very good": [33.0, 41.6, 0.60, 0.022],
    "good":      [31.0, 42.6, 0.63, 0.030],
    "fair":      [28.0, 38.6, 0.66, 0.035],
    "poor":      [24.0, 37.2, 0.70, 0.045]
  };
  var CUT_ORDER = ["excellent", "very good", "good", "fair", "poor"];
  var COLOR_ORDER = "DEFGHIJKLMNOPQRSTUVWXYZ";
  var CLARITY = {
    // count, radius, darkness (0 = black, 1 = invisible)
    "fl": [0, 0, 1], "if": [0, 0, 1],
    "vvs1": [1, 0.010, 0.55], "vvs2": [2, 0.012, 0.5],
    "vs1": [2, 0.018, 0.42], "vs2": [3, 0.024, 0.38],
    "si1": [4, 0.034, 0.30], "si2": [6, 0.046, 0.24],
    "i1": [8, 0.070, 0.16], "i2": [11, 0.095, 0.10], "i3": [11, 0.095, 0.10]
  };
  var METAL = {
    platinum: [0.78, 0.78, 0.76],
    white: [0.86, 0.85, 0.82],
    yellow: [1.00, 0.76, 0.38],
    rose: [0.98, 0.64, 0.54]
  };
  var SETTING = { none: 0, four: 1, six: 2, bezel: 3, halo: 4 };
  var ENV = { dusk: 0, studio: 1, night: 2 };

  function cutKey(v) {
    if (v == null || v === "") return "excellent";
    if (/^\d$/.test(v)) return CUT_ORDER[Math.min(4, +v)];
    v = String(v).toLowerCase().trim();
    return CUT[v] ? v : "excellent";
  }
  function colorIndex(v) {
    if (v == null || v === "") return 3;
    v = String(v).toUpperCase().trim();
    if (/^\d+$/.test(v)) return Math.min(22, +v);
    if (v.indexOf("N") === 0 && v.length > 1) return 12; // N–R band
    if (v.indexOf("S") === 0 && v.length > 1) return 19; // S–Z band
    var i = COLOR_ORDER.indexOf(v.charAt(0));
    return i < 0 ? 3 : i;
  }
  function clarityKey(v) {
    if (v == null || v === "") return "vs2";
    v = String(v).toLowerCase().replace(/[\s–-].*$/, "").trim();
    if (/^\d+$/.test(v)) return ["fl", "if", "vvs1", "vvs2", "vs1", "vs2", "si1", "si2", "i1", "i2"][Math.min(9, +v)];
    return CLARITY[v] ? v : "vs2";
  }

  /* ---------------- geometry ---------------- */
  var D2R = Math.PI / 180;

  function plane(nx, ny, nz, d) {
    var l = Math.hypot(nx, ny, nz);
    return [nx / l, ny / l, nz / l, d / l];
  }
  // plane whose surface rises/falls radially along azimuth a with slope s,
  // passing through radial distance r at height y.  up=true → crown facet.
  function radialPlane(a, s, r, y, up) {
    var c = Math.cos(a), si = Math.sin(a);
    if (up) return plane(s * c, 1, s * si, y + s * r);     //  s·ρ + y ≤ y0 + s r
    return plane(s * c, -1, s * si, -y + s * r);             //  s·ρ − y ≤ −y0 + s r
  }

  // Inside test for a girdle outline (vertical planes + up to 2 ellipses).
  function insideOutline(o, x, z) {
    for (var i = 0; i < o.planes.length; i++) {
      var p = o.planes[i];
      if (p[0] * x + p[1] * z > p[2] + 1e-9) return false;
    }
    for (var j = 0; j < o.cyl.length; j++) {
      var c = o.cyl[j], dx = (x - c[0]) / c[2], dz = (z - c[1]) / c[3];
      if (dx * dx + dz * dz > 1 + 1e-9) return false;
    }
    return true;
  }
  function boundaryR(o, a) {
    var lo = 0, hi = 4, c = Math.cos(a), s = Math.sin(a);
    for (var k = 0; k < 40; k++) {
      var m = (lo + hi) / 2;
      if (insideOutline(o, c * m, s * m)) lo = m; else hi = m;
    }
    return lo;
  }

  // The modern round brilliant: 57 facets placed at real proportions.
  function roundBrilliant(cut, opts) {
    opts = opts || {};
    var crownA = (opts.crown || cut[0]) * D2R, pavA = (opts.pav || cut[1]) * D2R;
    var tR = opts.table || cut[2], g = cut[3];
    var sb = Math.tan(crownA), sp = Math.tan(pavA);
    var crownH = (1 - tR) * sb, yT = g + crownH;
    var P = [];
    P.push([0, 1, 0, yT]);
    var c225 = Math.cos(22.5 * D2R), c1125 = Math.cos(11.25 * D2R);
    var sStar = Math.tan(crownA * 0.62);
    var rU = (1 + tR) / 2 + 0.04, sU = sb * (1 - c1125 * rU) / (1 - rU);
    var rL = 1 - 0.77, sL = sp * (1 - c1125 * rL) / (1 - rL);
    for (var k = 0; k < 8; k++) {
      var a = k * 45 * D2R, as = a + 22.5 * D2R;
      P.push(radialPlane(a, sb, 1, g, true));                       // bezel
      // star: passes through the table edge midpoint
      var c = Math.cos(as), s = Math.sin(as);
      P.push(plane(sStar * c, 1, sStar * s, yT + sStar * tR * c225));
      P.push(radialPlane(a, sp, 1, -g, false));                     // pavilion main
    }
    for (var u = 0; u < 16; u++) {
      var au = (u * 22.5 + 11.25) * D2R;
      P.push(radialPlane(au, sU, 1, g, true));                      // upper girdle
      P.push(radialPlane(au, sL, 1, -g, false));                    // lower girdle
    }
    var bottom = -(g + sp);
    if (opts.culet) { P.push([0, -1, 0, -(bottom + opts.culet)]); bottom += opts.culet; }
    return { planes: P, cyl: [[0, 0, 1, 1]], top: yT, bottom: bottom };
  }

  // A brilliant-style faceting for any convex outline.
  function genericBrilliant(outline, cut, opts) {
    opts = opts || {};
    var crownA = (opts.crown || cut[0]) * D2R, pavA = (opts.pav || cut[1]) * D2R;
    var tf = opts.table || Math.min(0.78, cut[2] + 0.08), g = cut[3];
    var N = opts.n || 16;
    var P = [], crownH = (1 - tf) * Math.tan(crownA) * 0.9;
    var depth = Math.tan(pavA) * (opts.depthScale || 1);
    var yT = g + crownH;
    P.push([0, 1, 0, yT]);
    for (var k = 0; k < N; k++) {
      var a = (k * 360 / N + (opts.rot || 0)) * D2R;
      var rb = boundaryR(outline, a);
      // crown facet reaching the table outline
      P.push(radialPlane(a, crownH / (rb * (1 - tf)), rb, g, true));
      // second crown ring between, a touch steeper (star/upper-girdle feel)
      var a2 = a + 180 / N * D2R, rb2 = boundaryR(outline, a2);
      P.push(radialPlane(a2, 1.12 * crownH / (rb2 * (1 - tf)), rb2, g, true));
      // pavilion mains to the culet, every other azimuth
      if (k % 2 === 0 || N <= 8) P.push(radialPlane(a, depth / rb, rb, -g, false));
      // lower halves
      P.push(radialPlane(a2, depth / rb2 * 1.06, rb2, -g, false));
    }
    var o = outline;
    for (var i = 0; i < o.planes.length; i++) P.push([o.planes[i][0], 0, o.planes[i][1], o.planes[i][2]]);
    var bottom = -(g + depth);
    if (opts.flatBack) { P = P.filter(function (p) { return p[1] >= 0; }); P.push([0, -1, 0, g]); bottom = -g; }
    return { planes: P, cyl: o.cyl.slice(), top: yT, bottom: bottom };
  }

  // Step cut: concentric tiers parallel to every side of a polygon outline.
  function stepCut(outline, cut, opts) {
    opts = opts || {};
    var g = cut[3], q = (CUT_ORDER.indexOf(cut._key) || 0);
    var tf = opts.table || 0.62;
    var cA = opts.crown || [40, 30, 20], pA = opts.pav || [52, 45, 37];
    var pw = [0.38, 0.34, 0.28];
    // poorer cuts flatten the pavilion (window) — same physics as the round
    var pavShift = [0, 1.5, 3, -6, -9][q] || 0;
    var w = (1 - tf) / cA.length, P = [];
    var yC = g;
    for (var t = 0; t < cA.length; t++) yC += w * Math.tan(cA[t] * D2R);
    P.push([0, 1, 0, yC]);
    var yB = -g;
    for (t = 0; t < pA.length; t++) yB -= pw[t] * Math.tan((pA[t] + pavShift) * D2R);
    for (var i = 0; i < outline.planes.length; i++) {
      var o = outline.planes[i], nx = o[0], nz = o[1], d = o[2];
      P.push([nx, 0, nz, d]);
      var y = g, r = d;
      for (t = 0; t < cA.length; t++) {
        var s = Math.tan(cA[t] * D2R);
        P.push(plane(s * nx, 1, s * nz, y + s * r));
        y += w * s; r -= w;
      }
      y = -g; r = d;
      for (t = 0; t < pA.length; t++) {
        var sp = Math.tan((pA[t] + pavShift) * D2R);
        P.push(plane(sp * nx, -1, sp * nz, -y + sp * r));
        y -= pw[t] * sp; r -= pw[t];
      }
    }
    P.push([0, -1, 0, -yB + 0.0]);
    return { planes: P, cyl: [], top: yC, bottom: yB };
  }

  function polyOutline(n, rot, dists) {
    var planes = [];
    for (var i = 0; i < n; i++) {
      var a = (rot + i * 360 / n) * D2R;
      planes.push([Math.cos(a), Math.sin(a), dists ? dists[i % dists.length] : 1]);
    }
    return { planes: planes, cyl: [] };
  }
  function octagon(corner) {
    var p = polyOutline(8, 0, [1, corner]);
    return p;
  }

  function scaleGeom(G, sx, sz) {
    var P = G.planes.map(function (p) {
      var nx = p[0] / sx, ny = p[1], nz = p[2] / sz, l = Math.hypot(nx, ny, nz);
      return [nx / l, ny / l, nz / l, p[3] / l];
    });
    var C = G.cyl.map(function (c) { return [c[0] * sx, c[1] * sz, c[2] * sx, c[3] * sz]; });
    // overall extent for framing
    var ext = 0;
    for (var a = 0; a < 360; a += 5) {
      var o = { planes: P.filter(function (p) { return Math.abs(p[1]) < 1e-6; }).map(function (p) { return [p[0], p[2], p[3]]; }), cyl: C };
      ext = Math.max(ext, boundaryR(o, a * D2R));
    }
    var go = { planes: P.filter(function (p) { return Math.abs(p[1]) < 1e-6; }).map(function (p) { return [p[0], p[2], p[3]]; }), cyl: C };
    var ex = Math.max(boundaryR(go, 0), boundaryR(go, Math.PI)), ez = Math.max(boundaryR(go, Math.PI / 2), boundaryR(go, -Math.PI / 2));
    return { planes: P, cyl: C, top: G.top, bottom: G.bottom, ext: ext, ex: ex, ez: ez, sx: sx, sz: sz };
  }

  function buildShape(shape, ck) {
    var cut = CUT[ck].slice(); cut._key = ck;
    var G;
    switch (shape) {
      case "oval": G = scaleGeom(roundBrilliant(cut), 1, 1.38); break;
      case "cushion": G = scaleGeom(genericBrilliant({ planes: polyOutline(4, 0).planes, cyl: [[0, 0, 1.2, 1.2]] }, cut, { n: 16, table: 0.6, crown: cut[0] + 2 }), 1, 1); break;
      case "elongated": G = scaleGeom(genericBrilliant({ planes: polyOutline(4, 0).planes, cyl: [[0, 0, 1.2, 1.2]] }, cut, { n: 16, table: 0.6, crown: cut[0] + 2 }), 1, 1.35); break;
      case "princess": G = scaleGeom(genericBrilliant(polyOutline(4, 0), cut, { n: 16, table: 0.7, rot: 0 }), 1, 1); break;
      case "radiant": G = scaleGeom(genericBrilliant(octagon(1.24), cut, { n: 16, table: 0.64 }), 1, 1.3); break;
      case "emerald": G = scaleGeom(stepCut(octagon(1.24), cut, {}), 1, 1.45); break;
      case "asscher": G = scaleGeom(stepCut(octagon(1.12), cut, { table: 0.55, crown: [44, 34, 24] }), 1, 1); break;
      case "pear": {
        var L = 2.0, zc = -0.5, nz = 1 / L, nx = Math.sqrt(1 - nz * nz);
        var o = { planes: [[nx, nz, nz * (zc + L)], [-nx, nz, nz * (zc + L)]], cyl: [[0, zc, 1, 1]] };
        G = scaleGeom(genericBrilliant(o, cut, { n: 16, table: 0.58 }), 1, 1); break;
      }
      case "marquise": G = scaleGeom(genericBrilliant({ planes: [], cyl: [[1.4, 0, 2.4, 2.4], [-1.4, 0, 2.4, 2.4]] }, cut, { n: 16, table: 0.56 }), 1, 1); break;
      case "hexagon": G = scaleGeom(stepCut(polyOutline(6, 0), cut, {}), 1, 1.12); break;
      case "trillion": G = scaleGeom(genericBrilliant(polyOutline(3, 90, [0.62]), cut, { n: 12, table: 0.62, depthScale: 0.9 }), 1.35, 1.35); break;
      case "kite": {
        var ok = { planes: [], cyl: [] };
        [[30, 0.85], [150, 0.85], [-60, 0.55], [-120, 0.55]].forEach(function (q) { var a = q[0] * D2R; ok.planes.push([Math.cos(a), Math.sin(a), q[1]]); });
        G = scaleGeom(genericBrilliant(ok, cut, { n: 12, table: 0.62 }), 1.25, 1.25); break;
      }
      case "shield": {
        var os = { planes: [], cyl: [] };
        [[-90, 0.75], [0, 1], [180, 1], [55, 0.95], [125, 0.95]].forEach(function (q) { var a = q[0] * D2R; os.planes.push([Math.cos(a), Math.sin(a), q[1]]); });
        G = scaleGeom(stepCut(os, cut, {}), 1, 1.1); break;
      }
      case "rosecut": G = scaleGeom(genericBrilliant({ planes: [], cyl: [[0, 0, 1, 1]] }, cut, { n: 12, table: 0.05, crown: 38, flatBack: true }), 1, 1.05); break;
      case "oldmine": {
        var om = genericBrilliant({ planes: polyOutline(4, 45).planes, cyl: [[0, 0, 1.25, 1.25]] }, cut, { n: 16, table: 0.42, crown: 40 });
        om.planes.push([0, -1, 0, -(om.bottom + 0.1)]); om.bottom += 0.1;
        G = scaleGeom(om, 1, 1.05); break;
      }
      default: G = scaleGeom(roundBrilliant(cut), 1, 1);
    }
    if (G.planes.length > 96) G.planes.length = 96;
    return G;
  }

  /* ---------------- shader ---------------- */
  var VS = "#version 300 es\nin vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";
  var FS = [
    "#version 300 es",
    "precision highp float;",
    "out vec4 o;",
    "uniform vec2 uRes; uniform vec4 uView;", // view: x,y offset, w,h in px
    "uniform vec3 uCam; uniform mat3 uBasis; uniform float uFocal;",
    "uniform mat3 uRot;", // object -> world
    "uniform vec4 uP[96]; uniform int uNP;",
    "uniform vec4 uCyl[2]; uniform int uNC;",
    "uniform vec3 uStone; uniform float uR;", // stone centre (model space) and scale
    "uniform vec3 uIOR; uniform vec3 uAbs;",
    "uniform vec4 uInc[12]; uniform int uNI; uniform float uIncDark;",
    "uniform int uEnv; uniform float uExp; uniform vec3 uViewer;",
    "uniform int uSet; uniform vec3 uMetal; uniform float uBandR; uniform float uStoneTop; uniform float uStoneBot; uniform float uSz; uniform float uSx;",
    "uniform vec4 uBg;",
    "const float PI=3.14159265;",
    "float h11(float n){return fract(sin(n)*43758.5453);}",
    // ---------- environment ----------
    "vec3 envW(vec3 d){",
    "  float y=d.y; vec3 c;",
    "  float az=atan(d.x,d.z); float el=asin(clamp(y,-1.,1.));",
    "  if(uEnv==1){",
    "    c=mix(vec3(.30,.30,.32),vec3(.82,.82,.84),smoothstep(-.3,.7,y));",
    "    c+=vec3(7.)*smoothstep(.06,.0,abs(az-1.05))*smoothstep(-.1,0.,el)*smoothstep(1.,.8,el);",
    "    c+=vec3(7.)*smoothstep(.06,.0,abs(az+1.25))*smoothstep(-.1,0.,el)*smoothstep(1.,.8,el);",
    "    c*=mix(.08,1.,smoothstep(.04,.12,abs(az-2.4)));",
    "    c*=mix(.08,1.,smoothstep(.05,.14,abs(az+2.2)));",
    "  } else {",
    "    vec3 warm=vec3(1.05,.74,.58), dusk=vec3(.24,.36,.62), deep=vec3(.035,.055,.13);",
    "    if(uEnv==2){warm=vec3(.45,.36,.28);dusk=vec3(.07,.10,.2);deep=vec3(.01,.015,.04);}",
    "    c = y>0. ? mix(mix(warm,dusk,smoothstep(0.,.3,y)),deep,smoothstep(.3,1.,y)) : mix(warm*.3,vec3(.015,.02,.04),smoothstep(0.,-.2,y));",
    "    float strip = (uEnv==2)?5.:7.;",
    "    c+=vec3(.85,.9,1.)*strip*smoothstep(.05,.0,abs(az-1.15))*smoothstep(-.2,0.,el)*smoothstep(1.2,.95,el);",
    "    c+=vec3(1.,.88,.7)*strip*smoothstep(.04,.0,abs(az+1.35))*smoothstep(-.1,.05,el)*smoothstep(1.1,.85,el);",
    "  }",
    // three modest softboxes rather than one huge one
    "  c+=vec3(1.)*6.*smoothstep(.972,.982,dot(d,normalize(vec3(.1,1.,-.3))));",
    "  c+=vec3(.95,.97,1.)*7.*smoothstep(.985,.991,dot(d,normalize(vec3(-.9,.9,-.2))));",
    "  c+=vec3(1.,.95,.88)*7.*smoothstep(.986,.992,dot(d,normalize(vec3(.8,.7,.5))));",
    // small hard lights: these are what make fire
    "  for(int i=0;i<28;i++){",
    "    float fi=float(i); float a=h11(fi*7.13+1.)*6.2831; float e=mix(.05,1.3,h11(fi*3.71+2.));",
    "    vec3 ld=vec3(cos(e)*sin(a),sin(e),cos(e)*cos(a));",
    "    float k=dot(d,ld); c+=vec3(1.,.97,.93)*(uEnv==1?45.:60.)*smoothstep(.99962,.99988,k);",
    "  }",
    // head shadow: the viewer blocks light coming from behind the camera
    "  float hv=dot(d,uViewer); c*=mix(1.,uEnv==1?.05:.03,smoothstep(.87,.96,hv));",
    "  return c;",
    "}",
    "vec3 envSoft(vec3 d){",
    "  if(uEnv==1) return mix(vec3(.35),vec3(1.4),smoothstep(-.4,.8,d.y));",
    "  return d.y>0.?mix(vec3(.9,.55,.42),vec3(.16,.24,.45),smoothstep(0.,.5,d.y))*(uEnv==2?.4:1.):vec3(.05,.06,.1);",
    "}",
    "float envC(vec3 dObj,int ch){vec3 e=envW(uRot*dObj); return ch==0?e.r:(ch==1?e.g:e.b);}",
    // ---------- convex stone ----------
    "bool enterGem(vec3 ro,vec3 rd,out float tN,out vec3 nN){",
    "  tN=-1e9; float tF=1e9; nN=vec3(0,1,0);",
    "  for(int i=0;i<96;i++){ if(i>=uNP)break; vec4 P=uP[i]; float dn=dot(P.xyz,rd); float ds=P.w-dot(P.xyz,ro);",
    "    if(abs(dn)<1e-7){ if(ds<0.) return false; continue; }",
    "    float t=ds/dn; if(dn<0.){ if(t>tN){tN=t;nN=P.xyz;} } else tF=min(tF,t); }",
    "  for(int j=0;j<2;j++){ if(j>=uNC)break; vec4 C=uCyl[j];",
    "    vec2 o2=(ro.xz-C.xy)/C.zw, d2=rd.xz/C.zw; float A=dot(d2,d2),B=dot(o2,d2),Cc=dot(o2,o2)-1.;",
    "    if(A<1e-9){ if(Cc>0.) return false; continue; }",
    "    float D=B*B-A*Cc; if(D<0.) return false; D=sqrt(D); float t0=(-B-D)/A,t1=(-B+D)/A;",
    "    if(t0>tN){tN=t0; vec2 q=ro.xz+rd.xz*t0-C.xy; nN=normalize(vec3(q.x/(C.z*C.z),0.,q.y/(C.w*C.w)));}",
    "    tF=min(tF,t1); }",
    "  return tN<tF && tN>0.;",
    "}",
    "float exitGem(vec3 p,vec3 d,out vec3 n){",
    "  float tF=1e9; n=vec3(0,1,0);",
    "  for(int i=0;i<96;i++){ if(i>=uNP)break; vec4 P=uP[i]; float dn=dot(P.xyz,d); if(dn>1e-7){ float t=(P.w-dot(P.xyz,p))/dn; if(t<tF){tF=t;n=P.xyz;} } }",
    "  for(int j=0;j<2;j++){ if(j>=uNC)break; vec4 C=uCyl[j];",
    "    vec2 o2=(p.xz-C.xy)/C.zw, d2=d.xz/C.zw; float A=dot(d2,d2); if(A<1e-9) continue; float B=dot(o2,d2),Cc=dot(o2,o2)-1.;",
    "    float D=max(B*B-A*Cc,0.); float t1=(-B+sqrt(D))/A;",
    "    if(t1<tF){tF=t1; vec2 q=p.xz+d.xz*t1-C.xy; n=normalize(vec3(q.x/(C.z*C.z),0.,q.y/(C.w*C.w)));} }",
    "  return max(tF,0.);",
    "}",
    "float fres(float ci,float n1,float n2){ ci=clamp(ci,0.,1.); float st=n1/n2*sqrt(max(0.,1.-ci*ci)); if(st>=1.) return 1.;",
    "  float ct=sqrt(max(0.,1.-st*st)); float rs=(n2*ci-n1*ct)/(n2*ci+n1*ct); float rp=(n1*ci-n2*ct)/(n1*ci+n2*ct); return .5*(rs*rs+rp*rp); }",
    "float incl(vec3 p,vec3 d,float t){ float a=1.;",
    "  for(int i=0;i<12;i++){ if(i>=uNI)break; vec4 S=uInc[i]; float s=clamp(dot(S.xyz-p,d),0.,t); float dd=length(p+d*s-S.xyz);",
    "    a*=mix(uIncDark,1.,smoothstep(S.w*.35,S.w,dd)); } return a; }",
    "float traceCh(vec3 ro,vec3 rd,vec3 n0,float ior,int ch,float absorb){",
    "  float ci=-dot(rd,n0); float F=fres(ci,1.,ior);",
    "  float L=F*envC(reflect(rd,n0),ch);",
    "  vec3 d=refract(rd,n0,1./ior); vec3 p=ro-n0*1e-4; float thr=1.-F;",
    "  for(int b=0;b<8;b++){",
    "    vec3 n; float t=exitGem(p,d,n);",
    "    thr*=exp(-absorb*t*uR)*incl(p,d,t);",
    "    p+=d*t;",
    "    vec3 r=refract(d,-n,ior);",
    "    if(dot(r,r)<1e-6){ d=reflect(d,-n); p-=n*1e-4; continue; }",
    "    float Fi=fres(dot(d,n),ior,1.);",
    "    L+=thr*(1.-Fi)*envC(r,ch);",
    "    thr*=Fi; d=reflect(d,-n); p-=n*1e-4;",
    "    if(thr<.004) break;",
    "  }",
    "  return L;",
    "}",
    // ---------- metal (ray-marched) ----------
    "float sdCap(vec3 p,vec3 a,vec3 b,float r){vec3 pa=p-a,ba=b-a;float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);return length(pa-ba*h)-r;}",
    "float sdTor(vec3 p,vec2 t){vec2 q=vec2(length(p.xz)-t.x,p.y);return length(q)-t.y;}",
    "float sdRB(vec2 p,vec2 b,float r){vec2 q=abs(p)-b+r;return length(max(q,0.))+min(max(q.x,q.y),0.)-r;}",
    "float mapM(vec3 p,out int m){",
    "  m=1;",
    // band: circle in the xy plane, finger along z
    "  float rr=length(p.xy); float bw=1.05+.08*smoothstep(0.,1.,p.y/uBandR);",
    "  float d=sdRB(vec2(rr-(uBandR+.85),p.z),vec2(.8,bw),.55);",
    "  vec3 q=p-uStone; float R=uR;",
    "  vec3 qe=vec3(q.x/uSx,q.y,q.z/uSz);",
    "  float bandTop=uBandR+1.5;",
    "  if(uSet==1||uSet==2){",
    "    int N=uSet==1?4:6; float off=uSet==1?PI*.25:0.;",
    "    for(int i=0;i<6;i++){ if(i>=N)break; float a=off+float(i)*2.*PI/float(N);",
    "      vec3 dir=vec3(cos(a)*uSx,0.,sin(a)*uSz);",
    "      vec3 T=uStone+vec3(dir.x*.93*R,R*(.02+uStoneTop*.25),dir.z*.93*R);",
    "      vec3 M=uStone+vec3(dir.x*1.06*R,-R*.32,dir.z*1.06*R);",
    "      vec3 B=vec3(cos(a)*.9,bandTop-.25,sin(a)*1.0);",
    "      float pr=.24+.05*R;",
    "      d=min(d,min(sdCap(p,T,M,pr),sdCap(p,M,B,pr*.92)));",
    "    }",
    "    vec3 g=qe-vec3(0.,-R*.55,0.); d=min(d,sdTor(g,vec2(R*.62,.17+.03*R)));",
    "  } else if(uSet==3){",
    "    float re=length(qe.xz);",
    "    float y0=bandTop-.35-uStone.y, y1=-R*.3;",
    "    float k=clamp((qe.y-y0)/(y1-y0),0.,1.); float rc=mix(.75,R*1.0,k*k);",
    "    float cone=max(re-rc,max(qe.y-y1,y0-qe.y))*.8;",
    "    float shell=max(abs(re-R*1.03)-R*.075, abs(qe.y+R*.1)-R*.21);",
    "    float lip=sdTor(qe-vec3(0.,R*.1,0.),vec2(R*1.0,R*.055));",
    "    d=min(d,min(cone,min(shell,lip)-.03));",
    "  } else if(uSet==4){",
    "    float hr=R*1.24;",
    "    vec3 h=qe-vec3(0.,-R*.04,0.);",
    "    float ang=atan(h.z,h.x); float n=floor(2.*PI*hr/(R*.34)); float sec=2.*PI/n;",
    "    float a2=mod(ang+sec*.5,sec)-sec*.5; vec2 rp=vec2(cos(a2),sin(a2))*length(h.xz);",
    "    float bead=length(vec3(rp.x-hr,h.y,rp.y))-R*.155;",
    "    float rail=sdTor(h-vec3(0.,-R*.17,0.),vec2(hr,R*.1));",
    "    if(bead<d && bead<rail){ d=bead; m=2; } else d=min(d,rail);",
    "    for(int i=0;i<4;i++){ float a=PI*.25+float(i)*PI*.5; vec3 dir=vec3(cos(a)*uSx,0.,sin(a)*uSz);",
    "      vec3 T=uStone+vec3(dir.x*.95*R,R*.05,dir.z*.95*R); vec3 M=uStone+vec3(dir.x*1.0*R,-R*.4,dir.z*1.0*R); vec3 B=vec3(cos(a)*.9,bandTop-.25,sin(a));",
    "      float c=min(sdCap(p,T,M,.2+.04*R),sdCap(p,M,B,.22+.04*R)); if(c<d){d=c;m=1;} }",
    "  }",
    "  return d;",
    "}",
    "vec3 nrmM(vec3 p){int m;vec2 e=vec2(.002,0.);return normalize(vec3(mapM(p+e.xyy,m)-mapM(p-e.xyy,m),mapM(p+e.yxy,m)-mapM(p-e.yxy,m),mapM(p+e.yyx,m)-mapM(p-e.yyx,m)));}",
    "vec3 aces(vec3 x){return clamp((x*(2.51*x+.03))/(x*(2.43*x+.59)+.14),0.,1.);}",
    "void main(){",
    "  vec2 fc=gl_FragCoord.xy-uView.xy; vec2 uv=(fc-.5*uView.zw)/uView.w*2.;",
    "  vec3 rdW=normalize(uBasis*vec3(uv,uFocal));",
    "  mat3 inv=transpose(uRot);",
    "  vec3 ro=inv*uCam, rd=inv*rdW;",
    "  vec3 col=vec3(0.); float alpha=0.;",
    // stone (local space)
    "  vec3 lo=(ro-uStone)/uR; float tN; vec3 nN; float tG=1e9;",
    "  bool hitG=enterGem(lo,rd,tN,nN); if(hitG) tG=tN*uR;",
    // metal
    "  float tM=1e9; int mat=0;",
    "  if(uSet>0){",
    "    float t=.0; float tmax=min(tG,200.);",
    // bound: sphere around the ring
    "    vec3 bc=vec3(0.,uStone.y*.45,0.); float br=uStone.y+uR*1.6; vec3 oc=ro-bc; float b=dot(oc,rd); float cc=dot(oc,oc)-br*br; float hh=b*b-cc;",
    "    if(hh>0.){ t=max(-b-sqrt(hh),0.); tmax=min(tmax,-b+sqrt(hh));",
    "      for(int i=0;i<140;i++){ int m; float dd=mapM(ro+rd*t,m); if(dd<.002*(1.+t*.02)){tM=t;mat=m;break;} t+=dd*.85; if(t>tmax)break; } }",
    "  }",
    "  if(hitG && tG<=tM){",
    "    vec3 p=lo+rd*tN;",
    "    col.r=traceCh(p,rd,nN,uIOR.r,0,uAbs.r);",
    "    col.g=traceCh(p,rd,nN,uIOR.g,1,uAbs.g);",
    "    col.b=traceCh(p,rd,nN,uIOR.b,2,uAbs.b);",
    "    alpha=1.;",
    "  } else if(tM<1e8){",
    "    vec3 p=ro+rd*tM; vec3 n=nrmM(p);",
    "    vec3 rf=reflect(rd,n); float ct=clamp(dot(-rd,n),0.,1.);",
    "    if(mat==2){",
    "      vec3 jit=normalize(n+.55*(vec3(h11(floor(p.x*9.)+floor(p.y*9.)*7.),h11(floor(p.z*9.)*3.1+floor(p.x*9.)),h11(floor(p.y*9.)*5.3))-.5));",
    "      vec3 e=envW(uRot*reflect(rd,jit));",
    "      col=e*.55+vec3(.06,.07,.09);",
    "    } else {",
    "      vec3 F=uMetal+(1.-uMetal)*pow(1.-ct,5.);",
    "      vec3 e=mix(envW(uRot*rf),envSoft(uRot*rf),.3);",
    // cheap AO
    "      int mm; float ao=clamp(mapM(p+n*.35,mm)/.35,0.,1.); ao=.45+.55*ao;",
    "      col=F*e*ao;",
    "    }",
    "    alpha=1.;",
    "  }",
    "  col*=uExp;",
    "  col=aces(col); col=pow(col,vec3(1./2.2));",
    "  vec3 bg=uBg.rgb; float ba=uBg.a;",
    "  vec3 outc=col*alpha+bg*ba*(1.-alpha); float outa=alpha+ba*(1.-alpha);",
    "  o=vec4(outc,outa);",
    "}"
  ].join("\n");

  /* ---------------- shared GL ---------------- */
  var glc, gl, prog, U = {}, ok = false;
  function initGL() {
    if (gl || ok === null) return ok;
    try {
      glc = document.createElement("canvas");
      glc.width = 8; glc.height = 8;
      gl = glc.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: false });
      if (!gl) { ok = null; return false; }
      function sh(t, s) { var x = gl.createShader(t); gl.shaderSource(x, s); gl.compileShader(x); if (!gl.getShaderParameter(x, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(x)); return x; }
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, "p"); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ["uRes", "uView", "uCam", "uBasis", "uFocal", "uRot", "uP", "uNP", "uCyl", "uNC", "uStone", "uR", "uIOR", "uAbs", "uInc", "uNI", "uIncDark", "uEnv", "uExp", "uViewer", "uSet", "uMetal", "uBandR", "uStoneTop", "uStoneBot", "uSz", "uSx", "uBg"].forEach(function (n) { U[n] = gl.getUniformLocation(prog, n); });
      glc.addEventListener("webglcontextlost", function (e) { e.preventDefault(); ok = null; });
      ok = true;
    } catch (err) {
      if (window.console) console.warn("[gem] WebGL2 unavailable:", err && err.message);
      ok = null;
    }
    return ok;
  }

  /* ---------------- instances ---------------- */
  var insts = [], reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var quality = 1;

  function parseColor(s) {
    if (!s || s === "none" || s === "transparent") return [0, 0, 0, 0];
    var m = /^#?([0-9a-f]{6})$/i.exec(s.trim());
    if (m) { var n = parseInt(m[1], 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1]; }
    return [0, 0, 0, 0];
  }
  function rng(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function Gem(el) {
    this.el = el; this.ctx = el.getContext("2d");
    this.yaw = 0; this.pitch = 0; this.vyaw = 0; this.drag = null;
    this.visible = true; this.dirty = true; this.t0 = performance.now();
    this.read();
    var self = this;
    el.style.touchAction = "pan-y";
    el.addEventListener("pointerdown", function (e) {
      self.drag = { x: e.clientX, y: e.clientY, yaw: self.yaw, pitch: self.pitch, t: performance.now(), lx: e.clientX };
      try { el.setPointerCapture(e.pointerId); } catch (_) { }
    });
    el.addEventListener("pointermove", function (e) {
      if (!self.drag) return;
      var now = performance.now(), dx = e.clientX - self.drag.x, dy = e.clientY - self.drag.y;
      self.yaw = self.drag.yaw + dx * 0.012;
      self.pitch = Math.max(-0.9, Math.min(0.9, self.drag.pitch + dy * 0.006));
      self.vyaw = (e.clientX - self.drag.lx) * 0.012 / Math.max(8, now - self.drag.t) * 1000;
      self.drag.lx = e.clientX; self.drag.t = now; self.dirty = true;
    });
    function end() { self.drag = null; }
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { es.forEach(function (x) { self.visible = x.isIntersecting; if (x.isIntersecting) self.dirty = true; }); }, { rootMargin: "100px" }).observe(el);
    }
  }
  Gem.prototype.read = function () {
    var d = this.el.dataset, prevShape = this.key;
    this.shape = (d.shape || "round").toLowerCase();
    this.cut = cutKey(d.cut);
    this.key = this.shape + "|" + this.cut;
    if (this.key !== prevShape) this.G = buildShape(this.shape, this.cut);
    this.colorI = colorIndex(d.color);
    this.clar = clarityKey(d.clarity);
    this.carat = Math.max(0.1, Math.min(8, parseFloat(d.carat) || 1));
    this.setting = SETTING[(d.setting || "none").toLowerCase()] || 0;
    this.metal = METAL[(d.metal || "platinum").toLowerCase()] || METAL.platinum;
    this.env = ENV[(d.env || "dusk").toLowerCase()] || 0;
    this.spin = reduce ? 0 : (d.spin != null && d.spin !== "" ? parseFloat(d.spin) : 16);
    this.tilt = d.tilt != null && d.tilt !== "" ? parseFloat(d.tilt) : null;
    this.view = (d.view || "angle").toLowerCase();
    this.fit = (d.fit || "fill").toLowerCase();
    this.zoom = parseFloat(d.zoom) || 1;
    this.scroll = parseFloat(d.scroll) || 0;
    this.exposure = parseFloat(d.exposure) || 1;
    this.fire = d.fire != null && d.fire !== "" ? parseFloat(d.fire) : 1;
    this.bg = parseColor(d.bg);
    // inclusions: deterministic per grade so a stone keeps its "fingerprint"
    var c = CLARITY[this.clar], r = rng(7 + CUT_ORDER.indexOf(this.cut) * 13), inc = [];
    for (var i = 0; i < c[0] && i < 12; i++) {
      var a = r() * 6.283, rad = Math.sqrt(r()) * 0.5, y = -0.03 - r() * 0.22;
      var sz = c[1] * 1.25 * (0.6 + r() * 0.9);
      inc.push(Math.cos(a) * rad * (this.G.sx || 1), y, Math.sin(a) * rad * (this.G.sz || 1), sz);
    }
    this.inc = inc; this.incDark = c[2];
    this.dirty = true;
  };

  function mat3Mul(a, b) {
    var r = new Array(9);
    for (var i = 0; i < 3; i++) for (var j = 0; j < 3; j++) r[j * 3 + i] = a[i] * b[j * 3] + a[3 + i] * b[j * 3 + 1] + a[6 + i] * b[j * 3 + 2];
    return r;
  }
  function rotY(a) { var c = Math.cos(a), s = Math.sin(a); return [c, 0, -s, 0, 1, 0, s, 0, c]; } // column-major
  function rotX(a) { var c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, s, 0, -s, c]; }

  Gem.prototype.draw = function (now, dt) {
    var el = this.el, dpr = Math.min(window.devicePixelRatio || 1, 2);
    var cw = el.clientWidth, ch = el.clientHeight;
    if (!cw || !ch) return;
    var q = this.drag || this.spin ? quality : 1;
    var W = Math.max(2, Math.round(cw * dpr * q)), H = Math.max(2, Math.round(ch * dpr * q));
    if (el.width !== W || el.height !== H) { el.width = W; el.height = H; }
    if (glc.width < W || glc.height < H) { glc.width = Math.max(glc.width, W); glc.height = Math.max(glc.height, H); }

    // motion
    if (!this.drag) {
      if (Math.abs(this.vyaw) > 0.01) { this.yaw += this.vyaw * dt; this.vyaw *= Math.pow(0.04, dt); }
      this.yaw += this.spin * D2R * dt;
      this.pitch *= Math.pow(0.25, dt);
    }
    var scrollRot = this.scroll ? (window.scrollY || 0) / 1000 * this.scroll * D2R : 0;

    var G = this.G, ring = this.setting > 0;
    var R, stone = [0, 0, 0], bandR = 8.7, ext, target, dist, tilt;
    var mmR = 3.2 * Math.pow(this.carat, 1 / 3); // 1 ct round ≈ 6.4 mm
    if (ring) {
      R = mmR;
      stone = [0, bandR + 1.6 + 0.35 + (-G.bottom) * R, 0];
      target = [0, (stone[1] + G.top * R) * 0.42, 0];
      ext = (stone[1] + G.top * R + bandR + 1.6) * 0.56;
      tilt = this.tilt != null ? this.tilt : 14;
    } else {
      R = this.fit === "scale" ? Math.pow(this.carat, 1 / 3) : 1;
      target = [0, (G.top + G.bottom) * 0.5 * R * 0.6, 0];
      ext = this.fit === "scale" ? 2.3 : 1.45 * Math.max(G.ext, 1);
      tilt = this.tilt != null ? this.tilt : (this.view === "top" ? 89.5 : this.view === "side" ? 4 : 30);
    }
    ext /= this.zoom;
    var fov = 26 * D2R, focal = 1 / Math.tan(fov / 2);
    var aspect = cw / ch;
    dist = ext * focal / Math.min(1, aspect) * 1.0;
    var el2 = tilt * D2R;
    var cam = [target[0], target[1] + Math.sin(el2) * dist, target[2] + Math.cos(el2) * dist];
    var f = [target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]], fl = Math.hypot(f[0], f[1], f[2]);
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    var up = Math.abs(f[1]) > 0.99 ? [0, 0, -1] : [0, 1, 0];
    var r = [f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]], rl = Math.hypot(r[0], r[1], r[2]);
    r = [r[0] / rl, r[1] / rl, r[2] / rl];
    var u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    // basis maps (x·aspect, y, focal) → world
    var basis = [r[0] * aspect, r[1] * aspect, r[2] * aspect, u[0], u[1], u[2], f[0], f[1], f[2]];
    var baseYaw = ring ? -0.5 : (G.ez > G.ex * 1.08 ? Math.PI / 2 : 0.35);
    var rot = mat3Mul(rotX(this.pitch), rotY(this.yaw + scrollRot + baseYaw));
    // shader uses uRot as object->world; rotation about the target point is
    // approximated by rotating about the origin (target sits on the y axis).

    gl.viewport(0, 0, W, H);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform4f(U.uView, 0, 0, W, H);
    gl.uniform3fv(U.uCam, cam);
    gl.uniformMatrix3fv(U.uBasis, false, basis);
    gl.uniform1f(U.uFocal, focal);
    gl.uniformMatrix3fv(U.uRot, false, rot);
    var P = new Float32Array(96 * 4);
    for (var i = 0; i < G.planes.length; i++) P.set(G.planes[i], i * 4);
    gl.uniform4fv(U.uP, P); gl.uniform1i(U.uNP, G.planes.length);
    var C = new Float32Array(8);
    for (var j = 0; j < G.cyl.length && j < 2; j++) C.set(G.cyl[j], j * 4);
    gl.uniform4fv(U.uCyl, C); gl.uniform1i(U.uNC, Math.min(2, G.cyl.length));
    gl.uniform3fv(U.uStone, stone); gl.uniform1f(U.uR, R);
    var k = this.fire;
    gl.uniform3f(U.uIOR, 2.417 - 0.010 * k, 2.425 + 0.002 * k, 2.417 + 0.030 * k);
    var ci = this.colorI, a = ci * 0.016 / (ring ? 3.2 : 1);
    gl.uniform3f(U.uAbs, a * 0.04, a * 0.30, a * 1.0);
    var I = new Float32Array(48); I.set(this.inc.slice(0, 48));
    gl.uniform4fv(U.uInc, I); gl.uniform1i(U.uNI, this.inc.length / 4); gl.uniform1f(U.uIncDark, this.incDark);
    gl.uniform1i(U.uEnv, this.env);
    gl.uniform1f(U.uExp, (this.env === 1 ? 0.75 : 0.9) * this.exposure);
    // the viewer's direction expressed in world space (camera fixed, object rotates)
    gl.uniform3f(U.uViewer, -f[0], -f[1], -f[2]);
    gl.uniform1i(U.uSet, this.setting);
    gl.uniform3fv(U.uMetal, this.metal);
    gl.uniform1f(U.uBandR, bandR);
    gl.uniform1f(U.uStoneTop, G.top); gl.uniform1f(U.uStoneBot, G.bottom);
    gl.uniform1f(U.uSx, G.sx || 1); gl.uniform1f(U.uSz, G.sz || 1);
    gl.uniform4fv(U.uBg, this.bg);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    var ctx = this.ctx;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(glc, 0, glc.height - H, W, H, 0, 0, W, H);
    this.dirty = false;
  };

  function fallback(g) {
    // No WebGL2: draw the old gold-line diamond so the page still has its stone.
    var el = g.el, ctx = g.ctx, w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    var dpr = window.devicePixelRatio || 1;
    el.width = w * dpr; el.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    var cx = w / 2, cy = h / 2, R = Math.min(w, h) * 0.32;
    ctx.strokeStyle = "#E9CF8E"; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.56, 0, 7); ctx.stroke();
    for (var i = 0; i < 8; i++) { var a = i * Math.PI / 4; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * R * 0.56, cy + Math.sin(a) * R * 0.56); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
    g.dirty = false;
  }

  var last = performance.now(), slow = 0;
  function loop(now) {
    var dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (insts.length) {
      var gl2 = initGL();
      var t0 = performance.now(), drew = 0;
      for (var i = insts.length - 1; i >= 0; i--) {
        var g = insts[i];
        if (!g.el.isConnected) { insts.splice(i, 1); continue; }
        if (!g.visible) continue;
        var moving = g.drag || g.spin || Math.abs(g.vyaw) > 0.01 || Math.abs(g.pitch) > 0.002 || g.scroll;
        if (!moving && !g.dirty) continue;
        if (gl2) { g.draw(now, dt); drew++; } else if (g.dirty) fallback(g);
      }
      if (drew) {
        gl && gl.finish && 0;
        var ft = performance.now() - t0;
        // adaptive resolution while moving
        if (ft > 26) { slow++; if (slow > 3) { quality = Math.max(0.5, quality - 0.08); slow = 0; } }
        else if (ft < 12) { slow = 0; quality = Math.min(1, quality + 0.02); }
      }
    }
    requestAnimationFrame(loop);
  }

  function scan(root) {
    var list = (root || document).querySelectorAll ? (root || document).querySelectorAll("canvas[data-gem]") : [];
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      if (!c.__gem) { c.__gem = new Gem(c); insts.push(c.__gem); }
    }
  }
  var mo = new MutationObserver(function (ms) {
    var rescan = false;
    ms.forEach(function (m) {
      if (m.type === "attributes" && m.target.__gem) m.target.__gem.read();
      else if (m.type === "childList" && m.addedNodes.length) rescan = true;
    });
    if (rescan) scan();
  });
  function start() {
    scan();
    mo.observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-shape", "data-cut", "data-color", "data-clarity", "data-carat", "data-setting", "data-metal", "data-env", "data-spin", "data-tilt", "data-view", "data-fit", "data-zoom", "data-scroll", "data-exposure", "data-fire", "data-bg"] });
    window.addEventListener("resize", function () { insts.forEach(function (g) { g.dirty = true; }); });
    requestAnimationFrame(loop);
  }
  window.__JNTRGem = { scan: scan, build: buildShape };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
