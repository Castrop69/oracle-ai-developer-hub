// main.js — bootstraps the renderer, input, audio, UI and game, then runs the
// fixed-timestep-ish animation loop.

import { World } from "./world.js";
import { Input } from "./input.js";
import { Audio } from "./audio.js";
import { UI } from "./ui.js";
import { Game } from "./game.js";
import { AssetLoader } from "./assets.js";

const canvas = document.getElementById("game");
const ui = new UI();
const input = new Input();
const audio = new Audio();

let world, game, started = false;
let selectedDifficulty = "pro";

input.onConnect = (connected, id) => ui.padConnected(connected, id);

// --- menu: difficulty selector ---
document.querySelectorAll(".diff").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".diff").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    selectedDifficulty = btn.dataset.diff;
    audio.uiSelect && audio.ctx && audio.uiSelect();
  });
});

// --- pause overlay controls ---
function togglePause(force) {
  if (!started || !game || game.gameOver) return;
  game.paused = force === undefined ? !game.paused : force;
  ui.showPause(game.paused);
}
document.getElementById("resumeBtn").addEventListener("click", () => togglePause(false));
document.getElementById("restartBtn").addEventListener("click", () => {
  game.reset();
  ui.showPause(false);
});
document.getElementById("muteBtn").addEventListener("click", () => {
  ui.setMuteLabel(audio.toggleMute());
});
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyM") ui.setMuteLabel(audio.toggleMute());
});

// Live startup stage, shown on the loading overlay. If anything stalls, the
// last stage tells us (and the player) exactly where — no silent hang.
let bootStage = "starting";
function stage(name) {
  bootStage = name;
  const el = document.getElementById("loading");
  if (el && !el.classList.contains("hidden")) el.textContent = "Loading… (" + name + ")";
}

// Show a fatal message on the loading overlay instead of hanging silently.
function fatal(msg) {
  const el = document.getElementById("loading");
  if (!el) return;
  el.classList.remove("hidden");
  el.style.whiteSpace = "pre-wrap";
  el.style.padding = "24px";
  el.style.textAlign = "center";
  el.textContent = "⚠ " + msg;
}

// Watchdog: if boot hasn't finished shortly, surface where it's stuck.
setTimeout(() => {
  if (bootStage !== "ready")
    fatal(
      "Startup stalled at: " +
        bootStage +
        "\n\nYour browser/GPU may be blocking WebGL.\nTry Chrome or Edge with hardware acceleration ON.",
    );
}, 7000);

// Catch anything that escapes (incl. async) so the player never sees a frozen
// "Loading stadium…" with no explanation.
window.addEventListener("error", (e) =>
  fatal((e.error && (e.error.stack || e.error.message)) || e.message || "Unknown error"),
);
window.addEventListener("unhandledrejection", (e) => {
  const r = e.reason;
  fatal("Startup error:\n" + ((r && (r.stack || r.message)) || String(r)));
});

async function boot() {
  // Load optional glTF assets first (manifest + models). Missing files — or a
  // file:// page with no server — are fine: we fall back to procedural figures.
  stage("loading assets");
  let assets = null;
  try {
    assets = await new AssetLoader().load();
  } catch (err) {
    console.warn("[assets] loader error, continuing procedurally:", err);
  }

  // Build the renderer AND the game inside one guard so neither can hang boot.
  try {
    stage("creating 3D renderer");
    world = new World(canvas, assets);
    stage("building players");
    game = new Game(world, input, audio, ui);
    // Debug handles (used by the headless screenshot harness; harmless in play).
    window.__game = game;
    window.__world = world;
  } catch (err) {
    fatal(
      "Couldn't start the game:\n" +
        (err && (err.message || err)) +
        "\n\nTry Chrome or Edge with hardware acceleration enabled.",
    );
    return;
  }

  stage("ready");
  ui.hideLoading();
  world.render(); // pre-render a frame behind the menu
}

document.getElementById("startBtn").addEventListener("click", () => {
  if (started) return;
  started = true;
  audio.init();
  game.setDifficulty(selectedDifficulty);
  ui.showGame();
  game.start();
});

let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  input.poll();

  // Let the player start with any controller button from the menu, too.
  if (!started && input.hasPad) {
    for (const b of ["cross", "circle"]) {
      if (input.pressed(b)) {
        document.getElementById("startBtn").click();
        break;
      }
    }
  }

  // Options/Esc toggles pause during a game, or starts a new game once it's over.
  if (started && game && input.pressed("options")) {
    if (game.gameOver) game.reset();
    else togglePause();
  }

  if (game) {
    const live = started && !game.paused;
    if (live) {
      game.update(dt);
      world.updateMixers(dt); // advance any glTF character animations
    }
    world.updateCamera(dt);
    // gentle idle crowd shimmer
    if (world.crowd) world.crowd.rotation.y += dt * 0.002;
    world.render();
  }
}

boot();
requestAnimationFrame(loop);
