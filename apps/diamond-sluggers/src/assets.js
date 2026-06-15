// assets.js — optional glTF/GLB asset pipeline.
//
// Looks for ./assets/manifest.json and loads any models it references (player
// characters, a stadium). EVERYTHING here is optional: if the manifest or a
// model is missing, the game silently falls back to the built-in procedural
// figures, so it always runs with zero asset files.
//
// To use your own art, drop .glb files under apps/diamond-sluggers/assets/ and
// point manifest.json at them. See assets/README.md for the conventions.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

export const DEFAULT_MANIFEST = {
  players: { home: null, away: null },
  stadium: null,
  replaceProceduralStadium: false,
  playerScale: 1.0,
  playerYOffset: 0.0,
  playerYaw: 0.0, // radians; rotate imported models so they face the pitcher (-Z)
  clips: {
    idle: "idle",
    swing: "swing",
    pitch: "pitch",
    run: "run",
    dive: "dive",
  },
};

export class AssetLoader {
  constructor(baseUrl = "./assets/") {
    this.base = baseUrl;
    this.manifest = DEFAULT_MANIFEST;
    this.templates = { home: null, away: null }; // loaded GLTF objects (scene + animations)
    this.stadium = null;
    this.enabled = false; // true once at least one model loads
  }

  async load() {
    this.manifest = await this._loadManifest();
    const loader = new GLTFLoader();

    const players = this.manifest.players || {};
    await Promise.all(
      Object.entries(players).map(async ([team, path]) => {
        if (!path) return;
        try {
          const gltf = await loader.loadAsync(this.base + path);
          this.templates[team] = gltf;
          this.enabled = true;
          console.info(`[assets] loaded ${team} player model: ${path}`);
        } catch (e) {
          console.warn(
            `[assets] could not load ${team} player '${path}' — using procedural figure.`,
            e.message || e,
          );
        }
      }),
    );

    if (this.manifest.stadium) {
      try {
        const gltf = await loader.loadAsync(this.base + this.manifest.stadium);
        this.stadium = gltf.scene;
        this.stadium.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        console.info(`[assets] loaded stadium model: ${this.manifest.stadium}`);
      } catch (e) {
        console.warn(
          `[assets] could not load stadium — using procedural stadium.`,
          e.message || e,
        );
      }
    }
    return this;
  }

  async _loadManifest() {
    // On a file:// page (e.g. the double-click standalone build) fetch is
    // blocked/unreliable and there's nothing to serve — go straight to
    // procedural visuals instead of risking a hang.
    if (typeof location !== "undefined" && location.protocol === "file:") {
      console.info(
        "[assets] file:// page — skipping manifest fetch, procedural visuals only.",
      );
      return DEFAULT_MANIFEST;
    }
    try {
      const res = await fetch(this.base + "manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      // Merge over defaults so partial manifests are fine.
      return { ...DEFAULT_MANIFEST, ...(await res.json()) };
    } catch (e) {
      console.info(
        "[assets] no usable manifest.json — running with procedural visuals only.",
      );
      return DEFAULT_MANIFEST;
    }
  }

  hasPlayer(team) {
    return !!this.templates[team];
  }

  // Return a fresh, independently-animatable copy of a team's model.
  clonePlayer(team) {
    const gltf = this.templates[team];
    if (!gltf) return null;
    const root = skeletonClone(gltf.scene); // deep clone incl. skinned skeleton
    return { root, animations: gltf.animations || [] };
  }

  get replaceStadium() {
    return !!(this.manifest.replaceProceduralStadium && this.stadium);
  }
}
