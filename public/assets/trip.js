/* Just Not The Ring — the trip page: booking hand-offs, destination ideas, the outreach kit.
   Lifted out of the old single file. The searches are links built in the browser; nothing is
   fetched or priced here. The outreach kit is entirely local. */
(function(){
"use strict";

function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
function $(id){ return document.getElementById(id); }

var PIN='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';
var EXT='<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>';
function ln(href,label,icon){
  /* Every caller builds this URL through encodeURIComponent, except the date
     fragments, which are safe only because <input type="date"> constrains its
     own value. That is one refactor away from being a live XSS, so escape here
     and stop depending on it. &amp; in an attribute decodes back to & -- the
     links behave identically. */
  return '<a class="lenslink" target="_blank" rel="noopener" href="'+esc(href)+'">'+(icon||EXT)+esc(label)+'</a>';
}
function enc(s){ return encodeURIComponent(String(s||"").trim()); }
function prettyDay(iso){
  if(!iso) return "";
  var d=new Date(iso+"T12:00:00");
  return isNaN(d)?"":d.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric",year:"numeric"});
}
function monthOf(iso){
  if(!iso) return "";
  var d=new Date(iso+"T12:00:00");
  return isNaN(d)?"":d.toLocaleDateString("en-US",{month:"long",year:"numeric"});
}
function tripBrief(){
  return {
    want:  $("tripWant").value.trim(),
    where: $("tripWhere").value.trim(),
    from:  $("tripFrom").value.trim(),
    out:   $("tripOut").value,
    back:  $("tripBack").value,
    budget:$("tripBudget").value
  };
}
/* Every link below opens a real search on the site named. Nothing is fetched or
   priced here — the page makes no request of its own here and will never show a made-up fare. */
/* The date fields open on a sample window, so someone who changes the outbound
   date and not the return can leave a return that falls BEFORE it. Sites accept
   that silently and return nothing useful, so it is dropped rather than sent.
   ISO dates compare correctly as strings.

   Flights and stays need different tests. A same-day return is a real flight
   search — a day trip — but no hotel can sell a stay of nought nights, so
   Booking and Airbnb want it dropped. Hence >= for flying, > for staying. */
function backFor(b, kind){
  if(!b.back || !b.out) return "";
  return (kind==="fly" ? b.back>=b.out : b.back>b.out) ? b.back : "";
}
/* "" | "reversed" | "sameday" — drives the note under the links. */
function dateNote(b){
  if(!b.back || !b.out) return "";
  if(b.back < b.out) return "reversed";
  if(b.back === b.out) return "sameday";
  return "";
}
function bookingLinks(dest, b){
  /* No b.want fallback: a wish sentence is not a destination. See renderTripLinks. */
  var out=[], d=dest||b.where;
  var flyBack=backFor(b,"fly"), stayBack=backFor(b,"stay");
  if(!d) return out;
  var fl = b.from
    ? "https://www.google.com/travel/flights?q="+enc("Flights from "+b.from+" to "+d+(b.out?" on "+b.out:"")+(flyBack?" through "+flyBack:""))
    : "https://www.google.com/travel/flights?q="+enc("Flights to "+d+(b.out?" on "+b.out:""));
  out.push({group:"Flights", links:[ln(fl,"Google Flights")]});
  var stay=[];
  stay.push(ln("https://www.booking.com/searchresults.html?ss="+enc(d)+
    (b.out?"&checkin="+b.out:"")+(stayBack?"&checkout="+stayBack:"")+"&group_adults=2&no_rooms=1&group_children=0","Booking.com"));
  stay.push(ln("https://www.airbnb.com/s/"+enc(d)+"/homes?adults=2"+
    (b.out?"&checkin="+b.out:"")+(stayBack?"&checkout="+stayBack:""),"Airbnb"));
  stay.push(ln("https://www.google.com/travel/search?q="+enc("hotels in "+d),"Google Hotels"));
  out.push({group:"Stays", links:stay});
  return out;
}
function placeLinks(dest, terms){
  return (terms||[]).map(function(t){
    return ln("https://www.google.com/maps/search/?api=1&query="+enc(t+" "+dest), t, PIN);
  });
}
function timingLinks(dest, b){
  var l=[];
  if(b.out) l.push(ln("https://www.google.com/search?q="+enc("sunset time in "+dest+" on "+prettyDay(b.out)),"Sunset time"));
  l.push(ln("https://www.google.com/search?q="+enc("weather in "+dest+" in "+(monthOf(b.out)||"each month")),"Typical weather"));
  l.push(ln("https://www.google.com/maps/search/?api=1&query="+enc("proposal photographer "+dest),"Photographers",PIN));
  return l;
}
function renderTripLinks(){
  var b=tripBrief();
  /* Only a real destination builds a search. Falling back to the wish sentence
     produced links like "Flights to see the northern lights on 14 June" — a
     useless search, and it quietly sent that sentence to Google, Booking and
     Airbnb while the privacy page said these links carry "your city". */
  var dest=b.where;
  if(!dest){
    $("tripLinks").innerHTML = b.want
      ? '<p class="tiny">Name a destination above and these become live searches with your dates already in them. Until then there is nothing to search for — “'+esc(b.want)+'” is a wish, not a place.</p>'
      : "";
    return;
  }
  var groups=bookingLinks(dest,b);
  groups.push({group:"Timing", links:timingLinks(dest,b)});
  $("tripLinks").innerHTML=
    '<div class="linkset">'+groups.map(function(g){
      return '<div class="linkrow"><span class="lr-label">'+esc(g.group)+'</span>'+
        '<div class="lr-links">'+g.links.join("")+'</div></div>';
    }).join("")+'</div>'+
    (function(){
      var n=dateNote(b);
      if(!n) return "";
      /* With no origin the flights link is a one-way search that never carried a
         return, so saying it was dropped -- or kept -- describes nothing. */
      var flying=!!b.from, t;
      if(n==="reversed"){
        t = flying
          ? "Your return date falls before your outbound one, so it has been left out of these searches. Fix the dates above and it comes back."
          : "Your return date falls before your outbound one, so the stay searches leave it out. Fix the dates above and it comes back.";
      } else {
        t = flying
          ? "Your return is the same day, so the stay searches leave it out — a hotel cannot sell you nought nights. The flight search keeps it."
          : "Your return is the same day, so the stay searches leave it out — a hotel cannot sell you nought nights.";
      }
      return '<p class="tiny" style="margin-top:11px;color:var(--care-fg)">'+t+'</p>';
    }())+
    '<p class="tiny" style="margin-top:11px">Each opens a live search with your dates already in it. This page has no connection to those sites and never shows a price of its own — anything you see on cost comes from them, not from here.</p>';
}

/* --- Claude-powered destination ideas (optional; page works fully without it) --- */
var sampleFn=null, tripCtl=null;

/* The disclosure under the button is written at runtime, not baked into the
   markup, because this same file is served in two places: inside a Claude viewer,
   where pressing the button really does send the brief to a model, and on
   justnotthering.com, where window.claude is absent and nothing is sent at all.
   A static sentence would be a lie in one of those two. */
/* Three states, not two. Whether the model is reachable is only known once
   c.use("sample") settles, and the first render happens before that — so a
   two-state note told people in a viewer that nothing is sent, then flipped.
   The privacy page promises this line is right every time, so it has to be
   allowed to say it does not know yet. */
var sampleState="pending";
function renderTripAiNote(){
  var el=$("tripAiNote");
  if(!el) return;
  var body;
  if(sampleState==="pending")
    body='Whether they are available here is still being checked — this line will say which in a moment, and until it does the button builds only the searches.';
  else if(sampleState===true)
    body='They are available here, so pressing <b>Build the trip</b> sends the brief above — what you want to do, the destination if you named one, where you are leaving from, your dates and your budget — to Claude, a model run by Anthropic. Nothing from the quiz goes with it.';
  else
    body='They are not available here, so pressing <b>Build the trip</b> sends nothing anywhere: it builds the searches below and says so.';
  el.innerHTML =
    'The flight and hotel searches are built in your browser. <b>Destination ideas are the one part of this site that asks a language model.</b> '+
    body+' <a href="/privacy/">The full note on this</a>.';
}
/* window.claude exists only inside a Claude viewer. Opened as a saved file or
   hosted anywhere else, it is absent — the page must work exactly the same. */
(function(){
  var c = (typeof window!=="undefined" && window.claude && typeof window.claude.use==="function") ? window.claude : null;
  if(!c){ sampleState=false; renderTripAiNote(); return; }
  try{
    c.use("sample").then(
      function(s){ sampleFn=s||null; sampleState=!!sampleFn; renderTripAiNote(); },
      function(){ sampleFn=null; sampleState=false; renderTripAiNote(); });
  }catch(err){ sampleFn=null; sampleState=false; }
  renderTripAiNote();
})();

function tripPrompt(b){
  /* Nothing from the quiz goes in here. Two coarse labels used to, derived from
     the tally -- which is derived in part from keyword-scoring the sentences
     people type about their partner. Derived is not the same as the text, but
     the promise on this site has no "derived" clause in it, and the two labels
     added almost nothing the brief does not already say. */
  return "Help someone plan a trip on which they intend to propose marriage. Be concrete and specific. Never invent prices, fares or availability — you cannot know them.\n\n"+
    "THE BRIEF\n"+
    "- What they want to do: "+(b.want||"(not said)")+"\n"+
    "- Destination they have in mind: "+(b.where||"(open — suggest)")+"\n"+
    "- Departing from: "+(b.from||"(not said)")+"\n"+
    "- Dates: "+(b.out?prettyDay(b.out):"(flexible)")+(b.back?" to "+prettyDay(b.back):"")+"\n"+
    "- Budget: "+b.budget+"\n\n"+
    "Suggest exactly 3 destinations that genuinely deliver what they described. If their dates are wrong for it — wrong season, wrong hemisphere, the thing does not happen then — say so plainly in seasonNote and give the nearest workable alternative instead of pretending it works. If they named a destination, keep it as the first suggestion but still say honestly whether the dates suit it.\n\n"+
    "For each, name the specific place within the destination where they should actually propose — a named viewpoint, garden, beach or room, not 'the old town'.\n\n"+
    'Reply with only JSON of exactly this shape:\n'+
    '{"reading":"one sentence: what you understood them to want",'+
    '"destinations":[{"name":"City, Country","airport":"main airport IATA code","why":"two sentences on why this fits what they asked for",'+
    '"season":"the months this actually works","seasonNote":"one honest sentence about whether THEIR dates suit it",'+
    '"spot":"the specific named place to propose","spotWhy":"one sentence",'+
    '"watchOut":"one practical warning: permits, crowds, weather, closures or cost",'+
    '"searches":["3-5 short map search terms for this destination"]}],'+
    '"note":"one sentence of overall advice or a caveat about this trip"}';
}
function tripError(code){
  switch(code){
    case "not_granted": case "sampling_disabled": case "not_declared":
    case "capability_disabled": case "capability_removed":
      return "Suggestions are turned off for this page. The searches and the outreach email below still work.";
    case "rate_limited": return "Too many requests just now. Give it a minute and try again.";
    case "session_expired": return "Your Claude session expired — sign in again and retry.";
    case "cancelled": return "";
    case "invalid_json": case "empty_completion": return "That answer came back malformed. Try again, or add a little more detail to the brief.";
    case "refused": return "Claude declined that brief. Try describing it differently.";
    case "prompt_too_large": return "That brief is too long — shorten it.";
    default: return "Something went wrong reaching Claude. The searches below still work.";
  }
}
function renderDestinations(data,b){
  if(!data || !data.destinations || !data.destinations.length){
    $("tripIdeas").innerHTML='<p class="watch" style="margin-top:20px">No destinations came back. Try describing what you want a little differently.</p>';
    return;
  }
  var head = data.reading
    ? '<div class="own-echo" style="margin-top:24px"><span class="eyebrow">What we took you to mean</span>'+
      '<blockquote>'+esc(data.reading)+'</blockquote></div>' : '';
  var cards=data.destinations.slice(0,4).map(function(d){
    var name=String(d.name||"").trim(); if(!name) return "";
    var bb={from:b.from,out:b.out,back:b.back,where:name,want:b.want};
    var links=bookingLinks(name,bb).reduce(function(a,g){ return a.concat(g.links); },[]);
    links=links.concat(timingLinks(name,bb));
    return '<article class="dest">'+
      '<div class="dest-top"><h4>'+esc(name)+'</h4>'+
        (d.airport?'<span class="code">'+esc(String(d.airport).toUpperCase())+'</span>':'')+'</div>'+
      (d.why?'<p>'+esc(d.why)+'</p>':'')+
      (d.season||d.seasonNote
        ? '<div class="season"><b>Season</b>'+esc(d.season||"")+(d.seasonNote?' — '+esc(d.seasonNote):'')+'</div>' : '')+
      (d.spot?'<div class="spot"><span class="lbl">Where to actually ask</span><b>'+esc(d.spot)+'</b>'+
        (d.spotWhy?'<p style="margin-top:5px">'+esc(d.spotWhy)+'</p>':'')+'</div>':'')+
      (d.watchOut?'<p class="watch" style="margin-top:14px"><b>Watch out:</b> '+esc(d.watchOut)+'</p>':'')+
      '<div class="lr-links">'+links.join("")+'</div>'+
      (d.searches&&d.searches.length
        ? '<div class="lr-links">'+placeLinks(name,d.searches.slice(0,5).map(String)).join("")+'</div>' : '')+
      '</article>';
  }).join("");
  var note=data.note?'<p class="small" style="margin-top:16px;border-left:3px solid var(--gold);padding-left:15px">'+esc(data.note)+'</p>':'';
  $("tripIdeas").innerHTML=head+
    '<h3 class="result-h3" style="margin-bottom:4px">Three that fit</h3>'+
    '<p class="tiny" style="margin-bottom:6px">Written by Claude from your brief. Check seasons and opening times yourself before you book anything.</p>'+
    cards+note+
    '<div class="tripfoot"><button class="btn ghost" id="tripAgain" type="button">Ask for different ideas</button></div>';
  var again=$("tripAgain");
  if(again) again.addEventListener("click",function(){ runTrip(true); });
}
function runTrip(fresh){
  var b=tripBrief();
  renderTripLinks();
  if(!b.want && !b.where){
    $("tripStatus").textContent="Tell us what you want to do, or where.";
    return;
  }
  /* Pressing the button during the second before window.claude.use() settles
     used to fall through to the no-connection branch and tell the visitor
     destination ideas were unavailable here -- a sentence that was about to
     become false. Pending is its own answer, and it is an honest one. */
  if(sampleState==="pending"){
    $("tripIdeas").innerHTML="";
    $("tripStatus").textContent="Still checking whether destination ideas are available here — the searches are built; try the button again in a moment.";
    return;
  }
  if(!sampleFn){
    $("tripIdeas").innerHTML='<p class="small" style="margin-top:20px;border-left:3px solid var(--line-strong);padding-left:15px">'+
      'Destination suggestions need a connection to Claude, which this view does not have. Everything else on this page — the searches above and the outreach email below — works as normal.</p>';
    $("tripStatus").textContent="";
    return;
  }
  if(tripCtl) tripCtl.abort();
  tripCtl=new AbortController();
  var ctl=tripCtl;
  $("tripGo").disabled=true;
  $("tripStop").hidden=false;
  $("tripStatus").innerHTML='<span class="thinking"><i></i>Thinking — this takes up to a minute</span>';
  $("tripIdeas").innerHTML="";
  var opts={ signal:ctl.signal, modelTier:"default",
    onText:function(){ $("tripStatus").innerHTML='<span class="thinking"><i></i>Writing…</span>'; } };
  if(fresh) opts.cache=false;
  sampleFn.json(tripPrompt(b),opts).then(function(data){
    if(ctl.signal.aborted) return;
    $("tripStatus").textContent="";
    renderDestinations(data,b);
  }).catch(function(e){
    if(!e || e.code==="cancelled"){ $("tripStatus").textContent=""; return; }
    $("tripStatus").textContent="";
    var msg=tripError(e.code);
    if(msg) $("tripIdeas").innerHTML='<p class="watch" style="margin-top:20px">'+esc(msg)+'</p>';
  }).then(function(){
    $("tripGo").disabled=false;
    $("tripStop").hidden=true;
  });
}
$("tripGo").addEventListener("click",function(){ runTrip(false); });
$("tripStop").addEventListener("click",function(){ if(tripCtl) tripCtl.abort(); });
["tripWhere","tripWant","tripFrom","tripOut","tripBack"].forEach(function(id){
  $(id).addEventListener("change",renderTripLinks);
});

/* --- The outreach kit: entirely local, no network, no model --- */
var NOTE_KIND="hotel";
/* Whether this is a surprise changes several sentences in every template, and
   the templates used to assume it always was. sec(a,b) picks the wording. */
var NOTE_SECRET=true;
function sec(a,b){ return NOTE_SECRET?a:b; }
function noteTime(){
  var v=$("noteTime").value;
  if(!v) return "early evening";
  var p=v.split(":"), h=parseInt(p[0],10), m=p[1];
  var ap=h>=12?"pm":"am", hh=h%12; if(hh===0) hh=12;
  return hh+":"+m+ap;
}
function buildNote(){
  var place=$("notePlace").value.trim() || "[venue name]";
  var when=prettyDay($("noteDate").value) || "[date]";
  var time=noteTime();
  var me=$("noteName").value.trim() || "[your name]";
  var hi="Hello,\n\n";
  var sign="\n\nThank you — I know this is a lot of questions, and I'd rather ask them now than get it wrong on the day.\n\nBest,\n"+me;
  var t={};

  t.hotel={
    subject:"Proposal at "+place+" on "+when,
    body:hi+
sec("I'm planning to propose to my partner during our stay at ","My partner and I are getting engaged during our stay at ")+place+" on "+when+", and I'd be grateful for your help with a few details.\n\n"+
"What I'm hoping for is a quiet spot on the property at around "+time+" where we can be alone for a few minutes. A few questions:\n\n"+
"1. Is there somewhere on the grounds you'd recommend at that hour — somewhere that isn't busy and gets decent light?\n"+
"2. Do you allow an outside photographer on the property? If so, is there a fee or a form?\n"+
sec("3. Could you hold the ring in the hotel safe until that afternoon, under my name only?\n","3. Could you hold a small item in the hotel safe until that afternoon?\n")+
"4. Is a room with a terrace or a view available for those nights, and could you note the occasion on the booking?\n"+
"5. If I wanted flowers or champagne in the room afterwards, what's the lead time and cost?\n\n"+
sec("One request: my partner is travelling with me and doesn't know. Please don't mention any of this at check-in or in any confirmation sent to both of us — I'm reachable at this address only.\n\n","One note: we're planning this together, so you can put anything in writing to either of us. Only the timing is a secret, and only from one of us.\n\n")+
"Happy to confirm anything by phone if that's easier."+sign};

  t.restaurant={
    subject:"Table for 2 on "+when+" — proposal, one small request",
    body:hi+
"I'd like to book a table for two at "+place+" on "+when+" at around "+time+". "+sec("I'm planning to propose to my partner that evening","We're getting engaged that evening")+", and I wanted to give you a heads-up rather than spring it on your staff.\n\n"+
"A few questions:\n\n"+
"1. Could we have a quieter corner or a table that isn't in the middle of the room?\n"+
"2. Is there somewhere just outside or nearby — a terrace, a garden, a landing — where I could ask privately before or after the meal? I'd rather not do it at the table with the room watching.\n"+
"3. If I give a signal to our server, could champagne come out afterwards?\n"+
"4. Is a photographer allowed inside, or would you prefer they stay outside?\n\n"+
"Please don't announce anything to the room or bring the whole staff over unless we ask — it would be mortifying. Quiet is very much the goal.\n\n"+
sec("If the booking confirmation goes to both of us, please leave any mention of the occasion off it.","Confirmations can go to either of us — nothing here needs hiding.")+sign};

  t.venue={
    subject:"Proposal and photography at "+place+" — "+when,
    body:hi+
sec("I'd like to propose to my partner at ","My partner and I are getting engaged at ")+place+" on "+when+", at around "+time+", and I want to make sure we do it in a way that works for you.\n\n"+
"Could you tell me:\n\n"+
"1. Do you have a policy on proposals, and is there a spot you usually recommend?\n"+
"2. Do I need a photography permit to bring a photographer for 30–45 minutes, and what does it cost?\n"+
"3. What time do you close, and what time does that area fall into shade?\n"+
"4. Is anything else booked in that area that day — a wedding, a private event, maintenance?\n"+
"5. Is there a rain alternative on the grounds I could fall back on?\n"+
"6. Is there an admission or booking fee for two people, and do I need to reserve in advance?\n\n"+
"I'll be as unobtrusive as possible and I'm happy to work around anything else you have on that day."+sign};

  t.photo={
    subject:"Proposal shoot — "+when+", "+time,
    body:hi+
sec("I'm proposing to my partner on ","My partner and I are getting engaged on ")+when+" at around "+time+", at "+place+", and I'm looking for someone to photograph it"+sec(" without being seen","")+".\n\n"+
"What I'm after is roughly 30–60 minutes: "+sec("the moment itself from a distance, then a short set of portraits once they know what's happening","the moment itself, then a short set of portraits straight afterwards")+".\n\n"+
"Could you let me know:\n\n"+
"1. Are you free that day, and what's your rate for a proposal session?\n"+
"2. Have you shot at this location before? Do you know whether it needs a permit?\n"+
"3. How do you want to handle the signal — where will you position yourself, and which way should I face?\n"+
sec("4. What will you wear so you read as a tourist rather than a photographer?\n","4. Where will you set up, and how visible will you be before the moment?\n")+
"5. What's your turnaround on the images, and do we get a couple of previews the same day? We'll want something to send to family that night.\n"+
"6. What happens if the weather turns or we're running late — how flexible is the window?\n\n"+
sec("Please send any correspondence to this address only. My partner has no idea.","We're both across the planning, so either of us can be copied on anything.")+sign};

  t.charter={
    subject:"Private booking on "+when+" — proposal",
    body:hi+
"I'd like to book with "+place+" on "+when+", starting around "+time+", for two people. "+sec("I'm planning to propose during the trip","We're getting engaged during the trip")+".\n\n"+
"A few things I'd want to confirm first:\n\n"+
"1. Would it be just the two of us, or shared with other guests? Privacy matters more than anything else here.\n"+
"2. Can you time the route so we're somewhere worth looking at as the light goes?\n"+
"3. Is there a moment where the two of us could be alone for a few minutes — and could you give me a discreet signal when it's coming up?\n"+
"4. Would you be able to take a few photos on my phone straight afterwards?\n"+
"5. What's your weather cancellation policy, and how late can we decide?\n"+
"6. Is there anything I should bring or avoid bringing?\n\n"+
sec("Please keep it off any confirmation my partner might see — I'm the only one who should get the details.","Either of us can be copied on the booking — the date is not a secret, only the exact moment.")+sign};

  t.picnic={
    subject:"Proposal setup on "+when,
    body:hi+
sec("I am planning to propose to my partner on ","My partner and I are getting engaged on ")+when+" at around "+time+", and I would like to book a setup with "+place+".\n\n"+
"A few things I need to get straight before I book:\n\n"+
"1. What time would you arrive, and how long does setup take? I need to know exactly when the spot is ready.\n"+
"2. Do you need vehicle access to the location, and can you tell me whether this particular spot allows it?\n"+
"3. Are you handling the park or venue permit, or is that mine to arrange? I would rather ask than assume.\n"+
"4. Who stays on site while we are there, and where will they wait? I want it to feel like we are alone.\n"+
"5. What is your weather policy, and how late can I move the date?\n"+
"6. Who packs everything down, and how long after are you gone?\n\n"+
"I am also booking a photographer, so if you have worked with anyone locally I would be glad of a name.\n\n"+
sec("Please keep it off anything my partner might see — I am the only one who should get the details.","Either of us can be copied on anything — we are arranging this together.")+sign};

  return t[NOTE_KIND]||t.hotel;
}
function renderNote(){
  var n=buildNote();
  $("noteSubject").textContent="Subject: "+n.subject;
  $("noteBody").value=n.body;
}
[].slice.call(document.querySelectorAll("#noteKinds .chip")).forEach(function(b){
  b.addEventListener("click",function(){
    NOTE_KIND=b.getAttribute("data-kind");
    [].slice.call(document.querySelectorAll("#noteKinds .chip")).forEach(function(o){
      o.setAttribute("aria-pressed", o===b);
    });
    renderNote();
  });
});
[].slice.call(document.querySelectorAll("#noteSecrecy .chip")).forEach(function(b){
  b.addEventListener("click",function(){
    NOTE_SECRET = b.getAttribute("data-secret")==="1";
    [].slice.call(document.querySelectorAll("#noteSecrecy .chip")).forEach(function(o){
      o.setAttribute("aria-pressed", o===b);
    });
    renderNote();
  });
});
["notePlace","noteDate","noteTime","noteName"].forEach(function(id){
  $(id).addEventListener("input",renderNote);
});
$("noteCopy").addEventListener("click",function(){
  var ta=$("noteBody"), btn=$("noteCopy");
  var done=function(ok){
    btn.textContent = ok ? "Copied" : "Press Ctrl/Cmd-C";
    setTimeout(function(){ btn.textContent="Copy"; }, 2200);
  };
  try{
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(ta.value).then(function(){done(true);},function(){ ta.select(); done(false); });
      return;
    }
  }catch(err){}
  ta.select(); done(false);
});
(function(){
  var out=new Date(Date.now()+100*864e5), back=new Date(Date.now()+104*864e5);
  $("tripOut").value=out.toISOString().slice(0,10);
  $("tripBack").value=back.toISOString().slice(0,10);
  $("noteDate").value=out.toISOString().slice(0,10);
  renderNote();
})();

})();
