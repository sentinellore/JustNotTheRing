/* Just Not The Ring — the data the pages are built from, lifted out of the old single file
   as it stood. Loaded before the script that uses it: the quiz reads Q, SAID, STONES, the
   lexicon and the four libraries; the diamond bench and the ring builder read SHAPES, CUTS,
   COLORS and CLARITY. Nothing here runs, and nothing here is fetched from anywhere else.

   tools/check-stories.mjs reads LOC_LIB and CAPTURE_LIB out of this file by their layout
   (one entry per line, starting ` {id:"`), and Q's first question for the home page tile.
   Keep that shape when editing. */
(function(){
"use strict";

/* ============================================================
   DIAMOND DATA
   ============================================================ */
var SHAPES = {
  round:{name:"Round brilliant", ratio:1.00, spread:1.00, note:"The most brilliant shape and the most researched — it's the only one GIA issues a cut grade for. It's also the most expensive per carat, because cutting a round wastes the most rough.", tip:"Insist on Excellent cut. It's the one shape where the grade tells you everything."},
  oval:{name:"Oval", ratio:1.40, spread:1.10, note:"Elongated and finger-flattering, and it covers more surface per carat than a round — an oval typically reads a quarter carat larger than it weighs.", tip:"Look for a bowtie — a dark shadow across the middle. Every oval has some; you want one where it's faint."},
  cushion:{name:"Cushion", ratio:1.10, spread:0.98, note:"A softened square with rounded corners and large facets. Warm, slightly antique, and it throws more fire than a round — broad colored flashes rather than fine white sparkle.", tip:"Cushions hold color. Go a grade higher on color than you would for a round."},
  emerald:{name:"Emerald", ratio:1.45, spread:1.05, note:"A step cut: long parallel facets instead of brilliant triangles, producing a hall-of-mirrors flash rather than sparkle. Architectural and quietly expensive-looking.", tip:"Clarity is exposed here. VS2 or better, and check the corners for color."},
  princess:{name:"Princess", ratio:1.00, spread:1.02, note:"A square brilliant. Sharp modern lines, excellent light return, and less rough wasted in cutting — so more stone per dollar than a round.", tip:"The corners are the weak point. A setting with corner prongs or a V-cap is not optional."},
  radiant:{name:"Radiant", ratio:1.30, spread:1.04, note:"A cut-cornered rectangle with brilliant faceting — emerald's outline with a round's sparkle. Hides inclusions and color better than almost any other shape.", tip:"The most forgiving shape for stretching a budget on clarity and color."},
  pear:{name:"Pear", ratio:1.55, spread:1.12, note:"A round on one end, a point on the other. Elongating, distinctive, and one of the best shapes for apparent size per carat.", tip:"Check the point is protected by a V-prong, and that the shoulders are symmetrical — a lopsided pear is obvious forever."},
  marquise:{name:"Marquise", ratio:1.95, spread:1.20, note:"The largest apparent size of any shape per carat — two points and a wide middle. Strongly vintage, and back in fashion after decades away.", tip:"Both points need protecting, and a bowtie is common. Judge it face-up in person."},
  asscher:{name:"Asscher", ratio:1.00, spread:0.97, note:"A square step cut with cropped corners and deep concentric facets. Distinctly Art Deco, and it draws the eye into the stone rather than off the surface.", tip:"Like the emerald: clarity shows. VS2 minimum, and a high-clarity stone genuinely looks different here."},
  elongated:{name:"Elongated cushion", ratio:1.35, spread:1.06, note:"A cushion stretched long. Softer than an oval, more contemporary than a classic cushion, and currently one of the fastest-rising choices.", tip:"Ask for the length-to-width ratio in writing — 1.25 to 1.45 is where it looks deliberate rather than accidental."},

  hexagon:{name:"Hexagon", alt:true, ratio:1.15, spread:1.08, note:"Six straight sides, usually step-cut. Geometric and deliberate, and it reads as a choice rather than a default the second anyone looks at it. Common in salt-and-pepper and colored stones.", tip:"The six corners are all points of weakness. Bezel it, or insist on prongs that cap the corners."},
  kite:{name:"Kite", alt:true, ratio:1.50, spread:1.14, note:"A four-sided stone with a long axis and two points. Sharp, modern, and it sits beautifully at an angle across the finger — often set east-west or in a cluster.", tip:"Set at a diagonal, it catches on everything. A bezel is close to mandatory for daily wear."},
  shield:{name:"Shield", alt:true, ratio:1.10, spread:1.06, note:"Flat top, tapering to a point. Historically a side stone, increasingly used as a center. Unmistakably not a round, and it costs less per carat than the shapes everyone asks for.", tip:"The bottom point needs a V-prong. Check the shoulders are even — asymmetry is glaring on a shield."},
  trillion:{name:"Trillion", alt:true, ratio:1.00, spread:1.16, note:"A triangle. Enormous spread for the weight — a trillion covers more finger per carat than almost anything — and it throws light in broad flat flashes rather than pinpoint sparkle.", tip:"Three corners, three vulnerabilities. Shallow by nature, so inclusions show: go VS2 or better."},
  rosecut:{name:"Rose cut", alt:true, ratio:1.05, spread:1.22, note:"A flat back with a domed, triangular-faceted top and no pavilion at all. It doesn't sparkle — it glows, softly, the way stones did before electric light. The oldest style here and the most divisive.", tip:"Because it's flat-backed, it looks far larger than its weight. It also shows inclusions clearly, and it will never sparkle like a brilliant. Look at one in person before committing."},
  oldmine:{name:"Old mine cut", alt:true, ratio:1.05, spread:0.94, note:"The hand-cut ancestor of the modern cushion — a small table, a high crown, and an open culet you can see straight down into. Cut by candlelight, for candlelight: broad, slow, warm flashes instead of fine white fire.", tip:"Genuine antiques are rarely graded to modern standards and often face up a grade or two warmer. That warmth is the appeal; don't buy one expecting an F."}
};

var CUTS = [
  {g:"Excellent", v:"buy", d:"Light entering the crown reflects off both pavilion facets and returns straight back through the table. Maximum brilliance, fire and scintillation. This is where the money belongs — a 0.9 ct Excellent outshines a 1.1 ct Good every time.", eff:1.0},
  {g:"Very Good", v:"buy", d:"Very close to Excellent and noticeably cheaper. Most people cannot tell the two apart without comparing them side by side under the same light. A legitimate way to save.", eff:0.92},
  {g:"Good", v:"care", d:"Still returns a reasonable amount of light, but the stone starts to look flatter in dim rooms — restaurant lighting, evening, indoors. You'll see the difference where you actually live.", eff:0.78},
  {g:"Fair", v:"skip", d:"Proportions are off enough that light leaks out of the pavilion. The stone reads glassy rather than lively. No amount of color or clarity rescues this.", eff:0.58},
  {g:"Poor", v:"skip", d:"Most light entering escapes through the bottom or sides. Often the result of cutting for weight — keeping the stone heavy enough to hit a carat threshold at the cost of everything you can see.", eff:0.40}
];

var COLORS = [
  {g:"D", hex:"#FBFDFF", band:"Colorless", v:"care", d:"The top of the scale. Icy and technically perfect — and in a mounted ring, essentially indistinguishable from an F to anyone without master stones. You pay a significant premium for the letter on the paper."},
  {g:"E", hex:"#FAFDFE", band:"Colorless", v:"care", d:"Colorless. Only a trained grader separates D, E and F face-down against masters. Beautiful, and you're still paying for rarity rather than for something visible."},
  {g:"F", hex:"#FAFCFB", band:"Colorless", v:"buy", d:"The last colorless grade and the smartest of the three. Visually identical to D in the setting, meaningfully less expensive."},
  {g:"G", hex:"#FBFCF6", band:"Near colorless", v:"buy", d:"The sweet spot. Faces up white in every metal, including platinum, with no visible tint unless compared directly against a D. If you want one answer for color, this is it."},
  {g:"H", hex:"#FCFBF0", band:"Near colorless", v:"buy", d:"Still faces up white on its own. A trace of warmth appears only alongside a higher grade. Excellent value, especially under 1.5 ct."},
  {g:"I", hex:"#FCF9E8", band:"Near colorless", v:"buy", d:"Slight warmth visible from the side in larger stones, and invisible face-up in yellow or rose gold. The best-value grade in a gold setting."},
  {g:"J", hex:"#FBF6DE", band:"Near colorless", v:"care", d:"Faint warmth that most people won't notice in gold and some will notice in platinum. Below 1 ct it's a genuine bargain; above 2 ct look at it in person first."},
  {g:"K", hex:"#F9F2CF", band:"Faint", v:"care", d:"Now officially tinted. In yellow gold it reads as warm and vintage rather than off-white, and many people prefer it there. In white metal it looks yellow."},
  {g:"L", hex:"#F7EEC2", band:"Faint", v:"skip", d:"Warmth is visible face-up in most lighting. Only worth it in a warm-metal antique setting where the color is the point."},
  {g:"M", hex:"#F5E9B3", band:"Faint", v:"skip", d:"Clearly tinted. Priced accordingly, and hard to make look intentional in a modern ring."},
  {g:"N–R", hex:"#F2E2A0", band:"Very light", v:"skip", d:"Obvious yellow to brown. Sold cheaply, and almost always a disappointment against expectations set by everything else on this page."},
  {g:"S–Z", hex:"#EDD98A", band:"Light", v:"skip", d:"Distinctly yellow. Past Z the stone is graded as a fancy colored diamond instead — a completely different and much more expensive market."}
];

var CLARITY = [
  {g:"FL", n:0, name:"Flawless", v:"care", d:"No inclusions or blemishes at 10×. Under 0.5% of gem diamonds. You are buying a certificate — it is visually identical to a VS2 on a hand."},
  {g:"IF", n:0, name:"Internally flawless", v:"care", d:"No internal inclusions; minor surface blemishes only. Still a rarity premium for something nobody will ever see."},
  {g:"VVS1", n:1, name:"Very very slightly included", v:"care", d:"Inclusions extremely difficult to see even at 10×, usually only from the pavilion side. Lovely, and a lot of money spent invisibly."},
  {g:"VVS2", n:2, name:"Very very slightly included", v:"care", d:"Very difficult to spot at 10×. Still comfortably above what any eye can resolve."},
  {g:"VS1", n:3, name:"Very slightly included", v:"buy", d:"Minor inclusions, difficult to see at 10×. Guaranteed eye-clean and a sensible ceiling for most budgets."},
  {g:"VS2", n:5, name:"Very slightly included", v:"buy", d:"Minor inclusions, somewhat easy to find at 10× — and invisible without magnification. The best balance of price and certainty on the whole scale."},
  {g:"SI1", n:9, name:"Slightly included", v:"buy", d:"Noticeable at 10×, frequently still eye-clean face-up. This is where the value lives, but you must see the stone or its plot first. Position is everything."},
  {g:"SI2", n:15, name:"Slightly included", v:"care", d:"Easy to see at 10×, and sometimes visible to the eye. Roughly a coin-flip. Never buy one unseen, and never in a step cut."},
  {g:"I1", n:26, name:"Included", v:"skip", d:"Inclusions visible to the naked eye and affecting transparency. The stone looks slightly cloudy or spotted in daylight."},
  {g:"I2–I3", n:44, name:"Included", v:"skip", d:"Obvious to the eye, dulling brilliance, and occasionally a durability risk if a feather reaches the surface. Not an engagement stone."}
];

/* ============================================================
   QUIZ
   ============================================================ */
var Q=[
  {p:"When your partner has news, who hears about it first?",n:"Start with how much of their life is lived in public.",
   own:"tell me how they share things",ph:"e.g. They tell their sister everything, but would hate a crowd knowing before their closest friends did.",
   ax:["priv","pub","fam","doc"],
   o:[["It's on their story within the hour",{pub:2,doc:1}],["The group chat of four closest friends",{pub:1}],
      ["Me, then whoever they call on the drive home",{priv:1,fam:1}],["Just me. They like to sit with things",{priv:2}]]},

  {p:"Your best days together usually look like…",n:"Where they're happiest is where they should be when you ask.",
   own:"describe one of your best days",ph:"e.g. Driving out to the coast, stopping at the same diner, home before dark.",
   ax:["nature","urban","home","dest","active","weather"],
   o:[["A trailhead at six in the morning",{nature:2,active:2}],["A new neighborhood, a long walk, three coffee stops",{urban:2,active:1}],
      ["The sofa, good food, nowhere to be",{home:2,priv:1,weather:1}],["An airport gate with carry-ons",{dest:2}]]},

  {p:"Is there a place that already means something to the two of you?",n:"The strongest proposals usually happen where the story already is.",
   own:"describe the place",ph:"e.g. The parking lot of the diner we went to after every hospital appointment. It closed last year and the sign is still up.",
   ax:["meaning","origin","injoke","hobby","animal","deadpan"],implies:{meaning:2},
   o:[["Where we met, or where we first knew",{meaning:2,origin:2}],
      ["A place only the two of us would find funny",{meaning:2,injoke:2,deadpan:1.5}],
      ["Wherever the thing we do together happens",{meaning:2,hobby:2,active:1}],
      ["Somewhere tied to an animal we'd both do anything for",{meaning:2,animal:2}],
      ["Nothing like that — the place isn't the point for us",{}]]},

  {p:"How do they feel about being the center of attention?",n:"Answer honestly. This is the question people get wrong about their partner.",
   own:"describe how they handle it",ph:"e.g. Loves a party, but freezes if a room turns to look at them.",
   ax:["priv","pub","fam","deadpan"],
   o:[["They live for it",{pub:2}],["Fine, if the people watching are theirs",{pub:1,fam:2}],
      ["They'll tolerate about ninety seconds of it",{priv:1}],["They would genuinely hate it",{priv:2}]]},

  {p:"Their jewelry, honestly:",n:"Look at what they already wear, not what you'd like to buy.",
   own:"describe what they actually wear",ph:"e.g. Big silver rings from a market in Oaxaca, nothing matching, no diamonds ever.",
   ax:["classic","modern","vintage","unconv"],
   o:[["One or two pieces they never take off",{classic:2}],["Gold, layered, always something new",{modern:2}],
      ["Estate shops and inherited things",{vintage:2}],["Nothing conventional — they'd want something strange and theirs",{unconv:2}]]},

  {p:"Their hands during an average week:",n:"This decides the setting more than any aesthetic preference does.",
   own:"describe what their hands do",ph:"e.g. Pottery three nights a week, clay under the nails, rings always come off.",
   ax:["active","bezel","hardy","delicate"],
   o:[["Keyboard and coffee cup",{delicate:2}],["Gym, garden, leash, dishwater",{active:2,hardy:1}],
      ["Gloves at work — healthcare, kitchen, lab",{active:2,bezel:2,hardy:2}],["Rings come off constantly anyway",{active:1,bezel:1,hardy:1}]]},

  {p:"If they could only have one, they'd pick:",n:"The trade-off everyone has to make and nobody enjoys making.",
   own:"say what matters most to them",ph:"e.g. They'd want to know where the stone came from more than how big it is.",
   ax:["size","quality","ethics","thrift","vintage"],
   o:[["The biggest stone the budget allows",{size:2}],["A smaller stone that's noticeably better",{quality:2}],
      ["The ring that means something — who made it, what it's made of",{ethics:2,vintage:1}],["Spend less on the ring, more on the life after it",{thrift:2}]]},

  {p:"Have the two of you talked about the ring?",n:"There is no wrong answer here, only a different plan.",
   own:"describe where you've landed",ph:"e.g. We agreed on a sapphire together, but they have no idea I already had it made.",
   ax:["collab","surprise"],
   o:[["They've sent me links. Several.",{collab:2}],["Hints, nothing explicit",{collab:1}],
      ["Nothing, and I want it to stay that way",{surprise:2}],["We're shopping together and both know it",{collab:3}]]},

  {p:"Five years from now, what do you want to be able to show someone?",n:"Whether a photographer belongs in this plan.",
   own:"say what you want to keep",ph:"e.g. Just the ticket stub. We'd both hate a photographer in the bushes.",
   ax:["doc","priv"],
   o:[["Everything. Photos from their face onward.",{doc:2}],["One good picture",{doc:1}],
      ["A shaky video off a phone",{}],["Nothing. It was ours.",{doc:-2,priv:1}]]},

  {p:"How much runway do you have?",n:"Last one before the part where you get to correct us.",
   own:"describe your timing",ph:"e.g. No rush at all, but someone we'd both want there is ill.",
   ax:["rush","ample","fam"],
   o:[["Weeks — something's coming up",{rush:2}],["A couple of months",{normal:2}],
      ["Six months or more",{ample:2}],["No deadline. I just want to get it right.",{ample:2,collab:1}]]}
];

/* ---- What they have actually said ----------------------------------------
   These are the only inputs that are allowed to overrule an inferred axis. A
   quiz guesses; a partner who has said something out loud is not a guess. Every
   one is a fixed id from the list below — never free text — so it can travel in
   a plan link without carrying a sentence about a person. */
var SAID=[
  {id:"decided",     g:"Between you", t:"We've already decided we're getting married. This is the moment, not the question."},
  {id:"nosurprise",  g:"Between you", t:"They've said they don't like surprises."},
  {id:"wantsurprise",g:"Between you", t:"They've said they want to be surprised."},
  {id:"ringtogether",g:"Between you", t:"We're choosing the ring together, and we both know it."},
  {id:"bothasking",  g:"Between you", t:"We're both asking, or we haven't decided who asks."},

  {id:"nopublic",    g:"The moment",  t:"They'd hate being asked in front of people."},
  {id:"wantpeople",  g:"The moment",  t:"They want people there when it happens."},
  {id:"person",      g:"The moment",  t:"There's someone in particular they'd want there, or told first."},
  {id:"nophotos",    g:"The moment",  t:"They've said no photographer."},
  {id:"wantphotos",  g:"The moment",  t:"They want it photographed properly."},
  {id:"place",       g:"The moment",  t:"They've named a place they'd want it to happen."},

  {id:"stone",       g:"The ring",    t:"They've named a stone they want.", pick:true},
  {id:"nodiamond",   g:"The ring",    t:"They've said they don't want a diamond."},
  {id:"noring",      g:"The ring",    t:"They've said they don't want a ring at all."},
  {id:"tworings",    g:"The ring",    t:"We both want rings."},
  {id:"sizeknown",   g:"The ring",    t:"We already know the size — nothing to find out."}
];
var STONES=[
  {id:"sapphire",  t:"Sapphire",               mohs:"9",       note:"The serious answer. Mohs 9, and it comes in teal, peach, parti, grey, green and colorless, not only blue. Montana stones have traceable US origin, which answers the sourcing question at the same time."},
  {id:"emerald",   t:"Emerald",                mohs:"7.5–8",   protect:true, note:"Beautiful and genuinely risky \u2014 heavily included and brittle, so it chips. If this is the stone, get it in a bezel or a protective halo, budget for repairs, and say all of that out loud before you buy it."},
  {id:"ruby",      t:"Ruby",                   mohs:"9",       note:"Corundum, like sapphire, so it takes daily wear as well as anything that isn’t a diamond. Colour is the whole price here \u2014 judge it in daylight, not under a jeweler’s lamp."},
  {id:"moissanite",t:"Moissanite",             mohs:"9.25",    note:"Throws more rainbow fire than a diamond, which people either love or immediately clock. Extremely durable and a fraction of the cost, so it frees the budget for the rest of it."},
  {id:"natural",   t:"A natural diamond",      mohs:"10",      graded:true, plain:true, note:"The conventional answer, and still the one a lot of people mean when they say diamond. It holds its value better than lab-grown and carries a rarity story that some people care about a great deal and others actively don’t. It also costs roughly twice as much per carat, so the honest question is not which is the real diamond \u2014 they both are \u2014 but whether the rarity is the thing being bought. Insist on a GIA or AGS report and check the number is laser-inscribed on the girdle."},
  {id:"lab",       t:"A lab-grown diamond",    mohs:"10",      graded:true, plain:true, note:"Chemically a diamond, graded on the same GIA scales as any other, roughly twice the stone per dollar, and resale value close to nothing. That last part only matters if you were ever going to sell it."},
  {id:"saltpepper",t:"A salt-and-pepper diamond",mohs:"10",    graded:true, note:"A real diamond, and as hard as any other, full of visible black inclusions \u2014 the flaws are the design. Cheap, unrepeatable, and no two are alike, which is also why it can never be replaced with a match."},
  {id:"opal",      t:"Opal or moonstone",      mohs:"5–6.5",   protect:true, note:"Soft enough that daily wear will show within a couple of years. It can still be the right answer \u2014 but choose it knowing that, get a bezel, and plan on taking it off for anything physical."},
  {id:"spinel",    t:"Spinel",                 mohs:"8",       note:"Underrated, naturally vivid and almost never treated. Mohs 8 is the floor for daily wear, so it qualifies \u2014 just."},
  {id:"other",     t:"Something else they named",mohs:"",      protect:true, note:"Check its hardness before anything else: below Mohs 8 and a ring worn every day will scuff and chip visibly within a few years. That is a trade worth making knowingly, and a nasty surprise otherwise."}
];

/* Free-text answers are read by keyword against only the axes that question
   asks about — a timing answer can no longer move the ring aesthetic — and a
   negator in front of a word flips it. "We'd both hate a photographer" used to
   score as the maximum possible enthusiasm for photographers. */
var LEXICON={
  nature:["hike","hiking","trail","mountain","beach","coast","coastline","ocean","lake","river","forest","park","camp","camping","outdoor","outdoors","garden","sunrise","sunset","stars","waterfall","climb","ski","snow","desert","canyon","woods","field","farm","botanic","botanical","cabin","tent"],
  urban:["city","downtown","bar","restaurant","museum","gallery","concert","rooftop","skyline","street","cafe","coffee","brewery","theater","theatre","bookstore","market","subway","gig","show","neighborhood","neighbourhood"],
  home:["home","house","apartment","flat","couch","sofa","kitchen","cook","cooking","pet","dog","cat","bed","pajamas","pyjamas","movie night","backyard","porch","our place","stay in","stayed in"],
  dest:["travel","trip","flight","abroad","vacation","holiday","japan","italy","paris","europe","island","cruise","road trip","airbnb","hotel","passport","mexico","iceland","train","ferry","plane"],
  priv:["private","alone","just us","quiet","introvert","shy","intimate","small","no audience","embarrassed","low key","low-key","the two of us","ourselves"],
  pub:["party","everyone","friends","crowd","crowds","celebration","extrovert","loud","social","big group","audience","announce","attention","spotlight","centre of attention","center of attention"],
  fam:["family","parents","mom","mum","mother","dad","father","siblings","sister","brother","sibling","grandparents","grandmother","grandfather","kids","cousins","nieces","nephews"],
  doc:["photo","photos","photographer","photographed","picture","pictures","camera","film","video","instagram","posted","memories","album"],
  active:["gym","lifting","weights","climbing","garden","gardening","nurse","doctor","surgeon","chef","cook","baker","mechanic","potter","pottery","ceramics","horse","riding","swim","swimming","dishes","hands on","hands-on","lab","hospital","vet","builder","carpenter","welding"],
  bezel:["gloves","snag","snags","catch","catches","hospital","surgery","kitchen","climbing","rough on","scrubs"],
  hardy:["gloves","tough","rough","knocks","batter","beat up"],
  vintage:["vintage","antique","estate","grandmother","grandma","heirloom","deco","art deco","victorian","edwardian","old","thrift","secondhand","second-hand","retro","inherited"],
  modern:["modern","minimal","minimalist","clean","contemporary","sleek","simple lines","architectural"],
  unconv:["unusual","weird","unique","different","alternative","nontraditional","non-traditional","not traditional","quirky","punk","goth","witchy","colorful","colourful","color stone","colour stone","sapphire","emerald","opal","moss","agate","salt and pepper","salt-and-pepper","toi et moi","raw","rough","hexagon","kite","black","green","teal","purple","tattoo","silver","chunky","stacked","handmade","artisan","secondhand"],
  classic:["classic","timeless","traditional","elegant","understated","simple","never take it off","never takes it off","plain","diamond","diamonds","solitaire"],
  ethics:["ethical","ethically","sustainable","recycled","conflict","conflict-free","lab grown","lab-grown","labgrown","moissanite","fair trade","fairmined","provenance","origin","traceable","where it came from","came from","comes from","sourced","source","secondhand","reclaimed","mine","mined"],
  size:["big","bigger","large","huge","statement","carat","as big as"],
  quality:["quality","brilliant","brilliance","clarity","best stone","well cut","cut quality","fire","sparkle"],
  thrift:["cheap","budget","affordable","save","saving","frugal","inexpensive","not much","spend less","practical","down payment","mortgage","house deposit"],
  collab:["together","picked","picking","shopping","sent me","links","pinterest","we chose","wants to pick","their idea","her idea","his idea","board","showed me"],
  surprise:["surprise","surprises","surprised","secret","no idea","clueless","suspect","suspects","blindside"],
  rush:["soon","weeks","next month","asap","hurry","already booked","running out","before"],
  ample:["no rush","next year","someday","eventually","whenever","plenty of time","a year","in no hurry"],
  meaning:["where we met","first date","first kiss","anniversary","our spot","our place","the bench","the bar","means something","meant something","significant","history","story","every time","used to","we always","went to","for years","ever since"],
  origin:["where we met","first date","first kiss","met at","met there","first night","matched"],
  injoke:["joke","funny","ridiculous","stupid","silly","broke down","in-joke","inside joke","laugh"],
  hobby:["climbing gym","studio","record shop","record store","band","chess","league","team","raid","server","campaign","dnd","d&d","bouldering","choir","run club","book club"],
  animal:["dog","cat","horse","shelter","rescue","barn","stable","vet","puppy","kitten","pony","goat","chickens","rabbit","ferret","parrot"],
  deadpan:["deadpan","dry","sarcastic","sarcasm","unromantic","cynical","allergic to"],
  weather:["rain","rains","cold","winter","february","indoor","indoors","all weather","all-weather","warm"],
  delicate:["desk","office","keyboard","screen","laptop","admin","writer"]
};
var NEG=["not","no","never","hate","hates","hated","hating","without","avoid","avoids","dislike","dislikes","dislikes","anti","doesnt","dont","wouldnt","wont","cant","cannot","isnt","arent","aint","against","zero","none","nothing","neither","nor","far from","allergic"];
/* Bipolar axes: a negated hit on one is real evidence for the other. */
var OPP={priv:"pub",pub:"priv",collab:"surprise",surprise:"collab",rush:"ample",ample:"rush",size:"thrift",thrift:"size",classic:"unconv",unconv:"classic"};

/* ---- The location library -------------------------------------------------
   Sixteen archetypes, which are the same sixteen written out in the Locations
   section. The quiz used to run on its own private set of eight generic cells,
   so half of what this site says about where to propose could never be
   recommended to anybody. Each one is scored against the tally rather than
   looked up in a grid, which is what makes a second-place reading possible. */
var LOC_LIB=[
 {id:"overlook",lens:"nature",h:"The overlook you have to earn",
  d:"A summit, a bluff, a fire tower — somewhere the walk up does the work. By the time you are at the top you have been alone together for an hour and the nerves have had somewhere to go. Time it for the hour before sunset.",
  w:"Scout it on the same day of the week at the same hour. Somewhere that is empty on a Wednesday can have twelve people on it on a Saturday.",
  m:{nature:3,priv:2,active:2,pub:-2}},
 {id:"conservatory",lens:"nature",cap:{staff:2.5,photographer:1},h:"The conservatory, or the glasshouse",
  d:"Botanical gardens and glasshouses are the reliable choice: beautiful in any month, warm in February, and staffed by people who have seen a hundred proposals and will help you with this one.",
  w:"Nearly all of them require a permit if you bring a photographer, and several charge a proposal fee. Call two to four weeks ahead and ask about “a proposal with a photographer” — they usually have a standard answer and sometimes a preferred spot.",
  m:{nature:2.5,weather:3,doc:1.5,priv:1,active:-1}},
 {id:"water",lens:"nature",cap:{photographer:1.5},h:"Water's edge, as the light goes",
  d:"A lake, a coast, a river walk, a harbour at dusk. Open sightlines make a hidden photographer easy, and there is somewhere to walk afterwards while it sinks in — which matters more than people expect.",
  w:"Sunset-dependent and wind-exposed. Check which way the light falls at your spot, and have somewhere indoors to go immediately after.",
  m:{nature:3,priv:2,doc:1.5,pub:-1}},
 {id:"rooftop",lens:"urban",cap:{staff:1.5},h:"A rooftop or a high view, early rather than at sunset",
  d:"Skyline, elevation, a drink in hand. A view gives you both a reason to stand still and look at something together, which is most of what a proposal spot actually has to do.",
  w:"Observation decks and rooftop bars are loud and packed at sunset. Go at opening, or book a private corner outright and get it in writing.",
  m:{urban:3,priv:1.5,doc:1,nature:-1}},
 {id:"origin",lens:"urban",cap:{staff:1},h:"Where it started",
  d:"The bar, the bench, the block you lived on. The place carries the meaning, so it does not have to be beautiful — and everyone you eventually tell already knows the story. This is the archetype people cry at.",
  w:"Check it still exists and still opens at that hour. Places like this close, refurbish and change hands, and finding out on the day is its own particular heartbreak.",
  m:{origin:2.5,meaning:1.5,urban:1.5,home:1,priv:1}},
 {id:"athome",lens:"home",capOut:["photographer","staff"],h:"Your own place, on a day with nothing else in it",
  d:"The kitchen, the sofa, whoever else lives there underfoot. For a private person this is the strongest option on the whole list: no audience, no outfit, no travel, and they get to react however they actually feel instead of performing it.",
  w:"It is the hardest setting to photograph. If you want a picture, set a phone running video on a shelf and pull a frame out of it later.",
  m:{home:3.5,priv:3,pub:-1.5}},
 {id:"trip",lens:"destination",h:"A trip they believe is just a trip",
  d:"Propose on the first or second day, not the last night. Spend the rest of it engaged rather than spending the whole week waiting for it, and let them tell people in their own time from somewhere beautiful.",
  w:"The ring never goes in checked luggage. Carry it on you in a flat case, and know your airport's screening rules before you are standing in the queue.",
  m:{dest:3,priv:1.5,ample:1}},
 {id:"gathering",lens:"home",cap:{accomplice:3.5,photographer:3,staff:1.5,tripod:-2},h:"The gathering that already exists",
  d:"A holiday table, a birthday, a reunion — somewhere their people are already in one room, so you are not building an audience from nothing. The audience is the point here, which is exactly why it only works for someone who would genuinely enjoy it.",
  w:"It cannot be undone and there is no quiet version once it starts. Be certain rather than hopeful.",
  m:{pub:3,fam:3,priv:-3}},
 {id:"injoke",lens:"unconv",cap:{accomplice:1,staff:-1},h:"The place with the in-joke",
  d:"The gas station you broke down at. The bench where the bird took their sandwich. The parking lot of a restaurant that has since closed. Nobody else would photograph it, which is the entire point — the story does all the work.",
  w:"Tell one other person what it means beforehand. Otherwise the photographs are of a parking lot and the meaning lives only in the two of you.",
  m:{injoke:2.5,meaning:1.5,deadpan:1,urban:1,priv:1.5}},
 {id:"hobby",lens:"unconv",cap:{staff:2,accomplice:1},h:"Where the thing you do together lives",
  d:"The climbing gym, the pottery studio, the record shop, the chess club, the seven-in-the-morning park with the same six regulars. You ask inside the thing they have built a life around, and the regulars become witnesses.",
  w:"Ask whoever runs it first. They will almost always say yes and often help — and it stops somebody unlocking a door at the wrong moment.",
  m:{hobby:2.5,meaning:1,active:1.5,urban:1,pub:0.5}},
 {id:"story",lens:"destination",h:"Inside the story",
  d:"The town a book is set in, the diner from the film you have watched eleven times, the ground of the team they inherited from somebody. Borrowed meaning — but borrowed from something they already love, which is not at all the same as borrowing someone else's proposal.",
  w:"High effort, and usually travel. Check opening seasons: a surprising number of these places are shut in exactly the month you want them.",
  m:{meaning:1.5,dest:2.5,urban:1}},
 {id:"world",lens:"unconv",capOut:["photographer","staff"],cap:{tripod:2},h:"A game, or a world you share",
  d:"Inside the game you have played together for years, on the server you built, in the campaign you have run since 2019. Increasingly common and frequently mocked by people who were not there. Do it there, then do it again in person with the ring.",
  w:"Two-stage by design. Decide in advance which one is the real one, or you will both spend the second one wondering.",
  m:{hobby:2.5,home:2,priv:2}},
 {id:"transit",lens:"destination",cap:{staff:2,photographer:-3},h:"Mid-transit",
  d:"On a train, on a ferry, in the car on a drive you have done a hundred times, on a plane at cruising altitude. Nowhere to escape to and nothing to do but talk, which is either the most romantic thing available or a trap, depending entirely on them.",
  w:"Ask the crew first if you want any help at all. And do not do it at the start of a long journey unless you are certain of the answer.",
  m:{dest:2.5,priv:2.5,urban:0.5}},
 {id:"unromantic",lens:"unconv",cap:{photographer:-1,accomplice:1},h:"The aggressively unromantic",
  d:"The hardware store aisle. The DMV queue. A warehouse-store food court at two in the afternoon. This works only for the couple whose entire register is deadpan — and for them it lands harder than any overlook, because the contrast is the joke and the sincerity underneath it is the whole point.",
  w:"Know which kind of couple you are before you commit. There is no way to redeem this one halfway through.",
  m:{deadpan:3,injoke:2,priv:2,home:1,pub:-1}},
 {id:"animal",lens:"unconv",cap:{accomplice:2.5},h:"Around the animal",
  d:"The shelter you got them from, the barn where they ride, the vet's parking lot after good news. Attaching the moment to the creature they would do anything for is a shortcut straight past their composure, which is either unfair or exactly right.",
  w:"Animals do not take direction. Have somebody else holding the lead or the rope at the actual moment, and accept that there will be a tail in the photographs.",
  m:{animal:2.5,priv:1.5,home:1.5,nature:1}},
 {id:"nowhere",lens:"home",capOut:["photographer","staff","accomplice"],cap:{nothing:2},h:"No location at all",
  d:"In bed on a Sunday morning, before either of you has brushed your teeth. The least photogenic option available, and the one a surprising number of people say they would have chosen — because it is the version with no performance anywhere in it.",
  w:"There is nothing to plan, which means there is nothing to hide behind. Know your first two sentences.",
  m:{priv:4,home:2,doc:-1.5,pub:-2}}
];

/* ---- The method library ---------------------------------------------------
   The eight written out in the How section, for the same reason. Note that how
   you ask and who chooses the ring are now two separate questions: "we picked
   it together" used to decide both, and it says nothing whatsoever about
   whether you ask on a trailhead or in front of forty people. */
/* ---- The method library ---------------------------------------------------
   Six occasions, and only occasions. This list used to hold four different
   kinds of thing at once -- an occasion, whether it was photographed, what
   happened afterwards, and who chose the ring -- and made you pick one of the
   four and discard the rest. They compose in real life: an ordinary weeknight,
   photographed, with everyone waiting after, is an ordinary plan. So the
   photographer moved to CAPTURE_LIB below, and choosing the ring together moved
   to the ring card, where it was always an answer to a different question. */
var METHOD_LIB=[
 {id:"tuesday",h:"The ordinary Tuesday",
  d:"No occasion, no reservation, no warning. Making dinner, out with the animal, halfway through a weeknight. The whole meaning is that it was not a production — that this is what the rest of it looks like, and you wanted to ask in the middle of it.",
  m:{priv:3.5,home:1.5,pub:-1.5}},
 {id:"walk",h:"The walk that ends somewhere",
  d:"A hike, a beach, a route you have done a hundred times, with one spot chosen in advance. The walking gives you both something to do with the nerves, and arriving somewhere makes a natural moment to stop.",
  m:{nature:2,active:1.5,priv:1.5}},
 {id:"dinner",h:"Dinner, then the real reason",
  d:"Before or after the meal, never during. Before, and you both get to enjoy dinner engaged; after, and they do not spend two courses suspicious. Doing it at the table in a full restaurant turns strangers into an audience — only choose that deliberately.",
  m:{urban:2.5,pub:1.5}},
 {id:"errand",h:"The staged errand",
  d:"A believable reason to be somewhere and dressed well — a friend's party that is not happening, a work thing, a portrait session \u201Cfor your parents\u201D. The cover story does the heavy lifting: it explains the outfit, the location, and why you are nervous.",
  m:{surprise:3,pub:0.5}},
 {id:"longgame",h:"The long game",
  d:"A letter a week, a photo album finished on the last page, a route through the places that got you here. It takes weeks of preparation and lands hardest with sentimental people who keep things. Make sure the final step is somewhere you can be alone.",
  m:{meaning:2.5,ample:2,surprise:1.5}},
 {id:"reveal",h:"The reveal, then the room",
  d:"Ask just the two of you, then walk into a bar or a living room where everyone they love is already waiting. A private yes, followed immediately by the celebration. Give them ten minutes in the car first — they will want to look at their own hand for a while.",
  m:{pub:2.5,fam:2}}
];

/* ---- How it gets remembered ------------------------------------------------
   A separate decision from the occasion, with real alternatives rather than a
   yes or no. Hiring somebody is only one of them, and for a lot of proposals it
   is the wrong one: the person already bringing them is in on it and already
   there, and venue staff have usually done this before and cost nothing. */
var CAPTURE_LIB=[
 {id:"photographer",h:"A photographer, at a distance",
  d:"Waiting with a long lens and looking like a tourist. You get their real face in the real second, which is the one photograph people actually keep, and a short set of portraits once they know. Agree a signal, a direction to face, and a plan for running late.",
  w:"The one thing on this list you cannot arrange at short notice. Book six weeks out, more between Thanksgiving and Valentine's Day, and settle who is handling the venue permit in writing.",
  m:{doc:3.5,priv:1,ample:1.5,pub:-0.5}},
 {id:"accomplice",h:"The person who brings them",
  d:"Whoever is getting them to the spot is already in on it and already going to be there — the sibling, the friend with the excuse about brunch. Give them one job for thirty seconds: stand where you tell them, press record before you start, and keep filming past the part where everyone starts crying.",
  w:"Brief them on the phone, not by text, and have them practise the angle once. The commonest failure is a beautiful video of somebody's shoulder.",
  m:{doc:2,fam:2.5,surprise:1,pub:1}},
 {id:"staff",h:"Somebody who works there",
  d:"The server, the guide, the person on the desk at the conservatory. They are already present, it costs nothing, and at a venue that sees proposals they have almost certainly done this before and will have a view on where you should stand.",
  w:"Ask when you call about the booking, not on the day. Get a name, and have a fallback in case that person is not on shift.",
  m:{doc:1.8,urban:1.5,dest:1.5,rush:1.5}},
 {id:"tripod",h:"A phone, propped and already running",
  d:"On a shelf, a wall, a rock, a car roof. Start it early and let it run — storage is cheaper than the moment. It is the only practical way to photograph a proposal at home, and it produces the frame nobody is performing for.",
  w:"Check the frame before you start and lock the exposure. And leave it running afterwards: the phone call they make two minutes later is often the better footage.",
  m:{doc:1.5,home:2.5,priv:1.5}},
 {id:"after",h:"Portraits straight afterwards, not during",
  d:"Nobody captures the moment itself; you take the pictures ten minutes later, with the ring on and the adrenaline still going. Far easier to arrange, much cheaper, and the pictures are of two people who are visibly delighted rather than two people being observed.",
  w:"Decide the spot beforehand while you can still think, and get one of just their hand. That is the photograph they will send to everybody.",
  m:{doc:1,rush:1.5,priv:1.5}},
 {id:"nothing",h:"Nothing at all",
  d:"No camera, no accomplice, no phone. You keep the only copy, which is the point — a surprising number of people say afterwards that not having it on film is what made it theirs. Tell one person the same evening if you want it witnessed.",
  w:"It is genuinely irreversible, and it is the one choice on this page that a few people do regret. If you are unsure, the propped phone costs you nothing and you can delete it.",
  m:{doc:-3.5,priv:1.5,pub:-1}}
];

/* What the place does to how it can be remembered. The per-archetype `cap` and
   `capOut` fields below add to this; both come straight out of what each
   location's own copy already says -- water's edge says open sightlines make a
   hidden photographer easy, the conservatory says staff have seen a hundred
   proposals, home says a propped phone is the only practical way. */
var CAP_BY_LENS={
  home:        {tripod:2, photographer:-2, staff:-2, after:0.8},
  nature:      {photographer:1.5, staff:-1, after:0.8},
  urban:       {staff:1.5, after:0.8},
  destination: {staff:1.5, photographer:0.5, after:0.8},
  unconv:      {staff:1, accomplice:1, photographer:-0.5, after:0.8}
};
/* Portraits afterwards carry the same 0.8 everywhere on purpose. They are the
   one option that works at any of the sixteen places, which without this leaves
   them the only entry never receiving a bonus -- quietly ranked last not because
   they fit badly but because nothing ever argued for them. */

var RING_REC={
  classic:{shape:"Round brilliant",set:"Six-prong solitaire, or a hidden halo if you want more sparkle without the era stamp",metal:"Platinum or 14k white gold"},
  modern:{shape:"Oval or elongated cushion",set:"Thin-band solitaire in a low basket, or east-west if they like being slightly ahead of things",metal:"14k yellow gold"},
  vintage:{shape:"Old European cut, antique cushion, or an emerald cut",set:"Milgrain detailing or a three-stone, ideally a genuine estate piece",metal:"18k yellow gold"},
  unconv:{shape:"Emerald, kite, hexagon, or a stone in a colour they would actually choose",set:"Full bezel — modern, protective, and it makes an unusual stone look deliberate",metal:"14k yellow or rose gold"}
};
var SPEC_REC={
  size:{line:"Lab-grown · 1.8–2.2 ct · G · VS2 · Excellent cut · elongated shape",why:"Lab-grown is the only honest route to real size at a normal budget, and an elongated shape covers more finger per carat. Buy just under a magic weight — 1.9 ct looks identical to 2.0 and costs meaningfully less."},
  quality:{line:"1.00–1.20 ct · F–G · VS1 · GIA Excellent cut, polish and symmetry",why:"Cut first, because it is the only C visible across a room. F to G faces up perfectly white in any metal, and VS1 is guaranteed eye-clean without paying for grades nobody can see."},
  ethics:{line:"Recycled metal · documented-origin or reclaimed stone · report number in hand",why:"Ask for the specific claim in writing — origin country, recycled content, or the estate the stone came from. Adjectives like “ethical” and “conflict-free” are unregulated marketing. A reset heirloom beats all of it."},
  thrift:{line:"0.70–1.00 ct lab-grown · G–H · SI1 eye-clean · 14k gold solitaire",why:"Gold hides warmth, so H does the work of an F. SI1 is where the value lives if you look at the stone or its plot first. And buy at 0.92 rather than 1.00 — the price wall is at the round number, not at the size."},
  unconv:{line:"Teal or parti sapphire, salt-and-pepper diamond, or a rose cut · 1.2–2.0 ct · bezel or low basket",why:"Skip the grading-report language entirely — coloured stones are not graded on D-to-Z or VS scales, so you are buying with your eyes. Check hardness first (sapphire 9, spinel 8, and nothing below 8 for daily wear), get it bezel-set, and buy from someone who will name the cutter."}
};

window.SITE={
  SHAPES:SHAPES, CUTS:CUTS, COLORS:COLORS, CLARITY:CLARITY,
  Q:Q, SAID:SAID, STONES:STONES,
  LEXICON:LEXICON, NEG:NEG, OPP:OPP,
  LOC_LIB:LOC_LIB, METHOD_LIB:METHOD_LIB, CAPTURE_LIB:CAPTURE_LIB, CAP_BY_LENS:CAP_BY_LENS,
  RING_REC:RING_REC, SPEC_REC:SPEC_REC
};
})();
