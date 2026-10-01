/* Just Not The Ring — the timeline on the when page. Lifted out of the old single file.
   Pick a date; the twelve milestones are worked backwards from it in the browser. */
(function(){
"use strict";

function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
function $(id){ return document.getElementById(id); }

var MILESTONES=[
  {w:14,t:"Start the ring conversation with yourself",d:"Decide lab-grown or natural, and set the number you can pay without financing. Everything downstream depends on these two."},
  {w:12,t:"Get their ring size",d:"Borrow a ring, take a soap impression, or recruit the discreet sibling. Do it early — this is the step that quietly delays everything."},
  {w:10,t:"Custom or CAD order placed",d:"Full custom design runs 6–10 weeks from first sketch to finished ring. Skip this if you're buying ready-made."},
  {w:8, t:"Book the photographer",d:"Good proposal photographers book out, and from Thanksgiving to Valentine's Day they book out further. Send the date before you're certain of the spot."},
  {w:6, t:"Buy the stone and setting",d:"If you're buying ready-to-ship rather than custom, this is the real deadline. See the stone in person or on video before paying."},
  {w:4, t:"Scout the location in person",d:"Same time of day, same day of the week. Check light, crowds, parking, and where a photographer could stand unseen."},
  {w:4, t:"Call the venue or check permits",d:"Gardens, parks and estates usually need a photo permit. Restaurants need to know. Two weeks is the minimum they'll want."},
  {w:2, t:"Resizing and engraving",d:"Allow one to two weeks. Engraving is a few days on top. Don't schedule either against the wire."},
  {w:1, t:"Insure the ring",d:"Get the appraisal and add the rider before you start carrying it around. This is the highest-risk week of the ring's life."},
  {w:1, t:"Clear their calendar quietly",d:"Check nothing is scheduled. Plant a reason to have their nails done and to dress for the occasion."},
  {w:0.4,t:"Check sunset and weather",d:"Confirm the exact sunset time and set your arrival 90 minutes earlier. Commit to your rain plan or move the date now."},
  {w:0, t:"The day",d:"Flat ring case, not the box, and not in a trouser pocket. Phone charged. Two sentences ready. Leave time afterwards for the calls that matter."}
];
function fmtDate(d){ return d.toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"}); }
function renderTimeline(){
  var v=$("dateInput").value; if(!v) return;
  var target=new Date(v+"T12:00:00");
  var now=new Date(); now.setHours(0,0,0,0);
  var weeksOut=(target-now)/(1000*60*60*24*7);
  if(isNaN(weeksOut)) return;
  var warn=$("tlWarn");
  if(weeksOut<0){
    warn.innerHTML='<p class="watch">That date has passed. Pick one in the future and the schedule will rebuild.</p>';
  } else if(weeksOut<3){
    warn.innerHTML='<p class="watch"><b>'+Math.max(0,Math.round(weeksOut*7))+' days out.</b> Custom is off the table. Buy a ready-to-ship setting with a stone in stock, or propose with an heirloom or a plain band and design the real ring together afterwards — which plenty of people prefer anyway.</p>';
  } else if(weeksOut<7){
    warn.innerHTML='<p class="watch"><b>'+Math.round(weeksOut)+' weeks out.</b> Enough time for a ready-made ring and a resize, but not for a custom CAD order. Book the photographer this week — that\'s the binding constraint.</p>';
  } else if(weeksOut>26){
    warn.innerHTML='<p class="note-good"><b>'+Math.round(weeksOut)+' weeks out.</b> Plenty of runway. Use it on the ring size and on scouting the location in the season you\'ll actually propose in.</p>';
  } else {
    warn.innerHTML='<p class="note-good"><b>'+Math.round(weeksOut)+' weeks out.</b> Comfortable. Everything below fits, including a custom ring if you start it now.</p>';
  }
  $("timeline").innerHTML=MILESTONES.map(function(m){
    var d=new Date(target.getTime()-m.w*7*24*60*60*1000);
    var behind = m.w>weeksOut || d<now;
    var cls = behind ? "past" : (m.w===0 ? "due" : "");
    var label = m.w===0 ? "The date" : (m.w<1 ? "3 days before" : m.w+" weeks before");
    return '<li class="'+cls+'"><span class="dot"></span><span class="when">'+esc(label)+' · '+esc(fmtDate(d))+
      (behind?" · already behind":"")+'</span><h4>'+esc(m.t)+'</h4><p>'+esc(m.d)+'</p></li>';
  }).join("");
}
(function(){
  var di=$("dateInput");
  di.value=new Date(Date.now()+100*864e5).toISOString().slice(0,10);
  di.addEventListener("input",renderTimeline);
  di.addEventListener("change",renderTimeline);
  renderTimeline();
})();

})();
