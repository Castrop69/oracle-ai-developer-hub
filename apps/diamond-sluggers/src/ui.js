// ui.js — thin wrapper over the HUD DOM. The game calls these; no game logic
// lives here.

export class UI {
  constructor() {
    this.el = {
      hud: document.getElementById("hud"),
      menu: document.getElementById("menu"),
      loading: document.getElementById("loading"),
      awayRuns: document.getElementById("awayRuns"),
      homeRuns: document.getElementById("homeRuns"),
      inningHalf: document.getElementById("inningHalf"),
      inningNum: document.getElementById("inningNum"),
      balls: document.getElementById("balls"),
      strikes: document.getElementById("strikes"),
      outs: document.getElementById("outs"),
      base1: document.getElementById("base1"),
      base2: document.getElementById("base2"),
      base3: document.getElementById("base3"),
      turboWrap: document.getElementById("turboWrap"),
      turboFill: document.getElementById("turboFill"),
      chargeWrap: document.getElementById("chargeWrap"),
      chargeFill: document.getElementById("chargeFill"),
      announce: document.getElementById("announce"),
      prompt: document.getElementById("prompt"),
      padStatus: document.getElementById("padStatus"),
    };
    this._announceTimer = null;
  }

  showGame() {
    this.el.menu.classList.add("hidden");
    this.el.hud.classList.remove("hidden");
  }

  hideLoading() {
    this.el.loading.classList.add("hidden");
  }

  padConnected(connected, id) {
    const e = this.el.padStatus;
    if (connected) {
      e.textContent = "🎮 " + (id?.slice(0, 28) || "Controller") + " connected";
      e.classList.add("connected");
      e.classList.remove("disconnected");
    } else {
      e.textContent = "🎮 No controller — using keyboard";
      e.classList.remove("connected");
      e.classList.add("disconnected");
    }
  }

  score(away, home) {
    this.el.awayRuns.textContent = away;
    this.el.homeRuns.textContent = home;
  }

  inning(num, half) {
    this.el.inningNum.textContent = num;
    this.el.inningHalf.textContent = half === "top" ? "▲" : "▼";
  }

  count(b, s, o) {
    this.el.balls.textContent = b;
    this.el.strikes.textContent = s;
    this.el.outs.textContent = o;
  }

  bases([first, second, third]) {
    this.el.base1.classList.toggle("on", !!first);
    this.el.base2.classList.toggle("on", !!second);
    this.el.base3.classList.toggle("on", !!third);
  }

  turbo(frac, onFire) {
    this.el.turboFill.style.width = Math.round(frac * 100) + "%";
    this.el.turboWrap.classList.toggle("onfire", !!onFire);
  }

  charge(frac, color) {
    if (frac <= 0) {
      this.el.chargeWrap.classList.add("hidden");
      return;
    }
    this.el.chargeWrap.classList.remove("hidden");
    this.el.chargeFill.style.width = Math.round(frac * 100) + "%";
  }

  announce(text, fire = false) {
    const e = this.el.announce;
    e.textContent = text;
    e.style.color = fire ? "#ffc107" : "#fff";
    e.classList.remove("show");
    // force reflow so the animation restarts
    void e.offsetWidth;
    e.classList.add("show");
  }

  prompt(text) {
    const e = this.el.prompt;
    if (!text) {
      e.classList.remove("show");
      return;
    }
    e.textContent = text;
    e.classList.add("show");
  }
}
