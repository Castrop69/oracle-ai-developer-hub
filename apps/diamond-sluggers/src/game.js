// game.js — the simulation: a full 9-inning arcade baseball game.
//
// Half-inning roles:
//   top    -> AWAY (AI) bats, HOME (human) pitches & fields
//   bottom -> HOME (human) bats, AWAY (AI) pitches & fields
//
// The human always plays the home team. Pitching and batting are fully
// interactive (the fun core); fielding adds a timed DIVE input and base
// running adds a turbo "take the extra base" gamble.

import * as THREE from "three";
import {
  BASES,
  BASE_PATH,
  MOUND,
  FENCE_RADIUS,
  FENCE_HEIGHT,
  PHYS,
  ZONE,
  INNINGS,
} from "./constants.js";

const PITCHES = {
  cross: { name: "FASTBALL", speed: 1.0, break: 0.0, color: 0xff5252 },
  square: { name: "CURVE", speed: 0.78, break: 1.0, color: 0x4fc3f7 },
  triangle: { name: "CHANGEUP", speed: 0.62, break: 0.3, color: 0x9ccc65 },
  circle: { name: "SCREWBALL", speed: 0.82, break: -1.0, color: 0xba68c8 },
};

// Difficulty presets. They tune the AI on both sides plus how forgiving the
// human's batting window and the fielders are.
//   aiWild       — spread of AI pitch locations vs. you (higher = more balls)
//   aiVelo       — AI pitch velocity floor when pitching to you
//   aiSwingProb  — per-frame chance the AI hitter swings at a strike
//   aiAimNoise   — AI hitter's contact error (higher = weaker contact)
//   fielderSpeed — how fast fielders converge on the ball
//   batWindow    — multiplier on the human's swing-timing window
export const DIFFICULTY = {
  rookie: {
    label: "ROOKIE",
    aiWild: 1.7,
    aiVelo: 0.4,
    aiSwingProb: 0.1,
    aiAimNoise: 0.75,
    fielderSpeed: 10.5,
    batWindow: 1.35,
  },
  pro: {
    label: "PRO",
    aiWild: 1.1,
    aiVelo: 0.6,
    aiSwingProb: 0.18,
    aiAimNoise: 0.5,
    fielderSpeed: 13,
    batWindow: 1.1,
  },
  legend: {
    label: "LEGEND",
    aiWild: 0.55,
    aiVelo: 0.82,
    aiSwingProb: 0.28,
    aiAimNoise: 0.3,
    fielderSpeed: 15,
    batWindow: 0.92,
  },
};

const tmp = new THREE.Vector3();

export class Game {
  constructor(world, input, audio, ui) {
    this.world = world;
    this.input = input;
    this.audio = audio;
    this.ui = ui;

    this.state = "IDLE";
    this.timer = 0;
    this.paused = false;

    // Difficulty (set from the menu before start()).
    this.difficulty = "pro";
    this.D = DIFFICULTY.pro;

    // Score & situation.
    this.score = { away: 0, home: 0 };
    this.inning = 1;
    this.half = "top"; // 'top' | 'bottom'
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.bases = [null, null, null]; // runner objects on 1st/2nd/3rd
    this.gameOver = false;

    // Turbo / ON FIRE meter.
    this.turbo = 0;
    this.onFire = false;
    this._selectedPitch = "cross";

    // Pitch in progress.
    this.pitch = null;

    // Build figures.
    this.batter = world.makePlayer("home", "batter");
    this.pitcher = world.makePlayer("away", "pitcher");
    world.scene.add(this.batter);
    world.scene.add(this.pitcher);

    this.fielders = this._buildFielders();
    this.runners = []; // active baserunner meshes mid-animation

    this._resetForPitch();
  }

  // ---- setup helpers -------------------------------------------------------
  _buildFielders() {
    // Defensive positions (the fielding team). Indexed for catch logic.
    const spots = {
      P: MOUND.clone(),
      C: new THREE.Vector3(0, 0, 2.2),
      "1B": new THREE.Vector3(16, 0, -16),
      "2B": new THREE.Vector3(7, 0, -26),
      SS: new THREE.Vector3(-7, 0, -26),
      "3B": new THREE.Vector3(-16, 0, -16),
      LF: new THREE.Vector3(-34, 0, -58),
      CF: new THREE.Vector3(0, 0, -70),
      RF: new THREE.Vector3(34, 0, -58),
    };
    const arr = [];
    for (const [pos, p] of Object.entries(spots)) {
      const mesh = this.world.makePlayer("away", "fielder");
      mesh.position.copy(p);
      mesh.userData.home = p.clone();
      mesh.userData.pos = pos;
      this.world.scene.add(mesh);
      arr.push(mesh);
    }
    return arr;
  }

  setDifficulty(name) {
    if (DIFFICULTY[name]) {
      this.difficulty = name;
      this.D = DIFFICULTY[name];
    }
  }

  start() {
    this._recolorForHalf(); // top of 1st: away bats, home fields
    this.state = "READY";
    this.timer = 0.8;
    this._announce(`${this.half === "top" ? "TOP" : "BOTTOM"} 1`, 1.2);
    this.updateHUD();
  }

  // Full reset to a fresh game without reloading the page. Reuses the existing
  // batter/pitcher/fielder meshes; only the transient runners are despawned.
  reset() {
    for (const r of this.runners) this.world.scene.remove(r.mesh);
    this.runners = [];
    this.bases = [null, null, null];
    this.score = { away: 0, home: 0 };
    this.inning = 1;
    this.half = "top";
    this.outs = 0;
    this.balls = 0;
    this.strikes = 0;
    this.gameOver = false;
    this.paused = false;
    this.turbo = 0;
    this.onFire = false;
    this.world.setBloom(0.5);
    this._returnFielders();
    this._resetForPitch();
    this.ui.prompt("");
    this.start();
  }

  // Position batter/pitcher and reset the pitch.
  _resetForPitch() {
    this.batter.position.set(-1.2, 0, 1.4);
    this.batter.rotation.y = 0.2;
    this.pitcher.position.copy(MOUND).setY(0);
    this.pitch = null;
    this.swing = null;
    this.world.ball.position.copy(MOUND).setY(1.8);
    this.world.setBallTrail(false);
    this.charge = 0;
    this.aimX = 0;
    this.aimY = 1.15;
  }

  get humanBatting() {
    return this.half === "bottom";
  }
  get humanFielding() {
    return this.half === "top";
  }
  // Whose runs accrue this half:
  get battingTeam() {
    return this.half === "top" ? "away" : "home";
  }

  // ========================================================================
  // MAIN UPDATE
  // ========================================================================
  update(dt) {
    if (this.gameOver) {
      this._updateRunners(dt);
      return;
    }
    switch (this.state) {
      case "READY":
        this._updateReady(dt);
        break;
      case "WINDUP":
        this._updateWindup(dt);
        break;
      case "PITCH":
        this._updatePitch(dt);
        break;
      case "INPLAY":
        this._updateInPlay(dt);
        break;
      case "RESULT":
        this._updateResult(dt);
        break;
    }
    this._updateRunners(dt);
    this._updateTurboUI();
  }

  // ---- READY: brief pause, then go to windup ------------------------------
  _updateReady(dt) {
    this.timer -= dt;
    this.world.setCamera(this.humanBatting ? "bat" : "pitch");
    if (this.timer <= 0) {
      this.state = "WINDUP";
      this.timer = 0;
      if (this.humanFielding) {
        this.ui.prompt(
          "Aim: L-Stick · Pitch: ✕□△○ · Hold R2 to charge, release to throw",
        );
      } else {
        // AI windup before delivering to the human hitter.
        this.timer = 0.9;
        this.ui.prompt("Hold R2 = Turbo · ✕ Contact swing · □ Power swing");
      }
    }
  }

  // ---- WINDUP: choose & release the pitch ---------------------------------
  _updateWindup(dt) {
    if (this.humanFielding) {
      // Human pitches.
      const i = this.input;
      this.aimX += i.lx * dt * 1.4;
      this.aimY -= i.ly * dt * 1.0;
      this.aimX = clamp(this.aimX, -ZONE.halfWidth - 0.3, ZONE.halfWidth + 0.3);
      this.aimY = clamp(this.aimY, ZONE.bottom - 0.2, ZONE.top + 0.2);

      let type = this._selectedPitch;
      for (const k of ["cross", "square", "triangle", "circle"]) {
        if (i.pressed(k)) {
          type = k;
          this.audio.uiSelect();
        }
      }
      this._selectedPitch = type || "cross";

      // Charge while R2 held.
      if (i.held("r2")) this.charge = Math.min(1, this.charge + dt * 0.9);
      this.ui.charge(this.charge, PITCHES[this._selectedPitch].color);

      if (i.released("r2") || (i.rt < 0.1 && this.charge > 0.05)) {
        this._releasePitch(this._selectedPitch, 0.45 + this.charge * 0.55);
      }
      // Pitcher arm wind-up pose.
      this.world.animPitchCharge(this.pitcher, this.charge);
    } else {
      // AI pitches to the human after a short windup.
      this.timer -= dt;
      if (this.timer <= 0) {
        const keys = ["cross", "square", "triangle", "circle"];
        const type = keys[(Math.random() * keys.length) | 0];
        // Aim spread and velocity scale with difficulty.
        this.aimX = (Math.random() - 0.5) * ZONE.halfWidth * 2 * this.D.aiWild;
        this.aimY = ZONE.bottom + Math.random() * (ZONE.top - ZONE.bottom);
        this._releasePitch(type, this.D.aiVelo + Math.random() * 0.3);
      }
    }
  }

  _releasePitch(type, power) {
    const p = PITCHES[type];
    this.audio.pitchThrow();
    this.input.rumble(0.2, 0.1, 90);
    this.ui.charge(0);
    this.pitch = {
      type,
      def: p,
      power,
      plateX: this.aimX,
      plateY: this.aimY,
      t: 0,
      speed: 7 + power * 7 * p.speed, // m/s along flight
      flightLen: 0,
      contacted: false,
    };
    this.world.ball.material.emissive.setHex(p.color);
    this.world.ball.material.color.setHex(0xffffff);
    this.world.setBallTrail(true);
    this.world.setCamera(this.humanBatting ? "bat" : "pitch");
    this.world.animPitchRelease(this.pitcher);
    this.state = "PITCH";
    this.swingMade = false;
  }

  // ---- PITCH: ball travels to the plate; offense times a swing ------------
  _updatePitch(dt) {
    const p = this.pitch;
    const ball = this.world.ball;

    // Advance flight parameter t in [0..1.25] (past the plate).
    const total = (MOUND.z - 3.5) / -p.speed; // seconds to travel start->end (negative dz)
    p.t += dt / Math.abs(total);
    const t = p.t;

    // Linear path mound -> just behind plate, with a break that grows late.
    const z = THREE.MathUtils.lerp(MOUND.z, 3.5, Math.min(t, 1.25));
    const breakAmt = p.def.break * 1.1 * t * t; // curve bends late
    const dropExtra = (1 - p.def.speed) * 1.2 * t * t; // slow stuff sinks
    const x = THREE.MathUtils.lerp(0, p.plateX + breakAmt, Math.min(t, 1));
    const y =
      THREE.MathUtils.lerp(1.8, p.plateY - dropExtra, Math.min(t, 1)) -
      0.0 +
      Math.sin(Math.min(t, 1) * Math.PI) * 0.15;
    ball.position.set(x, Math.max(0.1, y), z);
    this.world.pushTrail();

    // Swing input (offense).
    const i = this.input;
    if (this.humanBatting && !this.swingMade) {
      // Aim the bat with the stick.
      this.aimX += i.lx * dt * 2.2;
      this.aimY -= i.ly * dt * 1.6;
      this.aimX = clamp(this.aimX, -1.4, 1.4);
      this.aimY = clamp(this.aimY, 0.3, 2.2);
      const turbo = i.held("r2") || this.onFire;
      if (i.pressed("cross")) this._attemptSwing("contact", turbo);
      else if (i.pressed("square")) this._attemptSwing("power", turbo);
    } else if (this.humanFielding && !this.swingMade) {
      // AI batter decides to swing near the plate.
      if (z > -1.2 && z < 1.6) {
        const inZone =
          Math.abs(p.plateX) < ZONE.halfWidth + 0.2 &&
          p.plateY > ZONE.bottom &&
          p.plateY < ZONE.top;
        if (inZone && Math.random() < this.D.aiSwingProb) {
          const n = this.D.aiAimNoise;
          this.aimX = p.plateX + (Math.random() - 0.5) * n;
          this.aimY = p.plateY + (Math.random() - 0.5) * n * 0.8;
          this._attemptSwing(Math.random() < 0.5 ? "power" : "contact", false);
        }
      }
    }

    // Ball passes the plate without contact -> ball or called strike.
    if (z >= 1.6 && !p.contacted) {
      this._resolveTakenPitch(p);
    }
  }

  _attemptSwing(kind, turbo) {
    const p = this.pitch;
    const ball = this.world.ball;
    this.swingMade = true;
    this._swingAnim(kind);

    // Timing: ideal contact when ball is just in front of the plate (z≈0.6).
    const idealZ = 0.6;
    const timingErr = Math.abs(ball.position.z - idealZ);
    // The human's window widens/narrows with difficulty; the AI hitter always
    // uses the baseline so difficulty only affects the player's leniency.
    const winScale = this.humanBatting ? this.D.batWindow : 1;
    const timingWindow = (kind === "power" ? 0.9 : 1.2) * winScale;
    const timingQ = clamp(1 - timingErr / timingWindow, 0, 1);

    // Plate coverage: how close the bat aim is to the actual ball location.
    const aimMiss = Math.hypot(this.aimX - ball.position.x, this.aimY - ball.position.y);
    const reach = kind === "power" ? 0.85 : 1.05;
    const aimQ = clamp(1 - aimMiss / reach, 0, 1);

    const quality = timingQ * aimQ;

    if (quality < 0.22) {
      // Whiff.
      this.audio.swingMiss();
      this._countStrike(true);
      return;
    }

    p.contacted = true;
    this._launchHit(kind, quality, turbo, ball.position.z, this.aimX);
  }

  // Convert a contact into a batted-ball velocity and go to INPLAY.
  _launchHit(kind, quality, turbo, contactZ, aimX) {
    const ball = this.world.ball;
    const fire = this.onFire ? 1.35 : 1;

    // Spray: early contact (ball still far, z<0.6) pulls; late pushes oppo.
    // Home team (human) bats toward -Z; pull goes to the stick-aim side.
    const timingSpray = (0.6 - contactZ) * 0.5; // +pull / -oppo
    const sprayAngle = clamp(aimX * 0.5 + timingSpray, -1.0, 1.0); // radians-ish

    // Launch angle from swing type + vertical aim.
    let launch =
      kind === "power"
        ? THREE.MathUtils.degToRad(28 + (this.aimY - 1.0) * 18)
        : THREE.MathUtils.degToRad(12 + (this.aimY - 1.0) * 14);
    launch = clamp(launch, THREE.MathUtils.degToRad(2), THREE.MathUtils.degToRad(55));

    // Exit speed. A well-timed power swing should reach the fence; a perfect
    // one (or any swing while ON FIRE) clears it for a home run.
    const base = kind === "power" ? 45 : 31;
    const speed = base * (0.55 + quality * 0.65) * fire;

    const dirH = new THREE.Vector3(Math.sin(sprayAngle), 0, -Math.cos(sprayAngle));
    const vel = new THREE.Vector3(
      dirH.x * speed * Math.cos(launch),
      speed * Math.sin(launch),
      dirH.z * speed * Math.cos(launch),
    );

    this.battedVel = vel;
    this.battedPower = quality;
    this.audio.batCrack(quality * fire);
    this.input.rumble(0.6 * quality * fire, 0.4, 200);
    this.world.ball.material.color.setHex(this.onFire ? 0xff7043 : 0xffffff);
    if (this.onFire) this.world.ball.material.emissive.setHex(0xff5722);

    // Turbo/contact builds the meter; great contact builds more.
    this._addTurbo(0.12 + quality * 0.12);

    // Predict landing so fielders can converge.
    this.predicted = this._simulateLanding(ball.position.clone(), vel.clone());
    this.takeExtra = turbo && this.humanBatting;

    this.state = "INPLAY";
    this.timer = 0;
    this.diveUsed = false;
    this.greatCatch = false;
    this.world.setCamera("field");
    this._announce(quality > 0.85 ? "CRUSHED!" : "IT'S A HIT!", 0.9, quality > 0.85);
  }

  // Forward-integrate a projectile to find where/when it lands.
  _simulateLanding(pos, vel) {
    const p = pos.clone();
    const v = vel.clone();
    const dt = 1 / 60;
    let time = 0;
    let apex = p.y;
    let crossedFence = false;
    let fenceHeight = 0;
    for (let i = 0; i < 600; i++) {
      v.y -= PHYS.gravity * dt;
      v.multiplyScalar(1 - PHYS.drag);
      p.addScaledVector(v, dt);
      time += dt;
      apex = Math.max(apex, p.y);
      const r = Math.hypot(p.x, p.z);
      if (!crossedFence && r >= FENCE_RADIUS) {
        crossedFence = true;
        fenceHeight = p.y;
      }
      if (p.y <= 0.1) break;
    }
    return { point: p.clone().setY(0), time, apex, crossedFence, fenceHeight };
  }

  // ---- INPLAY: animate the batted ball, fielders converge, resolve --------
  _updateInPlay(dt) {
    const ball = this.world.ball;
    const v = this.battedVel;

    // Integrate ball physics.
    v.y -= PHYS.gravity * dt;
    v.multiplyScalar(1 - PHYS.drag);
    ball.position.addScaledVector(v, dt);
    this.world.pushTrail();

    // Bounce off the ground (until it settles), so grounders look right.
    if (ball.position.y < 0.22 && v.y < 0) {
      ball.position.y = 0.22;
      v.y = -v.y * PHYS.restitution;
      v.x *= 0.7;
      v.z *= 0.7;
      this.audio.catchBall();
    }

    // Move the nearest fielder toward the predicted landing spot.
    const target = this.predicted.point;
    const fielder = this._nearestFielder(target);
    const toT = tmp.copy(target).sub(fielder.position);
    toT.y = 0;
    const fdist = toT.length();
    const fspeed = this.D.fielderSpeed;
    if (fdist > 0.3) {
      fielder.position.addScaledVector(toT.normalize(), Math.min(fspeed * dt, fdist));
      fielder.lookAt(target.x, 0, target.z);
    }

    // Human DIVE/leap to rob a hit (or a homer at the wall).
    const ballR = Math.hypot(ball.position.x, ball.position.z);
    const nearFielder = fielder.position.distanceTo(ball.position);
    if (
      this.humanFielding &&
      !this.diveUsed &&
      nearFielder < 6 &&
      ball.position.y < 6
    ) {
      this.ui.prompt("✕ DIVE / LEAP!");
      if (this.input.pressed("cross")) {
        this.diveUsed = true;
        // Robbery succeeds if reasonably close & timed.
        if (nearFielder < 4.2 && ball.position.y < 4.6) {
          this.greatCatch = true;
        }
        this._swingAnimFielder(fielder);
      }
    }

    // HOME RUN: ball clears the fence in the air.
    if (
      this.predicted.crossedFence &&
      this.predicted.fenceHeight > FENCE_HEIGHT &&
      !this.greatCatch
    ) {
      if (ballR >= FENCE_RADIUS - 1) {
        this.ui.prompt("");
        return this._resolveHomeRun();
      }
    }

    // Caught on the fly: fielder reaches ball while it's still airborne.
    const isFly = this.predicted.apex > 5.5;
    if (
      (this.greatCatch ||
        (isFly && nearFielder < 2.2 && ball.position.y > 0.3 && ball.position.y < 6)) &&
      this._fair(ball.position)
    ) {
      this.ui.prompt("");
      return this._resolveCatch();
    }

    // Ball has settled or reached the fielder on the ground -> resolve.
    const settled =
      (Math.abs(v.x) + Math.abs(v.z) < 4 && ball.position.y <= 0.25) ||
      (nearFielder < 1.6 && ball.position.y <= 0.3);
    if (settled || ballR > FENCE_RADIUS + 2) {
      this.ui.prompt("");
      if (!this._fair(ball.position)) return this._resolveFoul();
      return this._resolveGroundball(ballR);
    }
  }

  _nearestFielder(point) {
    let best = this.fielders[0];
    let bd = Infinity;
    for (const f of this.fielders) {
      const d = f.position.distanceTo(point);
      if (d < bd) {
        bd = d;
        best = f;
      }
    }
    return best;
  }

  // Fair territory = within the 90° wedge opening toward -Z.
  _fair(pos) {
    if (pos.z > 0.5) return false; // behind the plate
    return Math.abs(pos.x) <= -pos.z + 0.5;
  }

  // ---- play resolutions ----------------------------------------------------
  _resolveHomeRun() {
    const runs = 1 + this.bases.filter(Boolean).length;
    this._clearBasesScore(runs);
    this.audio.cheer(0.3, 2200);
    this.audio.fire();
    this.input.rumble(0.9, 0.7, 500);
    this._addTurbo(0.3);
    const tag = this.battedPower > 0.85 ? "MOONSHOT!\nHOME RUN" : "HOME RUN!";
    this._announce(tag, 1.8, true);
    this._endPlay(2.0);
  }

  _resolveCatch() {
    this.audio.catchBall();
    this.audio.cheer(0.18, 900);
    this._announce(this.greatCatch ? "ROBBED! WHAT A CATCH!" : "OUT!", 1.3, this.greatCatch);
    this.input.rumble(0.3, 0.2, 150);
    this._recordOut();
    this._endPlay(1.4);
  }

  _resolveFoul() {
    this._announce("FOUL BALL", 1.0);
    // Foul is a strike unless already two strikes.
    if (this.strikes < 2) this.strikes++;
    this.updateHUD();
    this._endPlay(1.0, /*samePitch*/ true);
  }

  _resolveGroundball(ballR) {
    // Depth of the ball determines the hit. Fielder proximity can make an out
    // on shallow balls (infield throw to first).
    const fielder = this._nearestFielder(this.predicted.point);
    const infield = ballR < 30;
    let bases;
    if (infield && Math.random() < 0.5 && this.battedPower < 0.7) {
      // Routine grounder -> out at first.
      this._announce("GROUND OUT", 1.2);
      this.audio.catchBall();
      this._recordOut();
      return this._endPlay(1.3);
    }
    if (ballR > FENCE_RADIUS - 12) bases = 3;
    else if (ballR > 60) bases = 2;
    else bases = 1;

    // Turbo gamble: try to stretch for one more base.
    let thrownOut = false;
    if (this.takeExtra) {
      if (Math.random() < 0.55) bases += 1;
      else thrownOut = true;
    }

    this._hit(bases);
    const label =
      ["", "SINGLE!", "DOUBLE!", "TRIPLE!", "INSIDE-THE-PARK!"][Math.min(bases, 4)] ||
      "BASE HIT!";
    this._announce(label, 1.3, bases >= 3);
    this.audio.cheer(0.16 + bases * 0.03, 1000);
    if (thrownOut) {
      this._announce(label + "\n…but OUT stretching!", 1.6);
      this._recordOut();
    }
    this._endPlay(1.5);
  }

  // ---- scoring / outs / runners -------------------------------------------
  // `this.runners` is the single source of truth for every runner mesh on the
  // field. `this.bases[i]` just *references* the runner parked on that base.
  // A runner is registered once (in _makeRunner) and removed only when it
  // scores or the half-inning ends.
  //
  // Standard arcade advancement: all runners move up `bases`, batter included.
  _hit(bases) {
    // Snapshot existing runners with the base they're starting from.
    const occupied = []; // {runner, from}
    for (let i = 0; i < 3; i++) {
      if (this.bases[i]) occupied.push({ runner: this.bases[i], from: i + 1 });
      this.bases[i] = null;
    }
    // Batter-runner starts at home (path index 0). Created/registered once.
    occupied.push({ runner: this._makeRunner(), from: 0 });

    let runsScored = 0;
    for (const o of occupied) {
      const dest = o.from + bases; // path index: home(0)->1->2->3->home(4)
      if (dest >= 4) {
        runsScored++;
        o.runner.target = 4; // animate to home, then despawn
        o.runner.scored = true;
      } else {
        this.bases[dest - 1] = o.runner;
        o.runner.target = dest;
      }
    }
    this._score(runsScored);
    this.updateHUD();
  }

  _clearBasesScore(runs) {
    // Home run: send everyone home with a victory lap animation.
    for (let i = 0; i < 3; i++) {
      if (this.bases[i]) {
        this.bases[i].target = 4;
        this.bases[i].scored = true;
      }
      this.bases[i] = null;
    }
    const r = this._makeRunner(); // batter
    r.target = 4;
    r.scored = true;
    this._score(runs);
    this.updateHUD();
  }

  // Create, register, and return a new runner parked at home.
  _makeRunner() {
    const team = this.battingTeam;
    const mesh = this.world.makePlayer(team, "runner");
    mesh.position.copy(BASES.home);
    this.world.scene.add(mesh);
    const r = { mesh, base: 0, target: 0, t: 0, scored: false };
    this.runners.push(r);
    return r;
  }

  _updateRunners(dt) {
    for (let n = this.runners.length - 1; n >= 0; n--) {
      const r = this.runners[n];
      if (r.base === r.target) {
        if (r.scored && r.base >= 4) {
          this.world.scene.remove(r.mesh);
          this.runners.splice(n, 1);
        }
        continue;
      }
      // Animate toward the next base in the path.
      r.t += dt * 2.6;
      const fromP = BASE_PATH[r.base % 4].clone();
      // home appears again at index 4
      const toIdx = r.base + 1;
      const toP =
        toIdx >= 4 ? BASES.home.clone() : BASE_PATH[toIdx % 4].clone();
      r.mesh.position.lerpVectors(fromP, toP, Math.min(r.t, 1));
      r.mesh.lookAt(toP.x, 0, toP.z);
      if (r.t >= 1) {
        r.t = 0;
        r.base = toIdx;
      }
    }
  }

  _score(runs) {
    if (runs <= 0) return;
    this.score[this.battingTeam] += runs;
  }

  _countStrike(swinging) {
    this.strikes++;
    this.updateHUD();
    if (this.strikes >= 3) {
      this._announce(swinging ? "STRIKE OUT!" : "CALLED OUT!", 1.2);
      this._recordOut();
      this._endPlay(1.2);
    } else {
      this._endPlay(0.6, true);
    }
  }

  _resolveTakenPitch(p) {
    const inZone =
      Math.abs(p.plateX) <= ZONE.halfWidth &&
      p.plateY >= ZONE.bottom &&
      p.plateY <= ZONE.top;
    if (inZone) {
      this._announce("STRIKE", 0.7);
      this._countStrike(false);
    } else {
      this.balls++;
      this._announce("BALL", 0.6);
      this.updateHUD();
      if (this.balls >= 4) {
        this._announce("WALK", 1.0);
        this._walk();
        this._endPlay(1.0);
      } else {
        this._endPlay(0.5, true);
      }
    }
  }

  _walk() {
    // Batter takes first; trailing runners only advance when forced.
    const r = this._makeRunner();
    const park = (runner, baseIdx) => {
      // baseIdx: 1=first, 2=second, 3=third. Park (no walking animation).
      runner.base = baseIdx;
      runner.target = baseIdx;
      runner.t = 0;
      runner.mesh.position.copy(
        baseIdx === 1 ? BASES.first : baseIdx === 2 ? BASES.second : BASES.third,
      );
    };

    if (!this.bases[0]) {
      this.bases[0] = r;
      park(r, 1);
    } else if (!this.bases[1]) {
      this.bases[1] = this.bases[0];
      park(this.bases[1], 2);
      this.bases[0] = r;
      park(r, 1);
    } else if (!this.bases[2]) {
      this.bases[2] = this.bases[1];
      park(this.bases[2], 3);
      this.bases[1] = this.bases[0];
      park(this.bases[1], 2);
      this.bases[0] = r;
      park(r, 1);
    } else {
      // Bases loaded -> force in a run.
      this.bases[2].target = 4;
      this.bases[2].scored = true;
      this.bases[2] = this.bases[1];
      park(this.bases[2], 3);
      this.bases[1] = this.bases[0];
      park(this.bases[1], 2);
      this.bases[0] = r;
      park(r, 1);
      this._score(1);
    }
    this.updateHUD();
  }

  _recordOut() {
    this.outs++;
    this.updateHUD();
  }

  // ---- RESULT: pause, then either next batter or change sides -------------
  _endPlay(pause, samePitch = false) {
    this.state = "RESULT";
    this.timer = pause;
    this._nextSamePitch = samePitch;
  }

  _updateResult(dt) {
    this.timer -= dt;
    if (this.timer > 0) return;

    if (this._nextSamePitch && this.outs < 3) {
      // Same batter, new pitch (after ball/foul/strike that didn't end PA).
      this.pitch = null;
      this.swingMade = false;
      this.world.ball.position.copy(MOUND).setY(1.8);
      this.world.setBallTrail(false);
      this.charge = 0;
      this.state = "READY";
      this.timer = 0.4;
      this.world.setCamera(this.humanBatting ? "bat" : "pitch");
      return;
    }

    // New batter (reset count) or change sides on the 3rd out.
    this.balls = 0;
    this.strikes = 0;

    if (this.outs >= 3) {
      this._changeSides();
      if (this.gameOver) return;
    }

    this._resetForPitch();
    this._returnFielders();
    this.state = "READY";
    this.timer = 0.5;
    this.updateHUD();
  }

  _returnFielders() {
    for (const f of this.fielders) {
      f.position.copy(f.userData.home);
      this.world.animResetArms(f);
    }
  }

  _changeSides() {
    this.outs = 0;
    this.bases = [null, null, null];
    // Despawn any lingering runners.
    for (const r of this.runners) this.world.scene.remove(r.mesh);
    this.runners = [];

    if (this.half === "top") {
      this.half = "bottom";
    } else {
      this.half = "top";
      this.inning++;
    }

    // Recolor batter/pitcher/fielders for the new sides.
    this._recolorForHalf();

    // Game-over checks.
    if (this._checkGameOver()) return;

    this._announce(
      `${this.half === "top" ? "TOP" : "BOTTOM"} ${this.inning}`,
      1.3,
    );
  }

  _recolorForHalf() {
    // Fielding team color = defense; batter = offense. Rebuild simply by
    // swapping which team each figure represents.
    const fieldTeam = this.half === "top" ? "home" : "away";
    const batTeam = this.battingTeam;
    this._retint(this.batter, batTeam);
    this._retint(this.pitcher, fieldTeam);
    for (const f of this.fielders) this._retint(f, fieldTeam);
  }

  _retint(group, team) {
    // makePlayer registers the team-colored materials (jersey + cap) on
    // userData.tint, so swapping sides is a direct color set.
    const color = team === "home" ? 0xff5722 : 0x4fc3f7;
    const mats = (group.userData && group.userData.tint) || [];
    for (const m of mats) m.color.setHex(color);
  }

  _checkGameOver() {
    // Home wins immediately if ahead after the top of the 9th+.
    if (
      this.inning >= INNINGS &&
      this.half === "bottom" &&
      this.score.home > this.score.away
    ) {
      return this._finish();
    }
    // Game ends after the bottom of the 9th (or later) unless tied.
    if (this.inning > INNINGS && this.half === "top") {
      if (this.score.home !== this.score.away) return this._finish();
    }
    if (this.inning > INNINGS + 4) return this._finish(); // safety cap
    return false;
  }

  _finish() {
    this.gameOver = true;
    const h = this.score.home;
    const a = this.score.away;
    const msg =
      h > a ? "HOME TEAM WINS!" : a > h ? "AWAY TEAM WINS!" : "TIE GAME";
    this._announce(`FINAL\n${a} — ${h}\n${msg}`, 6, h >= a);
    this.audio.cheer(0.32, 4000);
    this.audio.fire();
    this.ui.prompt("Options / Esc to play again");
    return true;
  }

  // ---- Turbo / ON FIRE -----------------------------------------------------
  _addTurbo(amt) {
    this.turbo = clamp((this.turbo || 0) + amt, 0, 1);
    if (this.turbo >= 1 && !this.onFire) {
      this.onFire = true;
      this.audio.fire();
      this._announce("ON FIRE!", 1.2, true);
      this.world.setBloom(1.2);
    }
  }

  _updateTurboUI() {
    // Turbo slowly drains while ON FIRE.
    if (this.onFire) {
      this.turbo = (this.turbo || 0) - 0.05 * (1 / 60);
      if (this.turbo <= 0) {
        this.onFire = false;
        this.world.setBloom(0.55);
      }
    }
    this.ui.turbo(this.turbo || 0, this.onFire);
  }

  // ---- animation helpers ---------------------------------------------------
  _swingAnim(kind) {
    this.world.animSwing(this.batter, kind);
  }
  _swingAnimFielder(f) {
    this.world.animDive(f);
  }

  // ---- HUD / announcements -------------------------------------------------
  _announce(text, secs, fire = false) {
    this.ui.announce(text, fire);
  }

  updateHUD() {
    this.ui.score(this.score.away, this.score.home);
    this.ui.inning(this.inning, this.half);
    this.ui.count(this.balls, this.strikes, this.outs);
    this.ui.bases(this.bases.map(Boolean));
  }
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}
