/* Just Not The Ring — the city lens on the locations page. Lifted out of the old single
   file. It builds Google Maps searches out of the place you type; nothing goes anywhere
   until one is clicked. */
(function(){
"use strict";

function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
function $(id){ return document.getElementById(id); }

var LENS={
  nature:["botanical garden","scenic overlook","state park trail","arboretum","waterfront park","conservatory"],
  urban:["rooftop bar","observation deck","historic library","sculpture garden","riverwalk","hotel bar with a view"],
  home:["private dining room","chef's table","florist","cake shop","string quartet for hire"],
  destination:["proposal photographer","private boat charter","sunrise viewpoint","hotel with a terrace suite"],
  unconv:["record store","climbing gym","pottery studio","arcade","bowling alley","planetarium","drive-in theater","animal shelter","dive bar","late night diner","independent bookstore"]
};
var lensMode="auto";
/* What "Match my quiz" matches. The quiz is on another page, so its result reaches this one
   through the link it offers: /locations/#lens=urban&city=Austin. Both sit after the #, which
   a browser never sends to a server, and the lens is checked against the five keys above.
   Arriving any other way there is nothing to match, and the lens opens on the outdoors, as
   it always has for someone who has not taken the quiz. */
var quizLens="";
function readHash(){
  var h=(location.hash||"").slice(1), out={};
  if(h.indexOf("lens=")<0 && h.indexOf("city=")<0) return false;
  h.split("&").forEach(function(kv){
    var i=kv.indexOf("="); if(i<1) return;
    try{ out[kv.slice(0,i)]=decodeURIComponent(kv.slice(i+1)); }catch(err){}
  });
  quizLens = LENS[out.lens] && Object.prototype.hasOwnProperty.call(LENS,out.lens) ? out.lens : "";
  var city=typeof out.city==="string" ? out.city.slice(0,80).trim() : "";
  $("cityInput").value=city;
  renderLens(city, quizLens);
  return true;
}
function renderLens(city, archetype){
  if(!city){ $("lensOut").innerHTML=""; return; }
  var key = lensMode==="auto" ? (archetype||"nature") : lensMode;
  if(!LENS[key]) key="nature";
  var terms=LENS[key].concat(["proposal photographer"]).filter(function(v,i,a){return a.indexOf(v)===i;});
  var pin='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';
  var links=terms.map(function(t){
    return '<a class="lenslink" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+
      encodeURIComponent(t+" near "+city)+'">'+pin+esc(t)+'</a>';
  }).join("");
  var labels={nature:"outdoor and garden",urban:"city and skyline",home:"at-home and private-dining",destination:"travel",unconv:"unconventional"};
  $("lensOut").innerHTML=
    '<div class="card lensout">'+
      '<span class="eyebrow">Searching '+esc(city)+' — '+esc(labels[key])+' options</span>'+
      '<p class="small">These are the place types that reliably work. Open a few, then call the two best and ask what they allow — most have a standard answer for proposals, and a surprising number will help you set it up.</p>'+
      '<div class="lenslinks">'+links+'</div>'+
      '<p class="tiny">Opens Google Maps in a new tab. Check permit rules and closing times before you commit.</p>'+
    '</div>';
}
$("lensBtn").addEventListener("click",function(){ renderLens($("cityInput").value.trim(), quizLens); });
[].slice.call(document.querySelectorAll("#lensModes .chip")).forEach(function(b){
  b.addEventListener("click",function(){
    lensMode=b.getAttribute("data-mode");
    [].slice.call(document.querySelectorAll("#lensModes .chip")).forEach(function(o){
      o.setAttribute("aria-pressed", o===b);
    });
    renderLens($("cityInput").value.trim(), quizLens);
  });
});
$("cityInput").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); $("lensBtn").click(); } });
window.addEventListener("hashchange",readHash);
readHash();

})();
