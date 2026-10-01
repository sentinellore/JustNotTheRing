/* Just Not The Ring — the searches on the hire page. Lifted out of the old single file.
   Searches only, never a directory. */
(function(){
"use strict";

function esc(s){ return String(s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }
function $(id){ return document.getElementById(id); }
function enc(s){ return encodeURIComponent(String(s||"").trim()); }
var PIN='<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M12 21s7-6.4 7-11a7 7 0 1 0-14 0c0 4.6 7 11 7 11z"/><circle cx="12" cy="10" r="2.6"/></svg>';

var HIRE_TERMS=[
  {t:"proposal photographer", l:"Proposal photographers"},
  {t:"luxury picnic company", l:"Picnic and setup"},
  {t:"event florist", l:"Florists"},
  {t:"solo violinist for hire", l:"Musicians"},
  {t:"drone photography service", l:"Drone operators"},
  {t:"private chef", l:"Private chefs"}
];
function renderHire(city){
  if(!city){ $("hireOut").innerHTML=""; return; }
  var links=HIRE_TERMS.map(function(x){
    return '<a class="lenslink" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query='+
      enc(x.t+" near "+city)+'">'+PIN+esc(x.l)+'</a>';
  }).join("");
  $("hireOut").innerHTML=
    '<div class="card lensout">'+
      '<span class="eyebrow">Near '+esc(city)+'</span>'+
      '<p class="small">Email two or three of each rather than one. In this category the good ones are booked and the available ones are sometimes available for a reason.</p>'+
      '<div class="lenslinks">'+links+'</div>'+
      '<p class="tiny">Opens Google Maps in a new tab. We take no fee from anyone listed there, because we are not listing anyone — these are plain searches.</p>'+
    '</div>';
}
$("hireBtn").addEventListener("click",function(){ renderHire($("hireCity").value.trim()); });
$("hireCity").addEventListener("keydown",function(e){ if(e.key==="Enter"){ e.preventDefault(); $("hireBtn").click(); } });

})();
