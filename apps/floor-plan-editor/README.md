# Floor Plan Editor

An interactive, browser-based floor plan editor that recreates the
example single-storey house plan and lets you edit every room.

## Run it

It's a single-page static app — no build step required.

```bash
cd apps/floor-plan-editor
python3 -m http.server 8000
```

Open <http://localhost:8000>. Any modern browser will work.

## What you can do

- **Move** a room by dragging it
- **Resize** by dragging any of the four corner handles
- **Rename** with a double-click (or use the side panel)
- **Edit** position, size (feet), ceiling height, fill color, and
  exterior/interior flag in the **Properties** panel
- **Add / Duplicate / Delete** rooms via the toolbar
- **Nudge** with arrow keys (`Shift` for larger steps)
- **Zoom** with the wheel, **Pan** by holding `Space` and dragging
- **Fit** with `F` or the toolbar button
- **Export** the plan as JSON (or **Import** one you saved earlier)
- **Reset** to restore the original layout

The plan is persisted to `localStorage`, so your edits survive a
page reload.

## Files

```
apps/floor-plan-editor/
├── index.html       # markup + toolbar
├── styles.css       # styling
├── floorplan.js     # default plan data (rooms in feet)
└── editor.js        # SVG rendering + interaction
```

## Customizing the starting plan

`floorplan.js` exposes `window.DEFAULT_PLAN`. Each room is

```js
{
  id: "kitchen",
  name: "Kitchen",
  x: 45, y: 27, w: 12, h: 23,   // feet
  ceiling: 10,                  // optional, displays "(10' CEILING)"
  exterior: true,               // optional, renders tan/dashed
  color: "#e6dccb",             // optional fill override
  sub: "16' SOFFIT",            // optional second label line
}
```

`bounds` defines the drawable area (also in feet).

## Notes

- Coordinates are in feet. Dimensions display as `feet'-inches"`.
- Snapping is half-foot.
- The starting layout is an approximation of the source plan — drag
  rooms to refine alignment to your taste.
