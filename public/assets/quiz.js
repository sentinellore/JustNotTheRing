/* Just Not The Ring — the quiz: ten questions, the "what they have said" step, the result,
   the adjuster, the plan link and the email panel. Lifted out of the old single file; the
   scoring is unchanged. Needs data.js before it. Everything here runs in the browser.

   QUIZ FREE-TEXT ANSWERS NEVER LEAVE THE BROWSER. They are scored here, quoted back in the
   result, and held in memory only. Not in the link, not in storage, not in a request.

   What is stored, for this tab only: the plan a result came to -- exactly what its link
   carries: the scores, the fixed ids of what was ticked or changed, and the city. Never which
   option was chosen on a question, and never a sentence. It is there so the result is still
   here after a look at another page. See rememberPlan() near the end. */
(function(){
"use strict";
var D=window.SITE;
var Q=D.Q, SAID=D.SAID, STONES=D.STONES, LEXICON=D.LEXICON, NEG=D.NEG, OPP=D.OPP,
    LOC_LIB=D.LOC_LIB, METHOD_LIB=D.METHOD_LIB, CAPTURE_LIB=D.CAPTURE_LIB, CAP_BY_LENS=D.CAP_BY_LENS,
    RING_REC=D.RING_REC, SPEC_REC=D.SPEC_REC;

function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
function $(id){ return document.getElementById(id); }

var qi=0, answers=new Array(Q.length).fill(null), customs=new Array(Q.length).fill(""), cityAnswer="";
var said={}, saidStone="", saidText="", overrides={}, naturalPick={};
/* "in-r" or "in-l" for the next render of the panel, so a question arrives from the side it
   was asked for. Styling only. */
var slide="";
/* The two boxes people describe their partner in carry spellcheck="false". Some browsers'
   spellcheckers are a service: with theirs switched on, whatever is typed in a checked field
   is sent to the browser's maker. The rule on this site is that this text goes nowhere. */
function stageClass(stage, base){
  stage.className=base;
  if(slide){ void stage.offsetWidth; stage.classList.add(slide); slide=""; }
}
function isPlanHash(){ return (location.hash||"").indexOf("#plan=")===0; }
/* Every axis the quiz can score on, gathered from the data itself. A plan read from a link or
   from the tab's memory keeps a score only if its name is one of these, so a made-up key --
   which could be a whole sentence -- is dropped rather than carried into the next link. */
var AXES=Object.create(null);
(function(){
  function take(o){ for(var k in o){ if(Object.prototype.hasOwnProperty.call(o,k)) AXES[k]=1; } }
  Q.forEach(function(q){ (q.ax||[]).forEach(function(a){ AXES[a]=1; }); q.o.forEach(function(o){ take(o[1]); }); if(q.implies) take(q.implies); });
  take(LEXICON); take(OPP);
  [LOC_LIB,METHOD_LIB,CAPTURE_LIB].forEach(function(lib){ lib.forEach(function(x){ take(x.m); }); });
})();
/* Back to a quiz nobody has started. */
function clearRun(){
  qi=0;
  answers=new Array(Q.length).fill(null); customs=new Array(Q.length).fill("");
  said={}; saidStone=""; saidText=""; overrides={}; restoredTally=null; cityAnswer="";
}
/* The one place this page touches the address: taking a plan's fragment OUT of it. Nothing
   here ever puts one in. */
function stripPlanFragment(){ if(isPlanHash()) history.replaceState({}, "", location.pathname); }
function prio0(t){ return top(t,["size","quality","ethics","thrift"],"quality"); }
function saidOn(id){ return !!said[id]; }
/* "A lab-grown diamond" reads correctly in a checkbox list and wrongly as the
   first word of a heading. Drop the article and put the capital back. */
function stoneName(x){ var n=String(x&&x.t||"").replace(/^A /,""); return n.charAt(0).toUpperCase()+n.slice(1); }

function scoreText(s, axes){
  var out={}, bonus={};
  /* Punctuation and "but" become clause boundaries, because a negator does not
     reach across one. Without this, "no idea, total surprise" let the "no" of
     "no idea" negate the word "surprise" four tokens later and scored as
     evidence against a surprise -- the exact opposite of the sentence. */
  var clean=String(s||"").toLowerCase().replace(/[’']/g,"")
    .replace(/[,;:.!?()\u2014–]/g," | ")
    .replace(/\b(but|although|though|however|whereas|than)\b/g," | ")
    .replace(/[^a-z0-9\s|-]/g," ");
  var toks=clean.split(/\s+/).filter(Boolean);
  if(!toks.length) return out;
  var pos={}, neg={};
  var list = axes && axes.length ? axes : Object.keys(LEXICON);
  list.forEach(function(axis){
    var terms=LEXICON[axis]; if(!terms) return;
    terms.forEach(function(w){
      var wt=w.split(" "), L=wt.length;
      for(var i=0;i+L<=toks.length;i++){
        var hit=true;
        for(var j=0;j<L;j++){ if(toks[i+j]!==wt[j]){hit=false;break;} }
        if(!hit) continue;
        var negated=false;
        for(var k=i-1;k>=0 && k>=i-4;k--){
          if(toks[k]==="|") break;
          if(NEG.indexOf(toks[k])>-1){negated=true;break;}
        }
        if(negated) neg[axis]=(neg[axis]||0)+1; else pos[axis]=(pos[axis]||0)+1;
      }
    });
  });
  /* Opposite-axis credit is collected separately and applied at the end. Written
     inline it landed on axes that had not been scored yet, and the guard against
     double-processing then threw their own direct evidence away -- so adding
     emphasis to a sentence could lower its score. */
  var seen={};
  list.concat(Object.keys(neg)).concat(Object.keys(pos)).forEach(function(axis){
    if(seen[axis]) return; seen[axis]=1;
    var p=pos[axis]||0, n=neg[axis]||0;
    if(!p && !n) return;
    /* A clear single keyword has to be worth as much as tapping an option, or
       answering in your own words quietly weakens your own result. An explicit
       "no" outweighs a bare mention. */
    var v=(p?(p>1?2.5:1.5):0)-(n?(n>1?3:1.9):0);
    if(v) out[axis]=v;
    if(v<0 && OPP[axis]) bonus[OPP[axis]]=(bonus[OPP[axis]]||0)+Math.min(1.5,-v);
  });
  for(var a in bonus){ out[a]=Math.max(-2.5,Math.min(2.5,(out[a]||0)+bonus[a])); }
  return out;
}
function isOther(i,a){ return a===Q[i].o.length; }

function tally(){
  var t={};
  answers.forEach(function(a,i){
    if(a===null) return;
    var w;
    if(isOther(i,a)){
      w=scoreText(customs[i], Q[i].ax);
      /* Reaching for the box on "is there a place that means something" is itself
         a yes, whichever words they happen to use. */
      if(Q[i].implies && String(customs[i]||"").trim().length>1){
        for(var ik in Q[i].implies) w[ik]=Math.max(w[ik]||0, Q[i].implies[ik]);
      }
    } else w=Q[i].o[a][1];
    for(var k in w) t[k]=Math.round(((t[k]||0)+w[k])*10)/10;
  });
  return t;
}
function customAnswers(){
  var out=[];
  answers.forEach(function(a,i){ if(a!==null && isOther(i,a) && customs[i]) out.push({q:Q[i].p, a:customs[i]}); });
  return out;
}
function top(t,keys,dflt){
  var best=dflt,bv=-99;
  keys.forEach(function(k){ var v=t[k]||0; if(v>bv){bv=v;best=k;} });
  return bv<=0?dflt:best;
}

/* Options a partner has ruled out stay selectable -- somebody may have ticked
   the wrong box and want to overrule it without going back -- but they are not
   mixed in with the live ones. An optgroup separates them and says whose "no"
   it was, which the inline label used to get wrong: it said "you said no to
   this" when the whole point of that step is that they said it. */
var VETO_LABEL={said:"They said no to these", place:"Hard to do where you are asking"};
function rankedOptions(ranked, currentId){
  var live=[], groups={};
  ranked.forEach(function(r){
    var o='<option value="'+esc(r.x.id)+'"'+(r.x.id===currentId?" selected":"")+'>'+esc(r.x.h)+'</option>';
    if(r.veto){ (groups[r.veto]=groups[r.veto]||[]).push(o); } else live.push(o);
  });
  var out=live.join("");
  ["said","place"].forEach(function(k){
    if(groups[k]) out+='<optgroup label="'+esc(VETO_LABEL[k])+'">'+groups[k].join("")+'</optgroup>';
  });
  return out;
}
/* `bonus` nudges an entry's final score directly, by id, for influences that are
   not axes of the tally at all -- chiefly what the chosen place does to how it
   can be remembered. Added to the axis map instead, as it was at first, these
   land on keys no entry scores against and do nothing at all, which is a silent
   failure: the code reads as though the place matters and the output never
   moves. Scores sit roughly in -1..2, so the table below is scaled to match. */
var BONUS_SCALE=0.22;
function rank(lib, t, vetoed, bonus){
  var scored=lib.map(function(x){
    var s=0, w=0;
    for(var a in x.m){ s+=(t[a]||0)*x.m[a]; w+=Math.abs(x.m[a]); }
    /* vetoed is a map of id -> why, so the reason survives into the dropdown. */
    var v=s/(w+2.5);
    if(bonus && bonus[x.id]) v+=bonus[x.id]*BONUS_SCALE;
    return {x:x, s:v, veto:(vetoed && vetoed[x.id])||""};
  });
  scored.sort(function(a,b){
    if(a.veto!==b.veto) return a.veto?1:-1;
    if(b.s!==a.s) return b.s-a.s;
    return lib.indexOf(a.x)-lib.indexOf(b.x);
  });
  return scored;
}

/* ---- Shareable plan links ----
   The payload lives in the URL fragment, which browsers never send to a server, so a plan
   link reaches nobody but the person holding it. We encode the computed axis scores, the
   fixed ids of anything the visitor ticked or changed by hand, and the city — never the
   answers, and never the free text.
   composeResult() is a pure function of those three things, so a link reproduces the exact
   same recommendation while carrying nothing a person wrote about their partner. */
var restoredTally=null;
function b64e(s){
  var bytes=new TextEncoder().encode(s), bin="";
  for(var i=0;i<bytes.length;i++) bin+=String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64d(s){
  s=s.replace(/-/g,"+").replace(/_/g,"/");
  var bin=atob(s), bytes=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
function saidList(){
  var o=[];
  /* Ticking "they have named a stone" and never picking one is not a named
     stone. It used to assert one over a diamond spec. */
  SAID.forEach(function(s){ if(said[s.id] && !(s.id==="stone" && !saidStone)) o.push(s.id); });
  if(said.stone && saidStone) o.push("stone."+saidStone);
  return o;
}
function planLink(t){
  try{
    var payload={t:t};
    var k=saidList(); if(k.length) payload.k=k;
    var o={}; var any=false;
    ["loc","method","capture","spec"].forEach(function(f){ if(overrides[f]){o[f]=overrides[f];any=true;} });
    if(any) payload.o=o;
    if(cityAnswer) payload.c=cityAnswer;
    return location.origin+location.pathname+"#plan="+b64e(JSON.stringify(payload));
  }catch(err){ return ""; }
}
function currentPlanCode(){
  var box=$("shareUrl");
  var v=box?box.value:"";
  var i=v.indexOf("#plan=");
  return i<0 ? "" : v.slice(i+6);
}
function readPlanFromUrl(){
  var h=location.hash||"";
  if(h.indexOf("#plan=")!==0) return null;
  return readPlanCode(h.slice(6));
}
/* One reader for a plan, wherever it came from: a link's fragment or this tab's memory. Both
   are checked against the page's own lists the same way, so neither can say more than a link
   can. */
function readPlanCode(code){
  try{
    if(!code) return null;
    var obj=JSON.parse(b64d(code));
    if(!obj || typeof obj.t!=="object" || obj.t===null || Array.isArray(obj.t)) return null;
    var clean={};
    for(var key in obj.t){ if(AXES[key]===1 && typeof obj.t[key]==="number" && isFinite(obj.t[key])) clean[key]=obj.t[key]; }
    /* Everything below is matched against the fixed lists above rather than trusted.
       A link is a thing a stranger can hand you, so nothing in it reaches the page
       unless the page already knew the word. */
    /* A link opened in a tab that has already been used must not inherit that
       session. Leaving these behind quoted the previous visitor's own words
       under someone else's plan, and re-encoded a city they never typed. */
    said={}; saidStone=""; saidText=""; overrides={};
    answers=new Array(Q.length).fill(null); customs=new Array(Q.length).fill("");
    cityAnswer="";
    var ids=SAID.map(function(s){return s.id;});
    if(Array.isArray(obj.k)) obj.k.slice(0,24).forEach(function(v){
      if(typeof v!=="string") return;
      if(v.indexOf("stone.")===0){
        var sid=v.slice(6);
        if(STONES.some(function(s){return s.id===sid;})){ said.stone=true; saidStone=sid; }
        return;
      }
      if(ids.indexOf(v)>-1) said[v]=true;
    });
    if(obj.o && typeof obj.o==="object"){
      if(LOC_LIB.some(function(x){return x.id===obj.o.loc;})) overrides.loc=obj.o.loc;
      if(METHOD_LIB.some(function(x){return x.id===obj.o.method;})) overrides.method=obj.o.method;
      if(CAPTURE_LIB.some(function(x){return x.id===obj.o.capture;})) overrides.capture=obj.o.capture;
      /* SPEC_REC is a plain object, so a bare lookup also finds "toString" and
         "constructor" off the prototype and waves them through -- which put the
         literal word "undefined" in the spec line a visitor takes to a jeweler. */
      if(Object.prototype.hasOwnProperty.call(SPEC_REC, obj.o.spec)) overrides.spec=obj.o.spec;
    }
    if(typeof obj.c==="string") cityAnswer=obj.c.slice(0,80);
    return clean;
  }catch(err){ return null; }
}

function composeResult(forced){
  var t=forced||tally();

  /* --- what they have actually said comes first ------------------------- */
  var locVeto={}, methVeto={};
  function noSaid(map){ for(var i=1;i<arguments.length;i++) map[arguments[i]]="said"; }
  if(saidOn("nopublic")) noSaid(locVeto,"gathering");
  if(saidOn("wantpeople")) noSaid(locVeto,"nowhere","transit");
  if(saidOn("nosurprise")) noSaid(methVeto,"errand","longgame");
  if(saidOn("nopublic")) noSaid(methVeto,"reveal","dinner");

  /* Stated facts are applied as weights heavy enough to beat any inferred axis,
     because a partner who has said something out loud is not a guess. They are
     deliberately not heavy enough to pin the result to an extreme: "not in front
     of people" rules out an audience, it does not mean they want to be asked in
     bed before anyone has brushed their teeth. The vetoes above do the ruling
     out; these only lean. */
  var w={}; for(var k0 in t) w[k0]=t[k0];
  function push(a,v){ w[a]=(w[a]||0)+v; }
  if(saidOn("nopublic")){ push("priv",2); push("pub",-6); }
  if(saidOn("wantpeople")){ push("pub",4); push("fam",3); push("priv",-2); }
  if(saidOn("nosurprise")){ push("collab",4); push("surprise",-5); }
  if(saidOn("wantsurprise")){ push("surprise",4); push("collab",-3); }
  if(saidOn("ringtogether")) push("collab",5);
  if(saidOn("place")) push("meaning",4);
  if(saidOn("person")){ push("fam",3); push("pub",1); }
  if(saidOn("nodiamond")||saidOn("stone")) push("unconv",2);
  /* "We have already decided; this is the moment, not the question" changes what
     the moment is for. Nobody is being asked anything, so staging and cover
     stories stop making sense and the meaning of the place does the work. */
  if(saidOn("decided")){ push("meaning",3); push("surprise",-3); methVeto.errand="said"; }
  if(saidOn("bothasking")){ push("collab",4); push("surprise",-3); methVeto.errand="said"; }

  /* Whether they want it photographed decides how it is captured, not where it
     happens. Fed into the location ranking it quietly argued that "no
     photographer" meant "pick somewhere unphotographable", and sent people to
     bed on a Sunday morning. */
  var wCap={}; for(var k1 in w) wCap[k1]=w[k1];
  /* "No photographer" means no stranger in the bushes, not no record at all.
     Ruling out the hired option is the whole of it. Pushing doc down as well --
     first by 4, then by 1.5 -- still sent people who had asked for "one good
     picture" to "nothing at all", which is the opposite of what they said. */
  if(saidOn("wantphotos")) wCap.doc=(wCap.doc||0)+4;
  /* "They said no photographer" rules out hiring one. It does not rule out the
     sibling with a phone, so only the hired option is vetoed. */
  var capVeto={};
  if(saidOn("nophotos")) capVeto.photographer="said";

  var locRank=rank(LOC_LIB,w,locVeto);
  var methRank=rank(METHOD_LIB,w,methVeto);
  var locPick=locRank[0], locAlt=locRank[1];
  var methPick=methRank[0], methAlt=methRank[1];
  if(overrides.loc){ LOC_LIB.forEach(function(x){ if(x.id===overrides.loc) locPick={x:x,s:locPick.s}; }); }
  if(overrides.method){ METHOD_LIB.forEach(function(x){ if(x.id===overrides.method) methPick={x:x,s:methPick.s}; }); }
  var loc=locPick.x, method=methPick.x;

  /* How it gets remembered depends on WHERE, and the place has to be settled
     first -- including any hand override -- or the two cards contradict each
     other. Ranked against the tally alone, a home plan kept the propped phone
     after you moved it to a rooftop, and a hidden photographer was offered for
     a proposal in bed, which the phone copy itself says is the only option
     there. Two dimensions that compose, ranked as if they were independent:
     the same mistake as the method list, one level further down. */
  var capBonus={};
  var lensCap=CAP_BY_LENS[loc.lens]||{};
  for(var ck in lensCap) capBonus[ck]=(capBonus[ck]||0)+lensCap[ck];
  for(var ck2 in (loc.cap||{})) capBonus[ck2]=(capBonus[ck2]||0)+loc.cap[ck2];
  (loc.capOut||[]).forEach(function(id){ if(!capVeto[id]) capVeto[id]="place"; });

  var capRank=rank(CAPTURE_LIB,wCap,capVeto,capBonus);
  var capPick=capRank[0], capAlt=capRank[1];
  if(overrides.capture){ CAPTURE_LIB.forEach(function(x){ if(x.id===overrides.capture) capPick={x:x,s:capPick.s}; }); }
  var capture=capPick.x;
  /* What the answers alone would have chosen, given the place now showing. The
     adjuster compares against this so that re-selecting what is already there
     is not recorded as a change. */
  naturalPick={loc:locRank[0].x.id, method:methRank[0].x.id, capture:capRank[0].x.id,
               spec:((t.unconv||0)>=2 ? "unconv" : prio0(t))};
  /* What the answers alone would have chosen. The adjuster compares against this
     so that re-selecting the option already shown is not recorded as a change,
     announced as one, or written into the link. */
  /* Locations is its own page now, so the lens cannot be set from here. The link to it
     carries the kind of place, and the city if one was typed, after a # -- which, like the
     plan link, never reaches a server. lens.js reads it on arrival. */
  var lensHref="/locations/#lens="+encodeURIComponent(loc.lens)+(cityAnswer?"&city="+encodeURIComponent(cityAnswer):"");

  /* How close was it? A margin this small means the quiz genuinely could not
     tell, and saying so is more use than pretending otherwise. */
  var closeLoc = !overrides.loc && locAlt && (locPick.s-locAlt.s)<0.10 && locAlt.x.id!==loc.id;
  var closeMeth = !overrides.method && methAlt && (methPick.s-methAlt.s)<0.10 && methAlt.x.id!==method.id;
  var closeCap = !overrides.capture && capAlt && (capPick.s-capAlt.s)<0.10 && capAlt.x.id!==capture.id;

  /* --- the ring, assembled from four independent decisions --------------- */
  /* The named stone is resolved first. It used to be resolved after the ring, so
     "classic jewelry, and they asked for a sapphire" rendered a six-prong
     solitaire in one card and "bezel or protective setting" in the next. */
  var stoneObj=null;
  if(said.stone && saidStone){ STONES.forEach(function(x){ if(x.id===saidStone) stoneObj=x; }); }
  var aes=top(t,["classic","modern","vintage","unconv"],"classic");
  var ring={shape:RING_REC[aes].shape,set:RING_REC[aes].set,metal:RING_REC[aes].metal};
  if((t.bezel||0)>=2) ring.set="Full bezel or a low-profile basket — their hands are in things all week, and a raised prong setting will snag and loosen";
  else if((t.active||0)>=2) ring.set=ring.set+". Skip full pavé and ask for platinum prongs — they hold up better under daily wear";
  if((t.delicate||0)>=2 && (t.bezel||0)<2 && (t.active||0)<2)
    ring.set=ring.set+". Their hands are kind to jewelry, so the fragile options are genuinely open to you here — pavé, a thin band, a raised setting — where most people have to rule them out";
  if((t.hardy||0)>=2 && aes!=="vintage") ring.metal="Platinum, or 14k gold — skip 18k, it is softer and this ring is going to take knocks";
  if((t.ethics||0)>=2) ring.metal=ring.metal+", recycled if they will document it";
  /* A stone they asked for by name outranks the aesthetic bucket for the shape,
     and decides the setting only when the stone actually needs protecting. A lab
     diamond is a plain-solitaire candidate; an opal is not. */
  if(stoneObj && !saidOn("noring")){
    ring.shape=stoneName(stoneObj)+(stoneObj.mohs?" · Mohs "+stoneObj.mohs:"")+
      (stoneObj.plain?"" : ", in a shape they can choose by eye");
    if(stoneObj.protect) ring.set="Full bezel, or a halo with metal all the way round the girdle — "+
      (stoneObj.mohs ? "at Mohs "+stoneObj.mohs+" this stone chips" : "unless it is Mohs 8 or harder this stone will chip")+
      ", and the setting is what stands between it and a doorframe";
    else if((t.bezel||0)<2 && (t.active||0)<2)
      ring.set=ring.set+". At Mohs "+stoneObj.mohs+" the stone itself is hard enough that the setting is a taste decision rather than a durability one";
  }
  /* Who picks the ring was, for a while, an answer in the "how you ask" list,
     which is a different question -- choosing it together says nothing about
     whether you ask on a trailhead or in front of forty people. It lives here. */
  var chosenTogether = saidOn("ringtogether") || saidOn("bothasking") || (t.collab||0)>=3;
  if(saidOn("tworings")) ring.shape=ring.shape+" — and a second band for you, ordered at the same time so the metals match";
  if(saidOn("noring")) { ring.shape="Not a ring"; ring.set="A necklace, a watch, a tattoo appointment booked for the week after, a tree in the yard — they told you, so believe them"; ring.metal="Nothing to resize, which removes the one measurement everybody gets wrong"; }

  /* --- the spec ---------------------------------------------------------- */
  var prio=top(t,["size","quality","ethics","thrift"],"quality");
  var specKey = overrides.spec || ((t.unconv||0)>=2 ? "unconv" : prio);
  var spec={line:SPEC_REC[specKey].line, why:SPEC_REC[specKey].why};
  /* What they would trade off for still has to change something once the stone
     itself is settled -- otherwise the third control on the result promises to
     move the plan and, for anyone who named a stone or ruled out a diamond,
     silently does nothing at all. */
  var PRIO_NOTE={
    size:"On the trade-off you named: push the carat rather than the rarity. Coloured stones are far cheaper per carat than diamonds, which is the one place this choice saves you real money.",
    quality:"On the trade-off you named: in a coloured stone, better means colour saturation and cut, not a clarity grade — there is no grade to buy. Look at three side by side in daylight and pick with your eyes.",
    ethics:"On the trade-off you named: this is where provenance is easiest to satisfy. Montana sapphire, Australian parti and reclaimed stones all come with a traceable answer a seller will put in writing.",
    thrift:"On the trade-off you named: this is the cheapest good answer on the page. A sapphire or spinel of real quality costs a fraction of the equivalent diamond, which leaves the budget where you said you wanted it.",
    unconv:"You have pointed this at the unconventional end deliberately. That being so, spend the attention on the cut and the setting rather than on the category — an unusual stone badly cut just looks like a mistake. Ask who cut it, and have it bezelled."
  };
  var prioNote=(t[prio]||0)>=2 || overrides.spec ? PRIO_NOTE[overrides.spec && PRIO_NOTE[overrides.spec] ? overrides.spec : prio] : "";
  if(specKey==="unconv" && prioNote) spec.why=spec.why+" "+prioNote;
  if(stoneObj){
    spec={line:stoneName(stoneObj)+(stoneObj.mohs?" · Mohs "+stoneObj.mohs:"")+" · 1.2–2.0 ct · "+
            (stoneObj.protect?"bezel or protective setting":"setting to taste")+" · "+
            (stoneObj.graded?"ask for the report and check the number is inscribed on the girdle":"ask who cut it, and buy from someone who will tell you"),
          why:"They named the stone, so the stone is settled and everything else bends around it. "+stoneObj.note+(prioNote?" "+prioNote:"")};
  } else if(saidOn("nodiamond") && specKey!=="unconv"){
    spec={line:SPEC_REC.unconv.line, why:"They have said no diamond, so this is the sapphire-and-spinel end of the market. "+SPEC_REC.unconv.why+(prioNote?" "+prioNote:"")};
  }
  if(saidOn("noring")) spec={line:"No stone, no setting, no size",why:"They have told you they do not want a ring. Spend the budget on the thing they do want and on the day itself — and if you want something to hand over in the moment, a single flower or the empty box both work better than a ring they will quietly never wear."};

  /* --- timing ------------------------------------------------------------ */
  var runway=(t.rush||0)>=2?"rush":((t.ample||0)>=2?"ample":((t.normal||0)>=2?"normal":"normal"));
  var timing={
    rush:"You are weeks out, so custom is off the table. Buy a ready-to-ship setting with a stone already in stock, or propose with an heirloom or a plain band and design the real ring together afterwards.",
    normal:"A couple of months is comfortable for a ready-made ring plus a resize, and tight for a full custom order. Work backwards from the date in the planner: stone at six weeks, permits at four.",
    ample:"You have room to do this properly. Spend it on two things people skip: getting the size right without tipping them off, and scouting the location in the same season and at the same hour you will actually propose."
  }[runway];
  if(saidOn("sizeknown")) timing=timing.replace("getting the size right without tipping them off","scouting a second location you would be equally happy with");
  /* At short notice the binding constraint is whatever has a lead time, and that
     depends on how it is being remembered -- it used to name the photographer
     even for the people who had just been told to prop up a phone. */
  if(runway==="normal" && capture.id==="photographer") timing=timing+" Add the photographer at eight weeks — they are the only part of this with a real lead time.";
  if(runway==="rush") timing=timing+(capture.id==="photographer"
    ? " Book the photographer today — at this notice they are the binding constraint, not the ring."
    : " Nothing about how it gets remembered needs weeks of notice, which is one less thing against you here.");

  /* --- what to do this week ---------------------------------------------- */
  var moves=[];
  if(!saidOn("sizeknown") && !saidOn("noring")){
    moves.push(((t.collab||0)>=3 || saidOn("ringtogether"))
      ? "Measure the size together properly at a jeweler rather than guessing at home. You are not hiding anything, so use that — a sized band is the one thing that delays everything else."
      : "Get their ring size this week. It is the step that delays everything else, and it takes longer than you think.");
  }
  if(saidOn("ringtogether") || (t.collab||0)>=2) moves.push("Bring them into the ring decision properly — they have already told you they want a say. Keep the timing to yourself.");
  else if(!saidOn("noring")) moves.push(capture.id==="accomplice"
    /* Otherwise the list recruits two people for what is usually one person. */
    ? "Recruit exactly one accomplice — the person who can keep a secret, borrow a ring, and hold the phone on the day. It is almost always the same person."
    : "Recruit exactly one accomplice — the person who can keep a secret and borrow a ring.");
  if(saidOn("person")) moves.push("Work out what the person they want there actually needs to know, and when. Tell them the date and the city, not the details — every extra person is another chance at a leak.");
  /* The action follows whichever way it is actually being captured. It used to
     send everybody to a photographer, including the people who had just been
     told to prop a phone on a shelf. */
  moves.push({
    photographer:"Enquire with two proposal photographers now. They book out months ahead between Thanksgiving and Valentine's Day, and they are the only part of this you cannot arrange late.",
    accomplice:"Ask the person who is bringing them, on the phone rather than by text, and have them practise the angle once. Give them one job and a signal, not a running commentary.",
    staff:"When you call the venue about the booking or the permit, ask then whether somebody on shift can take a few photographs. Get a name, and a fallback if that person is not working that day.",
    tripod:"Work out where the phone goes and check the frame at the hour you will actually be there. Start it recording early and leave it running afterwards.",
    after:"Pick the spot for the portraits now, while you can still think clearly, and make sure one of them is just their hand.",
    nothing:"Decide now who you will tell that evening, so it is witnessed by somebody even though none of it is on film."
  }[capture.id]);
  if(loc.lens==="nature"||loc.lens==="urban"||loc.id==="origin"||loc.id==="injoke") moves.push("Visit the location in person at the hour you plan to propose, on the same day of the week. Check the light, the crowds, and where somebody could stand unseen.");
  if(loc.lens==="destination") moves.push("Check your airline and airport's rules for carrying the ring, and never put it in checked luggage.");
  if(loc.id==="hobby"||loc.id==="animal"||loc.id==="world") moves.push("Ask whoever runs the place — the gym, the barn, the server — before you commit to it. They almost always say yes, and they can stop somebody walking in at the wrong moment.");
  if(!saidOn("noring")) moves.push("Insure the ring the day you collect it, before you start carrying it around waiting for the right moment.");

  /* --- the blocks -------------------------------------------------------- */
  /* Ordinary links. Following one leaves this page, and the tab brings the plan back when the
     visitor returns to the quiz: see rememberPlan(). What does not come back is anything they
     typed, which was never stored. */
  var cityBlock = cityAnswer
    ? '<p class="small" style="margin-top:18px">The city lens in Locations will open on <b>'+esc(cityAnswer)+'</b>, tuned to '+esc(loc.lens==="unconv"?"unconventional":loc.lens)+' spots. <a class="textlink" href="'+esc(lensHref)+'">Go see the map searches →</a></p>'
    : '<p class="small" style="margin-top:18px">The city lens in Locations will open tuned to '+esc(loc.lens==="unconv"?"unconventional":loc.lens)+' spots; type your city there. <a class="textlink" href="'+esc(lensHref)+'">Go to the city lens →</a></p>';

  var owns=customAnswers();
  if(saidText) owns.push({q:"What they have said, in their words", a:saidText});
  var ownBlock = owns.length
    ? '<div class="own-echo"><span class="eyebrow">In your words</span>'+
      owns.map(function(o){
        return '<blockquote><span class="oq">'+esc(o.q)+'</span>“'+esc(o.a)+'”</blockquote>';
      }).join("")+
      '<p class="tiny" style="margin-top:12px">Matched by keyword, which is a blunt instrument: it reads “not” and “hate” as reversals, and it still cannot read a sentence. If the recommendation above missed what you meant, change it below — and trust yourself over it either way.</p></div>'
    : '';

  var saidIds=saidList();
  var saidBlock="";
  if(saidIds.length){
    var labels=[];
    SAID.forEach(function(s){
      if(!said[s.id]) return;
      if(s.id==="stone"){
        if(!stoneObj) return;
        labels.push("They have named the stone: "+stoneName(stoneObj).toLowerCase()+".");
        return;
      }
      labels.push(s.t);
    });
    saidBlock='<div class="note-good" style="margin-top:26px"><b>What you told us they have actually said</b> — this outranked the rest of the quiz wherever the two disagreed:<br>'+
      labels.map(function(l){return esc(l);}).join("<br>")+'</div>';
  }

  var altBlock="";
  if(closeLoc||closeMeth||closeCap){
    var bits=[];
    if(closeLoc) bits.push("the place could as easily be <b>"+esc(locAlt.x.h.toLowerCase())+"</b>");
    if(closeMeth) bits.push("how it goes could as easily be <b>"+esc(methAlt.x.h.toLowerCase())+"</b>");
    if(closeCap) bits.push("it could as easily be remembered by <b>"+esc(capAlt.x.h.toLowerCase())+"</b>");
    altBlock='<p class="small"><b>It was close.</b> On your answers '+bits.join(", and ")+
      '. That is not a hedge — it means the two of you sit between them, so pick whichever you can already picture, or swap it below.</p>';
  }

  var adjustBlock=
    '<div class="adjust" id="adjustBox">'+
      '<span class="eyebrow" id="adjustTitle">Not quite it?</span>'+
      '<p class="sr-live" id="adjustLive" role="status" aria-live="polite"></p>'+
      '<p class="small" style="margin-top:9px">Change any of these and the rest of the plan moves with it — the action list, the timing note and the link all follow. Changing them tells us nothing: it happens in your browser, and we do not count it. The link below carries whichever you pick, so a plan you send yourself is the plan you fixed.</p>'+
      '<div class="adjust-row" role="group" aria-labelledby="adjustTitle">'+
        '<label><span class="tiny">Where</span><select class="field" id="adjLoc">'+
          rankedOptions(locRank, loc.id)+
        '</select></label>'+
        '<label><span class="tiny">How it goes</span><select class="field" id="adjMethod">'+
          rankedOptions(methRank, method.id)+
        '</select></label>'+
        '<label><span class="tiny">How it is remembered</span><select class="field" id="adjCapture">'+
          rankedOptions(capRank, capture.id)+
        '</select></label>'+
        '<label><span class="tiny">The ring, roughly</span><select class="field" id="adjSpec">'+
          [["size","Biggest stone the budget allows"],["quality","A smaller, better stone"],["ethics","Origin and materials first"],["thrift","Spend less here, more on the life"],["unconv","Something unconventional"]]
            .map(function(p){ return '<option value="'+p[0]+'"'+(p[0]===specKey?" selected":"")+'>'+esc(p[1])+'</option>'; }).join("")+
        '</select></label>'+
      '</div>'+
      (stoneObj
        ? '<p class="tiny" style="margin-top:12px">The third control sets the direction of the budget. The stone itself is already settled — you told us they asked for '+esc(stoneObj.t.toLowerCase())+', and that stays whatever you pick here.</p>'
        : '')+
      (Object.keys(overrides).length
        ? '<p class="tiny" style="margin-top:12px">You have changed this from what your answers suggested. <button class="textlink" id="adjReset" type="button">Put it back →</button></p>'
        : '<p class="tiny" style="margin-top:12px">These are ordered by how well they fit what you told us, best first.</p>')+
    '</div>';

  /* A lab-grown diamond is graded on the ordinary scales and sits happily in a
     plain solitaire, so none of the warnings below apply to it. */
  var unconvBlock = (specKey==="unconv" || saidOn("nodiamond") || (stoneObj && !stoneObj.plain))
    ? '<div class="callout"><span class="eyebrow">Because this one is not a plain solitaire</span>'+
      '<p>Two things trip people up here. First, an unusual ring is harder to replace and harder to resize — a toi et moi, an east-west setting or an odd-shaped stone often cannot be sized more than half a step, so the measurement has to be right the first time. Second, unconventional does not mean unprotected: the hardness number decides how much setting the stone needs, and anything under Mohs 8 will show daily wear within a couple of years whatever it is set in.</p>'+
      '<p>And for the location — the rule is that it should be specific to the two of you, not merely odd. A record shop means something if that is where you spent every Saturday. It means nothing if you picked it because it photographs interestingly. '+
      '<a class="textlink" href="/locations/#unconventional">See the unconventional locations →</a></p></div>'
    : '';

  return '<div class="result-head">'+
      '<span class="eyebrow">Your starting point</span>'+
      '<h2>'+esc(loc.h)+'</h2>'+
      '<p class="small">'+esc(loc.d)+'</p>'+
      '<p class="watch"><b>Watch out:</b> '+esc(loc.w)+'</p>'+
      altBlock+
    '</div>'+
    '<div class="rec-row rec-row-4">'+
      '<div class="rec"><span class="eyebrow">How it goes</span><h3>'+esc(method.h)+'</h3><p>'+esc(method.d)+'</p></div>'+
      '<div class="rec"><span class="eyebrow">How it is remembered</span><h3>'+esc(capture.h)+'</h3><p>'+esc(capture.d)+'</p>'+
        '<p style="margin-top:9px"><b>Watch out:</b> '+esc(capture.w)+'</p></div>'+
      '<div class="rec"><span class="eyebrow">The ring</span><h3>'+esc(ring.shape)+'</h3>'+
        '<p><b>Setting:</b> '+esc(ring.set)+'</p><p style="margin-top:7px"><b>Metal:</b> '+esc(ring.metal)+'</p>'+
        (chosenTogether?'<p style="margin-top:7px"><b>Chosen together</b>, so the only secret left is when — which is plenty.</p>':'')+'</div>'+
      '<div class="rec"><span class="eyebrow">Timing</span><h3>'+
        (runway==="rush"?"Move now":(runway==="ample"?"Use the runway":"Comfortable, if you start"))+'</h3><p>'+esc(timing)+'</p></div>'+
    '</div>'+
    '<div class="quiz-body">'+
      '<span class="eyebrow">Take this to a jeweler</span>'+
      '<div class="spec-line"><span class="spec-tag">SPEC</span> &nbsp;'+esc(spec.line)+'</div>'+
      '<p class="small" style="margin-top:13px;max-width:68ch">'+esc(spec.why)+'</p>'+
      saidBlock+
      cityBlock+
      adjustBlock+
      ownBlock+
      unconvBlock+
      '<h3 class="result-h3">What to do this week</h3>'+
      '<ul class="moves">'+moves.map(function(m,i){return '<li data-n="'+(i+1)+'">'+esc(m)+'</li>';}).join("")+'</ul>'+
      '<div class="share">'+
        '<span class="eyebrow">Keep this</span>'+
        '<p class="small" style="margin-top:9px">Bookmark this link or send it to yourself. It reopens straight to this recommendation, including anything you changed — no account, and nothing to sign up for.<span id="keepNote"></span></p>'+
        '<div class="share-row">'+
          '<input class="field" id="shareUrl" readonly value="'+esc(planLink(t))+'" aria-label="Link to this plan">'+
          '<button class="btn ghost" id="shareCopy" type="button">Copy link</button>'+
        '</div>'+
        '<p class="tiny" style="margin-top:10px"><b>The link carries your scores, the boxes you ticked, anything you swapped and the city you named — never a word you wrote about your partner.</b> It sits after the # in the address, which browsers never send to a server, so copying it involves us not at all. Wherever it ends up, check that inbox is yours alone — a plan sitting in a shared inbox is how a surprise stops being one.</p>'+
        '<div class="mailrow">'+
          '<label class="eyebrow" for="planEmail">Or have it emailed to you</label>'+
          '<div class="share-row" style="margin-top:11px">'+
            '<input class="field" id="planEmail" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email">'+
            '<button class="btn primary" id="planSend" type="button">Send it</button>'+
          '</div>'+
          '<label class="optin"><input type="checkbox" id="planOptIn"><span>Also hear from us about proposal planning. Leave it unticked and we add you to nothing.</span></label>'+
          '<p class="tiny" id="planMsg">One email, carrying the same link. Unlike copying it, this does involve servers: your address and the link go to us and to our email provider so the message can be sent. <b>We keep no copy</b>, though they keep delivery records, as every email service does. <a href="/privacy/" target="_blank" rel="noopener">The full note on this</a>.</p>'+
          '<p class="tiny" id="planStatus" role="status" aria-live="polite"></p>'+
        '</div>'+
      '</div>'+
      '<div class="q-foot">'+
        '<a class="btn primary" href="/diamonds/">Now learn the 4Cs</a>'+
        '<button class="linkbtn" id="restart" type="button">Start over</button>'+
      '</div>'+
      '<p class="tiny" style="margin-top:20px">A starting point, not an instruction. You know them; this is a structured second opinion, and the controls above are there because it will sometimes be wrong.</p>'+
    '</div>';
}

var STEPS=function(){ return Q.length+1; };   /* the questions, then the one about what they have said */
var OPTKEYS=["A","B","C","D","E","F","G"];

function wireResult(){
  var sc=$("shareCopy");
  if(sc) sc.addEventListener("click",function(){
    var box=$("shareUrl");
    var done=function(ok){ sc.textContent = ok?"Copied":"Press Ctrl/Cmd-C"; setTimeout(function(){sc.textContent="Copy link";},2200); };
    try{
      if(navigator.clipboard && navigator.clipboard.writeText){
        navigator.clipboard.writeText(box.value).then(function(){done(true);},function(){box.select();done(false);});
        return;
      }
    }catch(err){}
    box.select(); done(false);
  });

  /* The adjuster. Everything here happens in this browser: changing the plan
     re-runs the same function the quiz runs, and the link updates to match.
     Nothing is sent, counted or recorded — if the recommendation is wrong for
     somebody, the useful thing is for them to fix it, not for us to find out. */
  ["loc","method","capture","spec"].forEach(function(f){
    var id="adj"+f.charAt(0).toUpperCase()+f.slice(1);
    var sel=$(id);
    if(!sel) return;
    sel.addEventListener("change",function(){
      /* Choosing the option that was already showing is not an override. */
      if(sel.value===naturalPick[f]) delete overrides[f];
      else overrides[f]=sel.value;
      /* Re-rendering replaces the select the person is operating, so the focus
         has to be put back on its replacement or a keyboard user is dropped at
         the top of the document after every single change. */
      rerenderResult(id);
    });
  });
  var reset=$("adjReset");
  if(reset) reset.addEventListener("click",function(){ overrides={}; rerenderResult("adjLoc"); });

  var sendBtn=$("planSend");
  if(sendBtn) sendBtn.addEventListener("click",function(){
    /* Status goes in its own element. #planMsg is the standing disclosure of
       what sending does, and a validation error must not wipe it. */
    var box=$("planEmail"), st=$("planStatus"), note=$("planOptIn");
    var addr=(box.value||"").trim();
    function say(kind, text){ st.className="tiny"+(kind?" "+kind:""); st.textContent=text; }
    if(addr.indexOf("@")<1 || addr.length>254){
      say("bad","That does not look like an email address.");
      box.focus(); return;
    }
    sendBtn.disabled=true; sendBtn.textContent="Sending…";
    say("","Sending…");
    fetch("/api/plan-email",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({ email:addr, plan:currentPlanCode(), optIn: !!(note && note.checked) })
    }).then(function(r){
      if(r.ok){
        say("ok","Sent. If it is not there in a minute, check the spam folder — and delete it if that inbox is shared.");
        box.value="";
        return;
      }
      /* The cap is per internet connection, not per address — say so, or a
         household on one router reads the fallback as an accusation. */
      var capped="That is more of these than we send to one internet connection. Copy the link above instead.";
      if(r.status===429){
        /* The limiter writes a message meant to be shown as-is, because the
           wait can be hours and "try again in a moment" would be a lie. */
        return r.json().then(function(b){
          say("bad", (b && b.message) ? String(b.message).slice(0,200) : capped);
        },function(){ say("bad",capped); });
      }
      if(r.status===503){
        /* 503 covers two different things: email was never configured, and
           the limiter is momentarily unreachable. Only the first is permanent. */
        return r.json().then(function(b){
          say("bad", (b && b.error==="not_configured")
            ? "Email is not switched on yet. Copy the link above instead."
            : "Email is briefly unavailable. Copy the link above, or try again in a few minutes.");
        },function(){
          say("bad","Email is not available right now. Copy the link above instead.");
        });
      }
      if(r.status===404 || r.status===405){
        say("bad","Email only works on justnotthering.com. Copy the link above instead.");
      } else {
        say("bad","That did not send. Try again in a moment, or copy the link above.");
      }
    }).catch(function(){
      say("bad","Could not reach the server. Copy the link above instead.");
    }).then(function(){
      sendBtn.disabled=false; sendBtn.textContent="Send it";
    });
  });

  $("restart").addEventListener("click",function(){
    qi=0;
    answers=new Array(Q.length).fill(null); customs=new Array(Q.length).fill("");
    said={}; saidStone=""; saidText=""; overrides={}; restoredTally=null;
    /* The city is part of the previous person's answers too. Left behind, it
       pre-filled the next run and rode along in their link. */
    cityAnswer="";
    forgetPlan();
    stripPlanFragment();
    slide="in-l";
    renderQ();
    window.scrollTo({top:0,behavior:"smooth"});
  });
}

function rerenderResult(refocusId){
  var stage=$("quizStage");
  stage.className="";
  stage.innerHTML=composeResult(restoredTally);
  wireResult();
  /* A plan opened from a link and then changed is no longer the plan in the address. Left
     there, the old fragment would win on a reload and undo the change, so it comes out; the
     tab's memory holds the changed plan, and the link in the panel is the one to keep. */
  if(isPlanHash() && location.hash.slice(6)!==currentPlanCode()) stripPlanFragment();
  showKept(rememberPlan());
  if(refocusId){
    var box=$("adjustBox");
    if(box && box.scrollIntoView) box.scrollIntoView({block:"center",behavior:"auto"});
    var back=$(refocusId);
    if(back && back.focus) back.focus({preventScroll:true});
    var live=$("adjustLive");
    if(live) live.textContent="Plan updated. "+((stage.querySelector("h2")||{}).textContent||"");
  }
}

function renderSaidStep(){
  var stage=$("quizStage");
  $("qcount").textContent="Last one — what they have said";
  $("qbar").style.width="100%";
  stageClass(stage,"quiz-body");

  var groups=[];
  SAID.forEach(function(s){ if(groups.indexOf(s.g)<0) groups.push(s.g); });
  var body=groups.map(function(g){
    var gid="saidgrp"+groups.indexOf(g);
    return '<div class="said-group" role="group" aria-labelledby="'+gid+'"><span class="eyebrow" id="'+gid+'">'+esc(g)+'</span><div class="said-list">'+
      SAID.filter(function(s){return s.g===g;}).map(function(s){
        return '<label class="said-item"><input type="checkbox" data-said="'+esc(s.id)+'"'+(said[s.id]?" checked":"")+
          (s.pick?' aria-controls="stonePick"':'')+
          '><span>'+esc(s.t)+'</span></label>'+
          (s.pick
            ? '<div class="said-pick" id="stonePick"'+(said[s.id]?"":" hidden")+'>'+
              '<label class="label" for="stoneSel">Which one?</label>'+
              '<select class="field" id="stoneSel" style="max-width:340px">'+
                '<option value="">Pick the stone…</option>'+
                STONES.map(function(st){ return '<option value="'+esc(st.id)+'"'+(saidStone===st.id?" selected":"")+'>'+esc(st.t)+'</option>'; }).join("")+
              '</select></div>'
            : '');
      }).join("")+'</div></div>';
  }).join("");

  stage.innerHTML=
    '<p class="q-prompt">Has your partner actually said anything about this?</p>'+
    '<p class="q-note">Everything above this was us inferring. Anything you tick here is something they told you, so it outranks the inference — tick nothing and the plan runs on the ten answers alone.</p>'+
    '<div class="said-wrap">'+body+'</div>'+
    '<div class="own" style="margin-top:20px">'+
      '<label class="eyebrow" for="saidText">Anything else they have said, in their words</label>'+
      '<textarea class="field" id="saidText" rows="2" spellcheck="false" autocomplete="off" placeholder="e.g. They keep saying they want their brother to be the first person who knows.">'+esc(saidText||"")+'</textarea>'+
      '<p class="fine">Quoted back to you at the top of the plan and nowhere else. Unlike the boxes above, this one deliberately does not travel in the shareable link — the same rule the rest of your own words follow.</p>'+
    '</div>'+
    '<div style="margin-top:24px"><label class="label" for="quizCity">Optional — where are you?</label>'+
      '<input class="field" id="quizCity" type="text" maxlength="80" placeholder="City or region" style="max-width:340px" value="'+esc(cityAnswer)+'"></div>'+
    '<div class="q-foot">'+
      '<button class="linkbtn" id="backBtn" type="button">← Back</button>'+
      '<span class="spacer"></span>'+
      '<button class="btn primary" id="nextBtn" type="button">See the plan</button></div>';

  [].slice.call(stage.querySelectorAll("[data-said]")).forEach(function(cb){
    cb.addEventListener("change",function(){
      var id=cb.getAttribute("data-said");
      if(cb.checked) said[id]=true; else delete said[id];
      var pick=$("stonePick");
      if(id==="stone" && pick){
        /* aria-expanded is not valid on a checkbox, so the reveal is announced by
           moving focus into it instead. */
        pick.hidden=!cb.checked;
        if(cb.checked){ var sel=$("stoneSel"); if(sel && sel.focus) sel.focus(); }
        else { saidStone=""; }
      }
    });
  });
  var ss=$("stoneSel");
  if(ss) ss.addEventListener("change",function(){ saidStone=ss.value; });
  var st=$("saidText");
  if(st) st.addEventListener("input",function(){ saidText=this.value; });
  /* Read on the way past as well as on Next, or pressing Back throws it away. */
  var cf0=$("quizCity");
  if(cf0) cf0.addEventListener("input",function(){ cityAnswer=this.value.trim().slice(0,80); });

  $("backBtn").addEventListener("click",function(){ qi--; slide="in-l"; renderQ(); focusStage(); });
  $("nextBtn").addEventListener("click",function(){
    var cf=$("quizCity");
    if(cf) cityAnswer=cf.value.trim().slice(0,80);
    if(st) saidText=(st.value||"").trim();
    /* "They have named a stone", ticked with no stone chosen, is not a named stone, and the
       plan link has never carried it. It used to lean the result on screen all the same, so
       the plan that came back from a link, or from the tab's memory, could differ from the
       one that was left. Unticked here, the two agree. */
    if(said.stone && !saidStone) delete said.stone;
    qi++;
    slide="in-r";
    renderQ();
    focusStage();
  });
}

/* Re-rendering replaces whatever had focus, which drops a keyboard user at the top of the
   document. After Next or Back, focus goes to the first control of the new step; on the
   result, to the panel itself, so a screen reader starts reading at the recommendation. */
function focusStage(){
  var stage=$("quizStage");
  var f = qi>Q.length ? stage : stage.querySelector("button, input, select, textarea");
  if(f===stage) stage.setAttribute("tabindex","-1");
  if(f && f.focus) f.focus({preventScroll:true});
}

function renderQ(){
  var stage=$("quizStage");
  if(qi>Q.length){
    $("qcount").textContent="Result";
    $("qbar").style.width="100%";
    stageClass(stage,"");
    stage.innerHTML=composeResult(restoredTally);
    wireResult();
    showKept(rememberPlan());
    return;
  }
  if(qi===Q.length){ renderSaidStep(); return; }

  var q=Q[qi], oIdx=q.o.length;
  $("qcount").textContent="Question "+(qi+1)+" of "+Q.length;
  $("qbar").style.width=((qi/STEPS())*100+9)+"%";
  stageClass(stage,"quiz-body");
  stage.innerHTML=
    '<p class="q-prompt">'+esc(q.p)+'</p><p class="q-note">'+esc(q.n)+'</p>'+
    '<div class="q-opts" role="group" aria-label="Answers">'+
      q.o.map(function(o,i){
        return '<button class="q-opt" type="button" aria-pressed="'+(answers[qi]===i)+'">'+
          '<span class="q-key">'+OPTKEYS[i]+'</span><span>'+esc(o[0])+'</span></button>';
      }).join("")+
      '<button class="q-opt q-other" type="button" aria-pressed="'+(answers[qi]===oIdx)+'" aria-controls="ownWrap">'+
        '<span class="q-key">'+OPTKEYS[oIdx]+'</span><span>None of these — '+esc(q.own)+'</span></button>'+
    '</div>'+
    '<div class="own" id="ownWrap"'+(answers[qi]===oIdx?"":" hidden")+'>'+
      '<label class="eyebrow" for="ownText">In your own words</label>'+
      '<textarea class="field" id="ownText" rows="3" spellcheck="false" autocomplete="off" placeholder="'+esc(q.ph)+'">'+esc(customs[qi])+'</textarea>'+
      '<p class="fine">Read by keyword against only the things this question measures, and it reads “not” and “hate” as reversals. Whatever you write is quoted back in the result and goes nowhere else.</p>'+
    '</div>'+
    '<div class="q-foot">'+
      (qi>0?'<button class="linkbtn" id="backBtn" type="button">← Back</button>':'')+
      '<span class="spacer"></span>'+
      '<button class="btn primary" id="nextBtn" type="button">Next</button></div>';

  function canAdvance(){
    var a=answers[qi];
    if(a===null) return false;
    if(a===oIdx) return (($("ownText")||{}).value||"").trim().length>1;
    return true;
  }
  function syncNext(){ $("nextBtn").disabled=!canAdvance(); }

  var opts=[].slice.call(stage.querySelectorAll(".q-opt"));
  opts.forEach(function(b,i){
    b.addEventListener("click",function(){
      answers[qi]=i;
      opts.forEach(function(o,j){ o.setAttribute("aria-pressed",j===i); });
      var wrap=$("ownWrap");
      wrap.hidden = (i!==oIdx);
      if(i===oIdx){ var ta=$("ownText"); ta.focus(); }
      syncNext();
    });
  });
  var ta=$("ownText");
  if(ta) ta.addEventListener("input",function(){ customs[qi]=this.value; syncNext(); });
  syncNext();

  var back=$("backBtn");
  if(back) back.addEventListener("click",function(){ qi--; slide="in-l"; renderQ(); focusStage(); });
  $("nextBtn").addEventListener("click",function(){
    if(!canAdvance()) return;
    if(answers[qi]===oIdx) customs[qi]=($("ownText").value||"").trim();
    qi++;
    slide="in-r";
    renderQ();
    focusStage();
  });
}
function applyPlanHash(){
  var t=readPlanFromUrl();
  if(!t) return false;
  restoredTally=t;
  qi=Q.length+1;
  renderQ();
  return true;
}
/* A plan link pasted into an already-open tab, or reached with Back, must restore too --
   not only on a cold load. */
window.addEventListener("hashchange", function(){
  if(applyPlanHash()) return;
  /* Moving from a valid plan link to a broken one used to leave the previous
     recommendation sitting there looking like the answer to the new link. */
  if(isPlanHash()){ clearRun(); dropBrokenLink(); renderQ(); }
});

/* The home page's question-one tile hands over which option was tapped: its index, 0 to 4,
   kept in sessionStorage for this tab and removed here as it is read. Only the index. If it
   was "None of these", the box opens here and the words are typed on this page -- nothing
   typed is ever carried between pages or stored. */
function takeHandoff(){
  var v=null;
  try{ v=sessionStorage.getItem("jntr-q1"); sessionStorage.removeItem("jntr-q1"); }catch(err){}
  if(v===null || !/^\d$/.test(v) || +v>Q[0].o.length) return false;
  answers[0]=+v;
  return true;
}

/* ---- The tab remembers its result ----
   The quiz has its own page, so a result held only in memory was gone the moment someone
   went to read about diamonds and came back. While a result is on screen, the plan it came
   to is kept in sessionStorage: the same string the share link carries after #plan= --
   scores, fixed ids, the city -- and never an answer or a word that was typed. It is this
   tab's alone, the browser drops it when the tab is closed, and Start over removes it.

   It is deliberately not written into the address bar. A #plan= there would sit in the
   browser's history, and a history entry on a shared laptop is exactly how a surprise is
   found. */
var PLAN_KEY="jntr-plan";
/* Whether this copy of the page has the plan on screen safely stored. A browser can refuse
   storage outright, and then the page must not say the tab remembers anything. */
var kept=false;
function forgetPlan(){ kept=false; try{ sessionStorage.removeItem(PLAN_KEY); }catch(err){} }
function rememberPlan(){
  var code=currentPlanCode();
  if(!/^[A-Za-z0-9_-]{8,2000}$/.test(code)){ forgetPlan(); return false; }
  try{ sessionStorage.setItem(PLAN_KEY, code); kept=(sessionStorage.getItem(PLAN_KEY)===code); }catch(err){ kept=false; }
  return kept;
}
/* The sentence in the Keep this panel about the tab, written once it is known to be true. */
function showKept(ok){
  var el=$("keepNote");
  if(el) el.textContent = ok
    ? " This tab also remembers the plan, so you can look round the site and come back to it. Start over clears it; closing the tab does too, unless the browser reopens that tab."
    : " This browser is not letting the page keep the plan for this tab, so once you leave this page the link is the only way back to it.";
}
/* A plan link that cannot be read. The visitor gets question one; the fragment comes out of
   the address, or it would block the tab's memory on every later load; and whatever the tab
   was remembering goes, or the plan from before would come back on a reload looking like
   the answer to the link that failed. */
function dropBrokenLink(){ forgetPlan(); stripPlanFragment(); }
function restoreRemembered(){
  var code=null;
  try{ code=sessionStorage.getItem(PLAN_KEY); }catch(err){}
  if(!code) return false;
  var t=readPlanCode(code);
  if(!t){ forgetPlan(); return false; }
  restoredTally=t;
  qi=Q.length+1;
  renderQ();
  return true;
}

/* Back and Forward can bring this page back whole, as it was left, without loading it again.
   If the tab's memory has moved on since -- Start over on a later visit, or a different plan
   -- that old copy would show a result the tab no longer holds, typed words and all. So when
   a kept result comes back and the store no longer matches it, the page follows the store. */
window.addEventListener("pageshow", function(e){
  if(!e.persisted || qi<=Q.length || !kept) return;
  var now=null;
  try{ now=sessionStorage.getItem(PLAN_KEY); }catch(err){ return; }
  if(now===currentPlanCode()) return;
  clearRun();
  if(!restoreRemembered()) renderQ();
});

/* What the page opens on, in order: a plan link, which wins and becomes what the tab
   remembers; an answer handed over from the home page, which is somebody beginning again, so
   the remembered plan goes; the remembered plan; and otherwise question one. A broken plan
   link gets question one and clears what was remembered: see dropBrokenLink(). */
(function(){
  var handed=takeHandoff();
  if(applyPlanHash()) return;
  if(isPlanHash()) dropBrokenLink();
  if(handed) forgetPlan();
  else if(restoreRemembered()) return;
  renderQ();
  if(handed && answers[0]===Q[0].o.length){ var ta0=$("ownText"); if(ta0 && ta0.focus) ta0.focus({preventScroll:true}); }
})();

})();
