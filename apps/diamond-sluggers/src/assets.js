// assets.js — optional glTF/GLB asset pipeline.
//
// Loads player/stadium models referenced by assets/manifest.json. Two sources:
//   1. window.__EMBEDDED_ASSETS / __EMBEDDED_MANIFEST — injected by the
//      standalone build (base64 .glb baked into the HTML), works on file://
//   2. fetch() relative to ./assets/ — the dev-server path
// EVERYTHING here is optional: missing manifest or models falls back to the
// procedural figures, so the game always runs with zero asset files.

import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as skeletonClone } from "three/addons/utils/SkeletonUtils.js";

export const DEFAULT_MANIFEST = {
  players: { home: null, away: null },
  stadium: null,
  replaceProceduralStadium: false,
  playerScale: 1.0,
  playerYOffset: 0.0,
  playerYaw: 0.0, // radians; rotate imported models so they face +Z at rest
  // Materials (by name) that get recolored to the team color per player.
  tintMaterials: [],
  clips: {
    idle: "idle",
    swing: "swing",
    pitch: "pitch",
    run: "run",
    dive: "dive",
  },
};

function b64ToArrayBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export class AssetLoader {
  constructor(baseUrl = "./assets/") {
    this.base = baseUrl;
    this.manifest = DEFAULT_MANIFEST;
    this.templates = { home: null, away: null };
    this.stadium = null;
    this.enabled = false;
  }

  async load() {
    this.manifest = await this._loadManifest();
    const loader = new GLTFLoader();

    const loadModel = async (path) => {
      const embedded = (window.__EMBEDDED_ASSETS || {})[path];
      if (embedded) {
        return new Promise((resolve, reject) =>
          loader.parse(b64ToArrayBuffer(embedded), "", resolve, reject),
        );
      }
      if (location.protocol === "file:") {
        throw new Error("file:// page with no embedded copy of " + path);
      }
      return loader.loadAsync(this.base + path);
    };

    const players = this.manifest.players || {};
    await Promise.all(
      Object.entries(players).map(async ([team, path]) => {
        if (!path) return;
        try {
          this.templates[team] = await loadModel(path);
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
        const gltf = await loadModel(this.manifest.stadium);
        this.stadium = gltf.scene;
        this.stadium.traverse((o) => {
          if (o.isMesh) {
            o.castShadow = true;
            o.receiveShadow = true;
          }
        });
        console.info(`[assets] loaded stadium model: ${this.manifest.stadium}`);
      } catch (e) {
        console.warn(`[assets] could not load stadium — using procedural stadium.`, e.message || e);
      }
    }
    return this;
  }

  async _loadManifest() {
    // The standalone build bakes the manifest in; use it even on file://.
    if (window.__EMBEDDED_MANIFEST) {
      return { ...DEFAULT_MANIFEST, ...window.__EMBEDDED_MANIFEST };
    }
    if (typeof location !== "undefined" && location.protocol === "file:") {
      console.info("[assets] file:// page with no embedded manifest — procedural visuals only.");
      return DEFAULT_MANIFEST;
    }
    try {
      const res = await fetch(this.base + "manifest.json", { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return { ...DEFAULT_MANIFEST, ...(await res.json()) };
    } catch (e) {
      console.info("[assets] no usable manifest.json — running with procedural visuals only.");
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
