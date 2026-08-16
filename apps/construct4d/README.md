# Construct4D — 4D Construction Scheduler with Live Microsoft Project Sync

Construct4D links a Microsoft Project schedule to an animated 3D construction sequence (a
"4D" simulation). Adjust the schedule in MS Project, save, and the animation, Gantt chart,
and element states update automatically. It can also **read construction drawings**: drop a
plan set PDF and Claude interprets the sheets — grids, dimensions, levels — and rebuilds the
3D model to match the actual building.

![Stack](https://img.shields.io/badge/React%2019-Vite-blue) ![3D](https://img.shields.io/badge/Three.js-4D%20viewer-green) ![AI](https://img.shields.io/badge/Claude%20Opus%205-drawing%20interpretation-orange)

## Features

- **Live Microsoft Project integration.** Keep your `.mpp` open in Project and save a copy
  as XML (`File → Save As → XML Format`). Construct4D watches that file (File System Access
  API) and re-syncs the 4D simulation within ~2 seconds of every save — dates, new tasks,
  progress, logic changes, all of it. Firefox/Safari fall back to one-shot import.
- **4D animation.** Elements are hidden before their tasks start, grow vertically in
  "under construction" yellow while tasks are in progress, and switch to their trade
  material when complete. Play at 1–30 schedule days per second, or scrub the Gantt cursor.
- **Automatic task↔element linking.** Task names are classified by trade (sitework,
  foundations, structure, envelope, roof, interiors, MEP) and floor level (`Level 2`, `L2`,
  `2nd floor`…), then linked to matching model elements. No manual mapping required to get
  a working simulation.
- **Auto-massing model.** With only a schedule, the app generates a block model (footings,
  columns, decks, envelope, partitions, risers, roof, site) sized to the number of levels
  your task names mention — so every activity has geometry to animate on day one.
- **AI drawing interpretation.** Drop plan sheets (PDF or images). Pages are rendered with
  pdf.js and sent to **Claude Opus 5** with a structured-output schema; Claude reads title
  blocks, grids, and dimension strings and returns a block model of the real building
  (with unit conversion and stated assumptions). The schedule re-links to the new model
  automatically. Server-side refusal fallback is enabled by default, so benign sheets that
  trip a safety classifier are retried on a fallback model in the same request.
- **Interactive Gantt.** Hierarchical WBS, planned bars vs. built-to-date fill, milestones,
  tooltips, and a draggable simulation-date cursor synced with the 3D view.
- **A scene, not just boxes.** Procedural materials give the massing real surfaces — curtain
  wall with mullions and spandrel bands, board-formed concrete, asphalt, mottled ground —
  under soft shadows, SSAO, and a subtle bloom pass. Jobsite props follow the schedule: a
  tower crane stands (and slowly slews) while structure/envelope/roof work is running, then
  comes down; landscaping trees grow in with the site tasks; low-rise context buildings
  fade into the fog for depth and scale.
- **Two-way link tracing.** Click any element in 3D to see which schedule tasks drive it
  (hover for a quick tooltip); click a task name in the Gantt to highlight everything it
  builds in the model. `Esc` clears the selection.
- **Schedule-variance mode.** Toggle "Color by schedule variance" to recolor started work by
  recorded `% Complete` from MS Project vs. where the plan says it should be at the
  simulation date — green on/ahead, yellow slightly behind, red behind. Scrub to your status
  date to see slippage on the building itself.
- **Coverage report.** A "Not animating" panel lists leaf tasks that didn't match any trade,
  so you know exactly which activities have no geometry (and can fix them with a rename).
- **Keyboard control.** `Space` play/pause, `←`/`→` step a day (`Shift` for a week).
- **Below-grade work.** Excavation is its own trade: the dig limits render as a translucent
  cut volume that grows *downward* as mass-ex/shoring tasks progress, drilled piers and
  caissons bore down beneath the footings, and elevator pits and underslab utility runs sit
  under the slab. The pit behaves like the real thing: open through the foundation work,
  then it closes up as backfill / slab-on-grade tasks progress (an explicit backfill task
  drives this when the schedule has one). Toggle **See below grade** to x-ray the ground
  (and tilt the camera lower) and watch the underground sequence — the phase that usually
  drives early float; in x-ray the dig limits remain as a faint as-built trace. Keywords
  cover mass excavation, shoring, sheet/soldier piles, dewatering, piers, caissons, piles,
  auger cast, and underslab rough-in; the drawing interpreter also returns below-grade
  elements (basements, pier schedules, pits) when the sheets show them.

## Run it

```bash
cd apps/construct4d
npm install
npm run dev
```

Open the printed URL (Chrome or Edge recommended for live file watching). Click
**Load sample project** to see the full 4D loop without any files.

## Web and app

Construct4D ships as an installable **PWA**:

- **Web** — deploy `dist/` to any static host. A GitHub Actions workflow
  (`.github/workflows/deploy-construct4d.yml`) publishes it to **GitHub Pages** on every
  push to `main` that touches this app: enable it once under
  *Repo Settings → Pages → Source: GitHub Actions*, and the app is live at
  `https://<user>.github.io/<repo>/`. The build uses relative paths, so it also works from
  any subfolder or other static host (Netlify, S3, OCI Object Storage…).
- **Desktop app** — open the web URL in Chrome or Edge and click the **Install** icon in
  the address bar. Construct4D runs in its own window with its own dock/taskbar icon, and
  the service worker keeps the app shell cached for instant, offline-tolerant startup.
- **iPad / iPhone / Android** — open the URL and use **Add to Home Screen** (Safari share
  menu) or **Install app** (Chrome menu). Handy for walking the site with the model.

Note: live MS Project file-watching needs the File System Access API (Chrome/Edge desktop);
on other platforms use **Import XML**. The visual style — PBR materials, soft shadows,
ACES tone mapping, environment reflections — runs on WebGL and works everywhere the
browser does, including the installed app.

## The MS Project round-trip

1. In Microsoft Project: `File → Save As → XML Format (*.xml)` — save next to your `.mpp`.
2. In Construct4D: **Open MS Project XML (live sync)** and pick that file.
3. Work in MS Project as usual. Each time you re-save the XML (Project remembers the
   target — `File → Save As → same file` is two clicks), Construct4D detects the change and
   updates the animation, Gantt, and element links in place, preserving your scrub position.

> Why XML? The binary `.mpp` format is proprietary and can't be parsed reliably in a
> browser. Project's XML export is lossless for tasks, dates, hierarchy, progress, and
> logic — everything the 4D simulation needs.

## Drawing interpretation

Paste an Anthropic API key in the side panel (stored only in your browser's localStorage;
requests go directly to the Anthropic API using the browser-access header). Then choose a
drawing set — up to 8 PDF sheets per run. Claude returns a simplified element model
(30–120 boxes: footings, slabs, columns, walls per face per level, roof, partitions, MEP
risers, site elements), which replaces the auto-massing model, and your schedule tasks are
re-linked to it by trade and level.

## How the pieces fit

```
MS Project (.mpp) ── Save As XML ──▶ file watcher ──▶ parseMspXml ──▶ tasks
Drawings (PDF) ── pdf.js ──▶ Claude Opus 5 (structured output) ──▶ element model
tasks + elements ──▶ autoMap (trade + level) ──▶ mapping
mapping + simulation date ──▶ element states ──▶ Three.js 4D view + Gantt
```

## Limitations / next steps

- Task↔element links are keyword-based (the "Not animating" panel shows any gaps); a manual
  mapping editor would help unusual naming conventions.
- Element geometry is box massing, not BIM — importing IFC/glTF models is a natural upgrade.
- Variance mode compares recorded `% Complete` against planned progress at the simulation
  date; earned-value curves (PV/EV over time) would be a natural extension.
