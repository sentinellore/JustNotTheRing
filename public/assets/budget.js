/* Just Not The Ring — the budget slider on the rings page. Lifted out of the old single
   file. The carat bands are the site's own orientation estimates and the page says so. */
(function(){
"use strict";

function $(id){ return document.getElementById(id); }

function fmt(n){ return "$"+n.toLocaleString("en-US"); }
function caratForBudget(total, lab){
  var stone=total*0.65;
  var steps = lab
    ? [[0.5,600],[0.75,750],[1,900],[1.5,1100],[2,1250],[2.5,1400],[3,1500],[4,1700],[5,1900]]
    : [[0.5,2600],[0.75,3100],[1,4800],[1.25,5600],[1.5,6600],[2,9500],[2.5,12000],[3,15000]];
  var best=steps[0][0];
  for(var i=0;i<steps.length;i++){ if(steps[i][0]*steps[i][1]<=stone) best=steps[i][0]; }
  if(stone<steps[0][0]*steps[0][1]) best=Math.max(0.2, stone/steps[0][1]);
  return best;
}
function syncBudget(){
  var total=parseInt($("budgetSlider").value,10);
  $("budgetVal").textContent=fmt(total);
  function band(c){ return "~"+(c*0.9).toFixed(1)+"–"+(c*1.12).toFixed(1)+" ct"; }
  $("labOut").textContent=band(caratForBudget(total,true));
  $("natOut").textContent=band(caratForBudget(total,false));
  $("labNote").textContent = total<2500 ? "G color, VS2, excellent cut. At this budget lab-grown is the only route to a full carat."
    : total<8000 ? "G color, VS2, excellent cut, in a 14k solitaire. Comfortable headroom for a better setting."
    : "F–G color, VS1, excellent cut, in platinum. At this budget stop buying weight and buy the grades you can see.";
  $("natNote").textContent = total<2500 ? "H–I color, SI1 eye-clean, in 14k gold — gold hides the warmth and stretches the stone."
    : total<8000 ? "G color, SI1 eye-clean, excellent cut, in a simple solitaire. Buy just under a magic weight."
    : "G color, VS2, excellent cut. Consider an elongated shape for more finger coverage per carat.";
}
$("budgetSlider").addEventListener("input",syncBudget);
syncBudget();

})();
