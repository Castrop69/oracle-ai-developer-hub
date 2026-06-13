# ⚾ Diamond Sluggers

**Over-the-top 3D arcade baseball for PC** — in the spirit of *MLB Slugfest* and
*The Bigs*, with modern WebGL graphics and full **PS5 DualSense** controller
support. Crank moonshots, paint corners with breaking balls, rob homers at the
wall, and catch fire for monster swings.

It runs in any modern desktop browser (Chrome, Edge, Firefox) at 60 fps — no
install, no build step, no game engine to download.

![type: web game](https://img.shields.io/badge/type-web%20game-orange)
![tech: Three.js / WebGL](https://img.shields.io/badge/tech-Three.js%20%2F%20WebGL-blue)
![controller: PS5 DualSense](https://img.shields.io/badge/controller-PS5%20DualSense-success)

---

## Why a browser game (and not Unreal/Unity)?

The goal was **modern 3D graphics on PC, controllable with a PS5 pad, runnable
immediately**. A WebGL/Three.js build delivers exactly that:

- Real-time 3D stadium with dynamic lighting, soft shadows, and **UnrealBloom**
  post-processing.
- **PS2-era models and textures:** articulated players with short-sleeve
  jerseys and uniform numbers, caps with brims, bats and gloves; textured
  grass/dirt, outfield advertising walls, and a center-field scoreboard.
- The browser **Gamepad API** reads a DualSense over USB or Bluetooth natively —
  no drivers, no Steam Input shim.
- Three **difficulty levels**, in-game **pause / restart** (no refresh), and a
  **mute** toggle.
- Zero install for the player: open a URL and hit **PLAY BALL**.

The same gameplay code would port to a native engine later, but this gets a
real, playable, good-looking game into your hands today.

## Run it

You need a tiny static web server (ES modules don't load over `file://`).

```bash
cd apps/diamond-sluggers

# Option A — npm (uses `serve`)
npm start
#   → open http://localhost:5173

# Option B — Python, no install
python3 -m http.server 5173
#   → open http://localhost:5173
```

Three.js is pulled from a CDN via an import map, so the **first load needs
internet**. After that the browser caches it.

> Tip: open in **Chrome or Edge** for the best DualSense + WebGL experience.

## Connect a PS5 controller

1. **USB:** plug the DualSense into your PC with a USB-C cable. Done.
2. **Bluetooth:** hold **PS + Create** until the light bar flashes, then pair it
   from your OS Bluetooth settings.
3. Open the game and **press any button** to wake the pad — the menu shows
   "🎮 … connected" when it's detected.

No controller? The game is fully playable on the **keyboard**.

## Controls

| Action | DualSense | Keyboard |
| --- | --- | --- |
| Aim / Move | **Left Stick** | Arrows / WASD |
| Contact swing | **✕ Cross** | **J** |
| Power swing | **□ Square** | **K** |
| Pitch: Fastball | **✕** | **1** |
| Pitch: Curve | **□** | **2** |
| Pitch: Changeup | **△** | **3** |
| Pitch: Screwball | **○** | **4** |
| Charge pitch / Turbo | **R2** (hold) | **Space** (hold) |
| Dive / Leap (field) | **✕** | **J** |
| Pause / Resume (also restart after a final) | **Options** | **Esc** |
| Mute / unmute | pause menu | **M** |
| Start from menu | **✕ / ○** | **Enter** |

Pick a **difficulty** — *Rookie · Pro · Legend* — on the title screen. It scales
how hard the AI pitches and hits, how fast fielders cover ground, and how
forgiving your swing-timing window is. **Pause** with Options/Esc to resume,
restart, or toggle sound; when a game ends, Options/Esc starts a fresh one — no
page refresh needed.

The pad **rumbles** on contact, big hits, and home runs.

## How to play

You manage the **home team** and play both sides of the ball.

### Batting (bottom of each inning)
- The pitch leaves the mound — **time your swing**. Contact quality depends on
  *timing* (when you swing) **and** *plate coverage* (aim the bat at the ball
  with the left stick).
- **✕ contact** swing = line drives, easier contact. **□ power** swing =
  launch angle and distance, but a tighter window.
- Early contact **pulls** the ball; late contact goes the **other way**.
- Hold **R2** as you swing to dump **Turbo** into the swing, and after a hit
  hold it to **gamble for the extra base**.

### Pitching (top of each inning)
- Aim the target with the **left stick**, pick a pitch with **✕ □ △ ○**, then
  **hold R2 to charge velocity** and release to deliver. Curves and screwballs
  break late in opposite directions; the changeup sinks.

### Fielding
- The nearest fielder auto-converges on the ball. When the ball is close, the
  **✕ DIVE / LEAP** prompt appears — time it to make a diving grab or **rob a
  home run** at the wall.

### 🔥 ON FIRE
- Good contact and big plays fill the **Turbo** meter. Fill it completely to
  catch **ON FIRE** — supercharged exit velocity for a string of monster hits
  until it burns out.

### Winning
- Standard rules: 3 outs change sides, 9 innings, most runs wins. Walk-offs and
  extra innings included.

## Bring your own 3D models (glTF/GLB)

The game ships with procedural players and ballpark, but you can **drop in real
art** without touching code. Put `.glb` files in `assets/models/` and point
[`assets/manifest.json`](./assets/manifest.json) at them:

```jsonc
{
  "players": { "home": "models/batter_home.glb", "away": "models/batter_away.glb" },
  "stadium": "models/ballpark.glb",
  "replaceProceduralStadium": true,
  "playerScale": 1.0, "playerYOffset": 0.0, "playerYaw": 0.0,
  "clips": { "idle": "idle", "swing": "swing", "pitch": "pitch", "run": "run", "dive": "dive" }
}
```

Models are loaded with Three.js `GLTFLoader`; skinned characters are cloned per
player and driven by an `AnimationMixer`, with clips matched by name (`idle`,
`swing`, `pitch`, `run`, `dive`). **Anything missing falls back to the built-in
figure**, so partial asset sets are fine. Full conventions (scale, orientation,
clip names, where to find free rigged characters) are in
[`assets/README.md`](./assets/README.md).

## Project layout

```
apps/diamond-sluggers/
├── index.html         # shell, HUD, import map (Three.js from CDN)
├── styles.css         # HUD + menu styling
└── src/
    ├── main.js        # bootstrap + game loop
    ├── constants.js   # field geometry & physics tuning
    ├── world.js       # Three.js scene: stadium, field, players, ball, bloom
    ├── input.js       # DualSense (Gamepad API) + keyboard, edge detection
    ├── audio.js       # procedural Web Audio SFX (no asset files)
    ├── ui.js          # HUD DOM bindings
    ├── assets.js      # optional glTF/GLB loader (players + stadium), fallback
    └── game.js        # state machine: pitching, batting, fielding, scoring, AI
└── assets/            # optional custom models + manifest.json (see its README)
```

Everything is synthesized at runtime — no textures, models, or audio files to
download beyond Three.js itself.

## Browser support

Needs WebGL2 and the Gamepad API: **Chrome / Edge / Firefox** on desktop.
Vibration (rumble) works best in Chromium-based browsers.

## License

MIT — have fun, swing big. 🥎🔥
