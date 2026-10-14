/* Round-trip tests for the resume data contract.  Run:  node test/roundtrip.js

   There is no build step and no dependency to install. The functions under test are
   lifted straight out of src/app.template.html by name, so the test always runs the
   shipped source rather than a copy of it that can quietly fall behind.
   Anything needing a real browser — the fit solver, the preview scaling, the layout —
   is out of scope here; this covers the data that travels between files. */
"use strict";
const fs = require("fs"), path = require("path");

const SRC = fs.readFileSync(path.join(__dirname, "..", "src", "app.template.html"), "utf8");

/* ---------- pull one top-level declaration out of the template ---------- */
/* Brace-counting is the obvious way and the wrong one: the source is full of regex
   literals containing quotes and braces, which no simple scanner survives. Every
   top-level declaration in the template starts at column 0 and everything nested is
   indented, so a declaration simply runs until the next column-0 statement. */
const TOP = /^(?:function |async function |const |let |var |\/\* |\$\(|addEventListener\(|document\.|window\.|measureStick\(|\[\[|\["|try |if )/m;
function extract(name){
  const re = new RegExp("^(?:function\\s+" + name + "\\s*\\(|(?:const|let)\\s+" + name + "\\s*=)", "m");
  const m = re.exec(SRC);
  if (!m) throw new Error("could not find " + name + " in the template");
  const rest = SRC.slice(m.index + 1);
  const next = TOP.exec(rest);
  return SRC.slice(m.index, next ? m.index + 1 + next.index : SRC.length);
}

/* Everything the data path touches, evaluated in one scope with a stub for the
   handful of browser objects buildExport reaches for. */
const NAMES = ["esc","dec","hex2rgb","rgb2hex","mix","luma","palette","PRESETS","THEME0","HEX",
               "normalize","sheetHTML","sheetRules","parseLiteral","extractResume","extractLogo","buildExport",
               "bigrams","similarity","sectionKind","KIND_QIDS","hitKind","rankHits","LIST_TPL","infoboxList",
               "parseInfobox","CORP","creditOptions","houseStyle","formatOption","SURE_MARGIN","isConfident"];
const PRELUDE = `
  const PAGE_W=816, PAGE_H=1056, PAD_X=48, PAD_Y=40;
  const TOTAL = PAGE_W - PAD_X*2;
  const BASE = {fs:9.2, lh:12.5, secfs:8.6, secmt:8, legmt:14};
  /* the sheet CSS lives in the stylesheet, which a DOM-less run has none of */
  const document = {styleSheets: []};
  let S = null, lastCols = {c1:245, c2:137, c3:338};
  const manualCols = () => lastCols;
  const page = {style:{getPropertyValue(k){
    return ({"--fs":"9.20px","--lh":"12.50px","--secfs":"8.60px","--secmt":"8.0px","--legmt":"14.0px"})[k];
  }}};
`;
const scope = new Function(PRELUDE + NAMES.map(extract).join("\n\n") +
  "\nreturn {" + NAMES.join(",") + ", setS:v=>{S=v}};")();

/* ---------- tiny assertion helpers ---------- */
let pass = 0, fail = 0;
const show = v => typeof v === "string" ? v : JSON.stringify(v);
function ok(name, cond, detail){
  if (cond){ pass++; console.log("  ok   " + name); }
  else { fail++; console.log("  FAIL " + name + (detail ? "\n         " + detail : "")); }
}
const eq = (name, a, b) => ok(name, JSON.stringify(a) === JSON.stringify(b),
  "expected " + show(b) + "\n         got      " + show(a));

/* ---------- the fixture ---------- */
const LOGO = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=";
const FIXTURE = {
  name:"PABLO MENA", company:"STILL SPEEDING LLC", role:"Sound Mixer", logo:LOGO,
  contact:[{text:"pablo@example.com", link:"mailto:pablo@example.com"}, {text:"+1 555 0100"}],
  sections:[
    {name:"FEATURE FILMS", credits:[
      {p:"Coastline", r:"Production Sound Mixer", c:"Northlight / J. Alvarez"},
      {p:"Hidden Entry", r:"Boom Operator", c:"Quiet Co", off:true},
      {p:"Nightjar", r:"Production Sound Mixer", c:"Ember Media", pin:true}]},
    {name:"ALL HIDDEN", credits:[{p:"Old Spot", r:"Utility", c:"Someone", off:true}]},
    {name:"TELEVISION", credits:[{p:"Salt & <Pepper>", r:"Mixer", c:"Meridian TV"}]}],
  theme:{preset:"slate", paper:"#f4f6f7", ink:"#15181c", accent:"#35657f", keyline:1.5, dividers:true},
  opts:{autoFit:true, autoCols:true, target:8.6}
};

console.log("\nnormalize");
{
  const st = scope.normalize(FIXTURE);
  const c = st.sections[0].credits;
  eq("keeps the hidden flag", c[1].off, true);
  eq("keeps the pinned flag", c[2].pin, true);
  eq("defaults both flags off", [c[0].off, c[0].pin], [false, false]);
  eq("keeps a data: logo", st.logo, LOGO);
  ok("drops a non-data logo", scope.normalize({logo:"http://evil.example/x.png"}).logo === "");
  const legacy = scope.normalize({sections:[{name:"X", credits:[["Title","Role","Co"]]}]});
  eq("still reads the legacy array form", legacy.sections[0].credits[0],
     {p:"Title", r:"Role", c:"Co", off:false, pin:false});
  eq("falls back to the default theme", scope.normalize({}).theme.paper, scope.THEME0.paper);
  eq("rejects a bogus keyline", scope.normalize({theme:{keyline:99}}).theme.keyline, scope.THEME0.keyline);
}

console.log("\nsheetHTML");
{
  const html = scope.sheetHTML(scope.normalize(FIXTURE));
  ok("draws a visible credit", html.includes("Coastline"));
  ok("draws no hidden credit", !html.includes("Hidden Entry"));
  ok("prints no heading for an all-hidden section", !html.includes("ALL HIDDEN"));
  ok("keeps the sections that still have something", html.includes("FEATURE FILMS") && html.includes("TELEVISION"));
  ok("escapes markup in the data", html.includes("Salt &amp; &lt;Pepper&gt;"));
  ok("emits the logo once", (html.match(/<img/g) || []).length === 1);
  /* Coastline + Nightjar + Salt & <Pepper>; the two hidden ones draw nothing */
  eq("draws one row per visible credit", (html.match(/<tr data-k=/g) || []).length, 3);
}

console.log("\nexport → import");
{
  scope.setS(scope.normalize(FIXTURE));
  const file = scope.buildExport();
  const back = scope.normalize(scope.extractResume(file));
  const flat = st => st.sections.map(s => s.name + ":" +
    s.credits.map(c => c.p + (c.off ? "[off]" : "") + (c.pin ? "[pin]" : "")).join(","));
  eq("every credit survives, flags and all", flat(back), flat(scope.normalize(FIXTURE)));
  eq("the all-hidden section is still in the file", back.sections[1].credits.length, 1);
  eq("the logo survives", back.logo, LOGO);
  eq("the look survives", back.theme, scope.normalize(FIXTURE).theme);
  eq("the contact line survives", back.contact, scope.normalize(FIXTURE).contact);
  eq("the name survives", [back.name, back.company, back.role],
     [FIXTURE.name, FIXTURE.company, FIXTURE.role]);
  ok("the hidden credit is in the data but not the markup",
     file.includes("Hidden Entry") && !scope.sheetHTML(back).includes("Hidden Entry"));
}

console.log("\nimporting someone else's file");
{
  const old = '<html><body><div class="lockup"><img src="' + LOGO + '" alt=""></div>' +
    '<script>\nconst CV = {"name":"OLD","sections":[{"name":"F","credits":[["A","B","C"]]}]};\n<\/script></body></html>';
  const st = scope.normalize(scope.extractResume(old));
  eq("reads a pre-rename export, whose block is called CV", st.name, "OLD");
  eq("recovers a logo that is only in the markup", scope.extractLogo(old), LOGO);
  const renamed = '<html><body><script>\nconst RESUME = {"name":"NEW","sections":[]};\n<\/script></body></html>';
  eq("reads a block called RESUME", scope.normalize(scope.extractResume(renamed)).name, "NEW");
  ok("takes a hand-edited block JSON would reject",
     scope.parseLiteral("{name:'Solo', sections:[],}").name === "Solo");
  const evil = '{name:"x", sections:(function(){return []})()}';
  let threw = false;
  try { scope.parseLiteral(evil); } catch (e){ threw = /code, not just data/.test(e.message); }
  ok("refuses a data block carrying code", threw);
  let threw2 = false;
  try { scope.parseLiteral('{a:`${globalThis.x=1}`}'); } catch (e){ threw2 = true; }
  ok("refuses a template literal", threw2);
  ok("reports a file with no resume in it",
     (() => { try { scope.extractResume("<html>nothing here</html>"); return false; }
              catch (e){ return /No resume data/.test(e.message); } })());
}

console.log("\ncredit lookup");
{
  /* trimmed from the real Past Lives infobox: Plainlists, a piped link, a ref, a comment */
  const WT = "{{Short description|2023 film}}\n{{Infobox film\n| director = [[Celine Song]]\n" +
    "| producer = {{Plainlist|\n* [[David Hinojosa]]\n* [[Christine Vachon]]\n}}\n" +
    "| studio = {{Plainlist|\n* [[CJ ENM]]<!-- note -->\n* [[2AM (company)|2AM]]\n}}\n" +
    "| distributor = {{ubl|[[A24]] (United States)<ref>{{Cite web |title=x}}</ref>|CJ ENM}}\n" +
    "| released = {{Film date|2023|1|21}}\n}}\nPast Lives is a film.";
  const box = scope.parseInfobox(WT);
  eq("reads a plain field", box.director, ["Celine Song"]);
  eq("unpacks a Plainlist", box.producer, ["David Hinojosa", "Christine Vachon"]);
  eq("shows a piped link's text and drops comments", box.studio, ["CJ ENM", "2AM"]);
  eq("unpacks ubl, dropping refs and parentheticals", box.distributor, ["A24", "CJ ENM"]);
  eq("spells out an abbreviated link, keeps a shortened one",
     scope.parseInfobox("{{Infobox television\n| company = [[FX Productions|FXP]]\n| network = [[Syncopy Inc.|Syncopy]]\n}}"),
     {company:["FX Productions"], network:["Syncopy"]});
  eq("finds nothing on a page with no infobox", scope.parseInfobox("Just prose."), {});

  eq("a section name says what it holds",
     ["FEATURE FILMS","TELEVISION","MUSIC VIDEOS","COMMERCIAL","SHORT FILMS","DIGITAL MEDIA"].map(scope.sectionKind),
     ["film","tv","mv","ad","film",""]);
  eq("descriptions sort productions from namesakes",
     ["2023 film by Celine Song","American television series (2022–)","episode of Mad Men (S7 E8)",
      "American film director","album by Element Eighty","family name"].map(d => scope.hitKind(d, [])),
     ["film","tv","episode","","",""]);
  eq("a person is never a production, whatever the description says", scope.hitKind("2020 film", ["Q5"]), "");

  const hits = [
    {label:"The Bear", desc:"1988 film", kind:"film", year:1988, sites:30},
    {label:"The Bear", desc:"American television series", kind:"tv", year:2022, sites:34, hasCo:true},
    {label:"Mother's Boy", desc:"1913 film", kind:"film", year:1913, sites:2},
    {label:"The Bear", desc:"play by Anton Chekhov", kind:"", sites:40}];
  eq("a TELEVISION row ranks the series first", scope.rankHits("The Bear", "tv", hits)[0].desc, "American television series");
  eq("a FEATURE FILMS row ranks the film first", scope.rankHits("The Bear", "film", hits)[0].desc, "1988 film");
  ok("drops an alias whose title does not match, and a non-production",
     scope.rankHits("The Bear", "", hits).length === 2);

  const film = scope.creditOptions({label:"Past Lives", kind:"film", box:box, co:["Q1"]}, {Q1:"Ignored Co"});
  eq("the infobox wins and the director is not repeated as producer",
     film.options.map(o => o.map(x => x.v).join(" / ")),
     ["CJ ENM / David Hinojosa / Celine Song", "CJ ENM / Celine Song", "A24 / Celine Song"]);
  const series = scope.creditOptions({label:"Severance", kind:"tv", dir:["Q2"], runner:["Q3"], co:["Q4"], net:["Q5"]},
    {Q2:"Ben Stiller", Q3:"Dan Erickson", Q4:"Fifth Season", Q5:"Apple TV+"});
  const bbc = scope.creditOptions({label:"Oppenheimer", kind:"tv", dir:["Q6"], prod:["Q7"], net:["Q8"]},
    {Q6:"Barry Davis", Q7:"British Broadcasting Corporation", Q8:"BBC Two"});
  ok("a company listed as producer stays out of the person slot",
     !JSON.stringify(bbc.options).includes("British Broadcasting"));
  eq("a series stands on its showrunner, from Wikidata alone",
     series.options.map(o => o.map(x => x.v).join(" / ")),
     ["Fifth Season / Dan Erickson", "Apple TV+ / Dan Erickson"]);

  /* confidence: what may be written into an empty box unasked */
  const full = [[{t:"co", v:"FX Productions"}, {t:"p", v:"Christopher Storer"}]];
  const H = (kind, score, extra) => Object.assign({label:"T", kind:kind, score:score, exact:true, options:full}, extra);
  ok("sure: exact series in a TV row, rival is a film", scope.isConfident("tv", [H("tv", 8), H("film", 7.5)]));
  ok("unsure: three same-titled films close together", !scope.isConfident("film", [H("film", 6.4), H("film", 6.0), H("film", 5.2)]));
  ok("sure: a same-titled film far behind", scope.isConfident("film", [H("film", 8), H("film", 5)]));
  ok("unsure: title only roughly matches", !scope.isConfident("film", [H("film", 8, {exact:false})]));
  ok("unsure: wrong kind for the section", !scope.isConfident("ad", [H("film", 8)]));
  ok("unsure: no company to fill in", !scope.isConfident("film", [H("film", 8, {options:[[{t:"p", v:"Someone"}]]})]));
  ok("unsure: an episode is never filled in", !scope.isConfident("", [H("episode", 8)]));
  ok("unsure: no section kind and a close rival of another kind", !scope.isConfident("", [H("tv", 6.4), H("film", 5.4)]));
  ok("unsure: nothing found", !scope.isConfident("film", []));

  const st = scope.houseStyle([{c:"NORTHLIGHT / J. ALVAREZ"}, {c:"EMBER MEDIA/K. ITO"}, {c:"MERIDIAN TV/R. DAY"}, {c:""}]);
  eq("picks up capitals, initials and tight slashes", st, {caps:true, initials:true, sep:"/"});
  eq("writes a suggestion in that style", scope.formatOption(film.options[0], st), "CJ ENM/D. HINOJOSA/C. SONG");
  eq("an empty resume gets plain style", scope.houseStyle([]), {caps:false, initials:false, sep:" / "});
}

console.log("\n" + (fail ? fail + " failed, " : "") + pass + " passed\n");
process.exit(fail ? 1 : 0);
