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
const TOP = /^(?:function |const |let |var |\/\* |\$\(|addEventListener\(|document\.|window\.|measureStick\(|\[\[|\["|try |if )/m;
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
               "normalize","sheetHTML","sheetRules","parseLiteral","extractResume","extractLogo","buildExport"];
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

console.log("\n" + (fail ? fail + " failed, " : "") + pass + " passed\n");
process.exit(fail ? 1 : 0);
