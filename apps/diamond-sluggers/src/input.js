// input.js — unified controller + keyboard input.
//
// Targets the W3C "standard" Gamepad mapping, which is what a PS5 DualSense
// reports over USB or Bluetooth in Chrome/Edge/Firefox. Buttons are exposed by
// friendly names so the rest of the game never touches raw indices.

// Standard-mapping button indices (DualSense in parentheses).
const BTN = {
  cross: 0, // ✕  (A)
  circle: 1, // ○  (B)
  square: 2, // □  (X)
  triangle: 3, // △  (Y)
  l1: 4,
  r1: 5,
  l2: 6, // analog trigger, also reported as a button
  r2: 7,
  share: 8,
  options: 9,
  l3: 10,
  r3: 11,
  up: 12,
  down: 13,
  left: 14,
  right: 15,
  ps: 16,
};

// Keyboard fallback: maps a logical button name to one or more KeyboardEvent.code.
const KEYMAP = {
  cross: ["KeyJ", "Enter"],
  square: ["KeyK"],
  circle: ["KeyL"],
  triangle: ["KeyI"],
  l1: ["KeyQ"],
  r1: ["KeyE"],
  l2: ["ShiftLeft"],
  r2: ["Space"],
  options: ["Escape"],
  up: ["ArrowUp", "KeyW"],
  down: ["ArrowDown", "KeyS"],
  left: ["ArrowLeft", "KeyA"],
  right: ["ArrowRight", "KeyD"],
  // pitch-select number keys reuse the face-button names
  num1: ["Digit1"],
  num2: ["Digit2"],
  num3: ["Digit3"],
  num4: ["Digit4"],
};

const DEADZONE = 0.18;

export class Input {
  constructor() {
    this.padIndex = null;
    this.keys = new Set();
    this.prev = {}; // previous-frame pressed state for edge detection
    this.cur = {};

    // Smoothed analog stick + triggers, exposed to gameplay code.
    this.lx = 0;
    this.ly = 0;
    this.rx = 0;
    this.ry = 0;
    this.lt = 0; // L2 0..1
    this.rt = 0; // R2 0..1

    this.onConnect = null;

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      // Stop the page from scrolling on arrows/space during play.
      if (
        ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
          e.code,
        )
      ) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));

    window.addEventListener("gamepadconnected", (e) => {
      this.padIndex = e.gamepad.index;
      if (this.onConnect) this.onConnect(true, e.gamepad.id);
    });
    window.addEventListener("gamepaddisconnected", () => {
      this.padIndex = null;
      if (this.onConnect) this.onConnect(false, "");
    });
  }

  get pad() {
    if (this.padIndex === null) return null;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return pads[this.padIndex] || null;
  }

  get hasPad() {
    return this.pad !== null;
  }

  // Returns true while the named logical button is held (pad OR keyboard).
  _down(name) {
    const pad = this.pad;
    if (pad && BTN[name] !== undefined) {
      const b = pad.buttons[BTN[name]];
      if (b && b.pressed) return true;
    }
    const codes = KEYMAP[name];
    if (codes) {
      for (const c of codes) if (this.keys.has(c)) return true;
    }
    return false;
  }

  // Sample everything once per frame. Call at the top of the game loop.
  poll() {
    this.prev = this.cur;
    this.cur = {};
    for (const name of Object.keys(BTN)) this.cur[name] = this._down(name);
    for (const name of ["num1", "num2", "num3", "num4"])
      this.cur[name] = this._down(name);

    const pad = this.pad;
    if (pad) {
      const ax = pad.axes;
      this.lx = dz(ax[0] ?? 0);
      this.ly = dz(ax[1] ?? 0);
      this.rx = dz(ax[2] ?? 0);
      this.ry = dz(ax[3] ?? 0);
      this.lt = pad.buttons[BTN.l2]?.value ?? 0;
      this.rt = pad.buttons[BTN.r2]?.value ?? 0;
    } else {
      // Build a virtual stick from the arrow / WASD keys.
      this.lx = (this._down("right") ? 1 : 0) - (this._down("left") ? 1 : 0);
      this.ly = (this._down("down") ? 1 : 0) - (this._down("up") ? 1 : 0);
      this.rx = 0;
      this.ry = 0;
      this.lt = this._down("l2") ? 1 : 0;
      this.rt = this._down("r2") ? 1 : 0;
    }
  }

  // Edge-detected press: true only on the frame the button goes down.
  pressed(name) {
    return !!this.cur[name] && !this.prev[name];
  }

  // True while held.
  held(name) {
    return !!this.cur[name];
  }

  // Edge-detected release.
  released(name) {
    return !this.cur[name] && !!this.prev[name];
  }

  // A short rumble on supported pads (DualSense supports dual-rumble).
  rumble(strong = 0.6, weak = 0.3, ms = 180) {
    const pad = this.pad;
    const act = pad && pad.vibrationActuator;
    if (!act) return;
    try {
      act.playEffect("dual-rumble", {
        startDelay: 0,
        duration: ms,
        strongMagnitude: strong,
        weakMagnitude: weak,
      });
    } catch (_) {
      /* not supported — ignore */
    }
  }
}

function dz(v) {
  return Math.abs(v) < DEADZONE ? 0 : v;
}
