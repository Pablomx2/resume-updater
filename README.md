# Resume Updater

A single-file app for keeping a film-credits resume on one page.

**Open `resume-updater.html` in a browser.** No install, no server, no internet needed.

The app ships **empty** — no resume and no logo are stored in it. Use **Import HTML…** to load
one (an export from this app, or the original bundled artifact download); the contact line,
sections, every credit and the logo all come across. Or press **Start a blank resume** and type.

`index.html` is the project page — a short write-up with a link that launches the app.
It doubles as the GitHub Pages landing page.

## What it does

**Edit** — name, company, role, contact line, sections and credits, all live.
New credits are added to the **top** of their section, where the newest job belongs.
Drag the ⠿ handle to reorder a credit, including across sections.

**Override the automatics** — hover the sheet and drag either column divider to set the
widths by hand, or move the text slider in the preview bar to set the size. Each switches
the matching checkbox off; tick it again to hand control back.

**On a phone** — the same app, rearranged. **Edit**, **Preview** and **Advice** become tabs
rather than columns, a credit takes two lines instead of seven columns, and the sheet has a
**Fit / 100%** switch so you can read the type at its real size and scroll around it. Drag
the ⠿ handle with a finger to reorder; the column dividers are always visible where there is
no mouse to hover with. The fitter measures the sheet whichever tab you are on, so the advice
is the same advice.

**Design** — five presets (Classic, Slate, Warm, Noir, Plain), then paper, text and accent
colour pickers to go your own way. Everything else in the palette — body text, the faint
legend, the rules, the surround behind the sheet — is derived from paper and text, so a
hand-picked pair stays coherent instead of clashing. Two structural tweaks sit alongside:
the weight of the rule under your name (hairline, rule, bold) and whether the section
dividers show. Picking any preset value by hand just drops you into "custom"; nothing locks.

The look travels with the resume: it is written into the export and read back on import.
Noir prints only if you tick **Background graphics** in the print dialogue — the app says
so when the paper is dark.

**Logo** — there is no logo to start with. It arrives one of two ways: importing a resume
lifts the lockup image out of that file, or **Upload…** takes a PNG, JPG or SVG from your
machine. It prints 15px tall at the top right, so keep the file small (512KB ceiling —
a wide transparent PNG or an SVG is ideal). **Remove** takes it off again, and exports
simply omit the image when there is no logo.

**Auto-fit to one page** — binary-searches the largest credit text size that still
fits 8.5×11in, never shrinking the header. Capped at the original design size (9.2px),
so it never blows the type up to fill space.

**Auto columns** — measures every project title and production-company string and picks
the three column widths that produce the fewest wrapped lines, then re-checks them at the
fitted text size. Wrapped lines are the main hidden cost on a dense sheet: each one eats a
credit's worth of space. Or drag the dividers and set the widths yourself.

**Advice** — a readability grade plus specifics:
- how many credits to cut to get back to comfortable text size
- which credits are weakest, ranked (non-mixer positions, entries that wrap to two lines,
  entries with no producer/director, bottom-of-a-long-section, repeated clients)
- when the list is simply too long for one page
- when there is room to *add* credits

Nothing is deleted automatically. The **●** icon hides a credit so you can test a shorter
list without losing it; **★** pins a credit so the advisor never suggests cutting it.
A hidden credit stays in the exported file too — carried in its data marked `off`, drawn
neither on screen nor in the PDF — so the record survives and re-importing brings it back
still hidden.

## Buttons

| | |
|---|---|
| **Import HTML…** | Loads a resume back in — a file exported here, or the original bundled artifact download. |
| **Export HTML** | Opens a Save As dialogue, then writes a clean standalone resume with the fitted column widths and text size baked in. Hidden credits ride along in the data, unprinted. Still hand-editable, still re-importable. Firefox and Safari have no save picker, so there it downloads to your Downloads folder as before. |
| **Print / PDF** | Prints just the page. In the print dialog choose **Save as PDF**, paper **US Letter**, margins **None**, and turn **off** headers/footers. |
| **Clear** | Empties the editor and starts over. Export first if you want to keep what is there. |

Edits autosave to the browser's local storage, so closing the tab does not lose work.
That storage is per-browser and per-machine — use **Export HTML** for anything you want
to keep or send.

## Rebuilding

`resume-updater.html` is generated. To change the app itself, edit `src/app.template.html`
and run:

```bash
node src/build.js
```

`src/seed.json` is the state the app starts in — deliberately empty, so neither a resume nor
a logo lives in this repo.

The sheet is drawn by one function, `sheetHTML`, and styled by the `#page` rules in the
template's stylesheet. **Export serialises that same function into the file it writes and
copies those same rules**, so the exported resume cannot drift away from the preview — change
the sheet in one place and both follow.

## Tests

```bash
node test/roundtrip.js
```

No dependencies and no build step: the test lifts the functions out of
`src/app.template.html` by name and exercises the data contract — that hidden and pinned
credits survive an export and come back on import, that hidden ones are drawn nowhere, that
older exports and the original artifact bundle still read, and that an imported file cannot
smuggle code into the data block.
