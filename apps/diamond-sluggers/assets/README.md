# Custom 3D assets (optional)

Diamond Sluggers ships with **procedural** players and a procedural ballpark, so
it runs with zero asset files. This folder lets you **drop in your own glTF/GLB
models** to replace them — real character art, a real stadium, etc.

If `manifest.json` points at a file that doesn't exist (or you leave the
defaults as `null`), the game silently falls back to the built-in figures. You
can mix and match: import only the players, only the stadium, or both.

## Quick start

1. Export your models as **`.glb`** (binary glTF — geometry, textures, skin, and
   animations in one file).
2. Put them in `assets/models/`.
3. Edit `manifest.json` to reference them.
4. Reload the page. Check the browser console for `[assets] loaded …` messages.

```jsonc
{
  "players": {
    "home": "models/batter_home.glb",   // home team character
    "away": "models/batter_away.glb"     // away team character
  },
  "stadium": "models/ballpark.glb",      // optional full stadium
  "replaceProceduralStadium": true,      // hide the built-in field if you import one
  "playerScale": 1.0,                    // scale models so they're ~1.9 m tall
  "playerYOffset": 0.0,                  // lift/drop so feet sit at y = 0
  "playerYaw": 0.0,                      // radians; rotate so the model faces -Z (the pitcher)
  "clips": {                             // substring match against your clip names
    "idle":  "idle",
    "swing": "swing",
    "pitch": "pitch",
    "run":   "run",
    "dive":  "dive"
  }
}
```

## Model conventions

**Players**
- Origin at the **feet**, standing upright, facing **−Z** (toward the pitcher).
  Use `playerYaw` if your exporter faces +Z; use `playerYOffset` to seat the feet
  at the ground (`y = 0`).
- Roughly **1.9 m tall**; adjust with `playerScale`.
- One model per team is reused for the batter, pitcher, and fielders — team
  color is whatever the model's own materials are (the procedural retint only
  applies to the built-in figures).

**Animation clips** (all optional — missing ones just don't play)
The game plays clips by **name substring** (case-insensitive), configurable in
`clips`:
- `idle` — looped resting/stance pose (default when nothing else is playing)
- `swing` — batter swing (played once, returns to idle)
- `pitch` — pitching delivery (played once)
- `run` — looped, used for base runners
- `dive` — fielder diving catch (played once)

**Stadium**
- Built to the same scale as the field: home plate at the origin, outfield
  toward −Z, fence ~100 m out. Set `replaceProceduralStadium: true` to skip the
  built-in field/stands. If your model has no ground, the field will look empty,
  so include the playing surface in your model.

## Notes

- **Standard glTF only** out of the box. DRACO-compressed or KTX2-textured
  models need their decoders wired into the `GLTFLoader` in `src/assets.js`.
- Large models increase first-load time; the game waits for assets before the
  menu becomes playable.
- Free riggable characters: [Mixamo](https://www.mixamo.com) (export as glTF, or
  FBX → glTF) is a quick way to get a rigged player with `idle`/`run`/swing-like
  animations.

## `models/` directory

Put your `.glb` files here. It's empty by default (the game uses procedural
visuals until you add some).
