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

input.onConnect = (connected, id) => ui.padConnected(connected, id);

async function boot() {
  // Load optional glTF assets first (manifest + models). Missing files are
  // fine — the game falls back to procedural figures.
  let assets = null;
  try {
    assets = await new AssetLoader().load();
  } catch (err) {
    console.warn("[assets] loader error, continuing procedurally:", err);
  }

  try {
    world = new World(canvas, assets);
  } catch (err) {
    document.getElementById("loading").textContent =
      "WebGL failed to start. Use a modern desktop browser (Chrome/Edge/Firefox). " +
      err;
    return;
  }
  game = new Game(world, input, audio, ui);
  ui.hideLoading();

  // Pre-render a frame behind the menu so the stadium is visible.
  world.render();
}

document.getElementById("startBtn").addEventListener("click", () => {
  if (started) return;
  started = true;
  audio.init();
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
    for (const b of ["cross", "options", "circle"]) {
      if (input.pressed(b)) {
        document.getElementById("startBtn").click();
        break;
      }
    }
  }

  if (game) {
    if (started) game.update(dt);
    world.updateMixers(dt); // advance any glTF character animations
    world.updateCamera(dt);
    // gentle idle crowd shimmer
    if (world.crowd) world.crowd.rotation.y += dt * 0.002;
    world.render();
  }
}

boot();
requestAnimationFrame(loop);
