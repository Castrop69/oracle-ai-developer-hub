// world.js — builds and renders the 3D scene. Visual target: The Bigs / MLB
// Slugfest broadcast look — low over-the-shoulder batting camera, strike-zone
// box + aim reticle at the plate, saturated grass painted as one hi-res
// texture, a towering ad-covered outfield wall with stands and crowd above it,
// dusk lighting with stadium lights and bloom.

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  BASES,
  FENCE_RADIUS,
  MOUND,
  TEAMS,
  ZONE,
} from "./constants.js";

const WALL_H = 7; // big green-monster style wall

export class World {
  constructor(canvas, assets = null) {
    this.assets = assets;
    this.mixers = [];

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x8795a8, 220, 520);

    this.camera = new THREE.PerspectiveCamera(
      50,
      innerWidth / innerHeight,
      0.1,
      1200,
    );
    this._setCam("bat");

    this._buildAssets();
    this._buildLights();
    this._buildSky();
    if (!(this.assets && this.assets.replaceStadium)) {
      this._buildField();
      this._buildStadium();
    }
    if (this.assets && this.assets.stadium) this.scene.add(this.assets.stadium);
    this.ball = this._buildBall();
    this._buildAimUI();

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.45,
      0.6,
      0.85,
    );
    this.composer.addPass(this.bloom);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  // =========================================================================
  // Shared materials / small textures
  // =========================================================================
  _buildAssets() {
    this._skinMat = new THREE.MeshStandardMaterial({
      color: 0xd9a377,
      roughness: 0.75,
    });
    // Gray uniform like a classic away kit — team color goes on cap/helmet,
    // sleeves and socks so retinting stays easy.
    this._uniMat = new THREE.MeshStandardMaterial({
      color: 0xc9cacd,
      roughness: 0.85,
    });
    this._shoeMat = new THREE.MeshStandardMaterial({
      color: 0x15181e,
      roughness: 0.5,
    });
    this._beltMat = new THREE.MeshStandardMaterial({ color: 0x14161a });
  }

  _canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h || w;
    return c;
  }

  // =========================================================================
  // Camera presets — the batting cam is the money shot: low, over the
  // batter's shoulder, batter large in the left foreground (The Bigs).
  // =========================================================================
  _setCam(mode) {
    this.camMode = mode;
    if (mode === "bat") {
      // Essentially the umpire's eyes: just in front of the catcher, batter
      // large in the left foreground, zone + pitcher centered.
      this._camTarget = {
        pos: new THREE.Vector3(2.55, 2.05, 5.3),
        look: new THREE.Vector3(-1.15, 1.25, -16),
      };
    } else if (mode === "field") {
      this._camTarget = {
        pos: new THREE.Vector3(0, 30, 26),
        look: new THREE.Vector3(0, 0, -30),
      };
    } else if (mode === "pitch") {
      // Human pitching: classic center-field broadcast angle — behind and
      // above the mound, pitcher foreground, zone + catcher at the plate.
      this._camTarget = {
        pos: new THREE.Vector3(0.8, 3.6, -29.5),
        look: new THREE.Vector3(0, 1.15, 1.5),
      };
    }
    if (!this._camPos) {
      this._camPos = this._camTarget.pos.clone();
      this._camLook = this._camTarget.look.clone();
    }
  }

  setCamera(mode) {
    if (mode !== this.camMode) this._setCam(mode);
  }

  // =========================================================================
  // Lighting — dusk game under the lights: soft cool ambient, warm key.
  // =========================================================================
  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xbdd0e8, 0x2c5230, 0.85));

    const key = new THREE.DirectionalLight(0xffe8c4, 1.9);
    key.position.set(-45, 70, 40);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = 60;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.camera.far = 300;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xaec4e8, 0.55);
    fill.position.set(50, 50, -30);
    this.scene.add(fill);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(600, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x46608c) },
        bottom: { value: new THREE.Color(0x93a5bd) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.05,0.75,h)),1.0);} `,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  // =========================================================================
  // FIELD — the entire playing surface is painted into ONE 2048px canvas
  // texture: mowing arcs, dirt infield ring, basepaths, warning track, chalk
  // foul lines, batter's boxes. World->canvas: home plate at the center,
  // canvas-up = -Z (toward the outfield).
  // =========================================================================
  _buildField() {
    const R = 135; // half-size of the ground plane in meters
    const S = 2048;
    const c = this._canvas(S);
    const x = c.getContext("2d");
    const k = S / (2 * R);
    const P = (wx, wz) => [(wx + R) * k, (wz + R) * k];
    const M = (m) => m * k; // meters -> pixels

    // --- grass base + concentric mowing arcs centered on home ---
    x.fillStyle = "#2c7a33";
    x.fillRect(0, 0, S, S);
    const [hx, hz] = P(0, 0);
    for (let i = 0; i < 22; i++) {
      if (i % 2) continue;
      x.beginPath();
      x.arc(hx, hz, M(6 + i * 6), 0, Math.PI * 2);
      x.arc(hx, hz, M(i * 6), 0, Math.PI * 2, true);
      x.fillStyle = "#35913d";
      x.fill("evenodd");
    }

    // --- warning track ring just inside the wall ---
    x.beginPath();
    x.arc(hx, hz, M(FENCE_RADIUS + 10), 0, Math.PI * 2);
    x.arc(hx, hz, M(FENCE_RADIUS - 4.5), 0, Math.PI * 2, true);
    x.fillStyle = "#8a5a33";
    x.fill("evenodd");

    const dirt = "#96653a";
    // --- infield dirt: big circle centered between the basepaths ---
    const [ix, iz] = P(0, -19.4);
    x.beginPath();
    x.arc(ix, iz, M(26), 0, Math.PI * 2);
    x.fillStyle = dirt;
    x.fill();
    // grass diamond inside the dirt (inset from the basepaths)
    x.beginPath();
    const inset = 0.82;
    const corners = [
      [0, -19.4 + 19.4 * inset],
      [19.4 * inset, -19.4],
      [0, -19.4 - 19.4 * inset],
      [-19.4 * inset, -19.4],
    ];
    corners.forEach(([wx2, wz2], i2) => {
      const [px, pz] = P(wx2, wz2);
      i2 ? x.lineTo(px, pz) : x.moveTo(px, pz);
    });
    x.closePath();
    x.fillStyle = "#2f8237";
    x.fill();

    // --- home-plate dirt circle & mound circle ---
    x.beginPath();
    x.arc(...P(0, 0.4), M(4.6), 0, Math.PI * 2);
    x.fillStyle = dirt;
    x.fill();
    x.beginPath();
    x.arc(...P(0, -18.44), M(3.0), 0, Math.PI * 2);
    x.fill();

    // --- dirt speckle for texture grain ---
    x.save();
    for (let i = 0; i < 9000; i++) {
      const px = Math.random() * S;
      const pz = Math.random() * S;
      x.fillStyle = `rgba(${40 + Math.random() * 60},${
        30 + Math.random() * 50
      },${15 + Math.random() * 25},0.10)`;
      x.fillRect(px, pz, 2, 2);
    }
    x.restore();

    // --- chalk: foul lines home -> wall at ±45° ---
    x.strokeStyle = "rgba(255,255,255,0.95)";
    x.lineWidth = Math.max(2, M(0.3));
    for (const sgn of [1, -1]) {
      x.beginPath();
      x.moveTo(...P(sgn * 1.0, -0.6));
      x.lineTo(...P(sgn * (FENCE_RADIUS + 4) * 0.7071, -(FENCE_RADIUS + 4) * 0.7071));
      x.stroke();
    }
    // batter's boxes flanking the plate
    x.lineWidth = Math.max(2, M(0.12));
    for (const sgn of [1, -1]) {
      const [bx, bz] = P(sgn > 0 ? 0.85 : -2.05, -0.7); // top-left corner
      x.strokeRect(bx, bz, M(1.2), M(2.2));
    }

    // on-deck circles
    for (const sgn of [1, -1]) {
      x.beginPath();
      x.arc(...P(sgn * 10, 5), M(1.4), 0, Math.PI * 2);
      x.fillStyle = dirt;
      x.fill();
    }

    // --- edge darkening near the wall so the field vignettes naturally ---
    const grad = x.createRadialGradient(hx, hz, M(FENCE_RADIUS - 25), hx, hz, M(FENCE_RADIUS + 12));
    grad.addColorStop(0, "rgba(0,0,0,0)");
    grad.addColorStop(1, "rgba(0,10,5,0.28)");
    x.fillStyle = grad;
    x.fillRect(0, 0, S, S);

    const tex = new THREE.CanvasTexture(c);
    tex.anisotropy = 8;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2 * R, 2 * R),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // --- 3D bits: mound dome, rubber, bases, plate ---
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0xa5713d, roughness: 1 });
    const mound = new THREE.Mesh(new THREE.SphereGeometry(2.9, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), dirtMat);
    mound.scale.y = 0.1;
    mound.position.set(MOUND.x, 0, MOUND.z);
    mound.receiveShadow = true;
    this.scene.add(mound);
    const rubber = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.06, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xf5f5f5 }),
    );
    rubber.position.set(MOUND.x, 0.5, MOUND.z);
    this.scene.add(rubber);

    const baseMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0 });
    for (const key of ["first", "second", "third"]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.16, 1.0), baseMat);
      b.position.copy(BASES[key]).setY(0.08);
      b.rotation.y = Math.PI / 4;
      b.castShadow = true;
      this.scene.add(b);
    }
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 5), baseMat);
    plate.position.set(0, 0.035, 0.4);
    plate.rotation.y = Math.PI / 5;
    this.scene.add(plate);
  }

  // =========================================================================
  // STADIUM — full-circle bowl: tall ad wall, yellow HR line, stands with
  // crowd stacked above the wall, scoreboard in center field, light towers.
  // =========================================================================
  _buildStadium() {
    const R = FENCE_RADIUS;

    // Tall padded wall with distance markers + ad boards painted on.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(R, R, WALL_H, 128, 1, true),
      new THREE.MeshStandardMaterial({
        map: this._wallTexture(),
        side: THREE.BackSide,
        roughness: 0.9,
      }),
    );
    wall.position.y = WALL_H / 2;
    this.scene.add(wall);

    // Yellow home-run line along the top of the wall.
    const hrLine = new THREE.Mesh(
      new THREE.CylinderGeometry(R - 0.05, R - 0.05, 0.3, 128, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0xffd54f,
        emissive: 0x6b5410,
        side: THREE.BackSide,
      }),
    );
    hrLine.position.y = WALL_H + 0.15;
    this.scene.add(hrLine);

    // Foul poles.
    for (const sgn of [1, -1]) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 16, 10),
        new THREE.MeshStandardMaterial({ color: 0xffd54f, emissive: 0x554400 }),
      );
      pole.position.set(sgn * (R - 0.6) * 0.7071, 8, -(R - 0.6) * 0.7071);
      this.scene.add(pole);
    }

    // Two stand tiers stacked above/behind the wall, full circle.
    const seatTex = this._seatTexture();
    // Tiers overlap the wall top and each other slightly so no dark gap rings
    // show between them from a low camera.
    const tiers = [
      { r0: R + 0.5, r1: R + 16, y0: WALL_H - 0.8, h: 10 },
      { r0: R + 16, r1: R + 30, y0: WALL_H + 8.6, h: 9 },
    ];
    for (const t of tiers) {
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(t.r1, t.r0, t.h, 96, 1, true),
        new THREE.MeshStandardMaterial({
          map: seatTex,
          side: THREE.DoubleSide,
          roughness: 1,
        }),
      );
      ring.position.y = t.y0 + t.h / 2;
      this.scene.add(ring);
    }
    // Dark facade closing the bowl behind the top tier.
    const facade = new THREE.Mesh(
      new THREE.CylinderGeometry(R + 31, R + 31, WALL_H + 22, 96, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x131a24, side: THREE.DoubleSide }),
    );
    facade.position.y = (WALL_H + 22) / 2;
    this.scene.add(facade);

    // Crowd: points scattered ON the tier cones so they sit in the seats.
    this._buildCrowd(tiers);

    // Center-field scoreboard.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(34, 15, 1.2),
      new THREE.MeshStandardMaterial({
        map: this._scoreboardTexture(),
        emissive: 0x3a3f55,
        emissiveIntensity: 0.55,
      }),
    );
    board.position.set(0, WALL_H + 17, -(R + 14));
    this.scene.add(board);

    // Light towers around the bowl, lamps glowing for the dusk game.
    for (const ang of [-2.0, -1.1, -0.35, 0.35, 1.1, 2.0]) {
      const px = Math.sin(ang) * (R + 30);
      const pz = -Math.cos(ang) * (R + 30);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.7, 0.9, 34, 8),
        new THREE.MeshStandardMaterial({ color: 0x10151c }),
      );
      pole.position.set(px, WALL_H + 22 + 8, pz);
      this.scene.add(pole);
      const bank = new THREE.Mesh(
        new THREE.BoxGeometry(9, 5, 0.8),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xfff3cf,
          emissiveIntensity: 2.2,
        }),
      );
      bank.position.set(px, WALL_H + 22 + 25, pz);
      bank.lookAt(0, 1, -20);
      this.scene.add(bank);
    }
  }

  // Wall texture: dark green pads, panel seams, white distance numbers, and a
  // row of ad boards along the upper half (The Bigs-style busy outfield wall).
  _wallTexture() {
    const c = this._canvas(2048, 256);
    const x = c.getContext("2d");
    x.fillStyle = "#1c4527";
    x.fillRect(0, 0, 2048, 256);
    // pad seams
    x.strokeStyle = "rgba(0,0,0,0.35)";
    x.lineWidth = 4;
    for (let i = 0; i < 2048; i += 128) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 256);
      x.stroke();
    }
    // ad boards on the upper half
    const ads = [
      ["#0d2f5c", "ORACLE", "#ffffff"],
      ["#701524", "26ai", "#ffd54f"],
      ["#123d2e", "SLUGGERS", "#ffffff"],
      ["#5c4a0d", "DIAMOND", "#ffffff"],
      ["#2a1560", "TURBO", "#7ef0ff"],
      ["#4a1230", "MOONSHOT", "#ffd54f"],
    ];
    for (let i = 0; i < 16; i++) {
      const [bg, txt, fg] = ads[i % ads.length];
      x.fillStyle = "rgba(255,255,255,0.9)";
      x.fillRect(i * 128 + 8, 22, 112, 74);
      x.fillStyle = bg;
      x.fillRect(i * 128 + 12, 26, 104, 66);
      x.fillStyle = fg;
      x.font = "bold 26px Arial Black, Arial";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(txt, i * 128 + 64, 60, 96);
    }
    // distance markers along the lower half
    x.fillStyle = "#ffffff";
    x.font = "bold 64px Arial Black, Arial";
    const marks = ["330", "375", "410", "375", "330"];
    marks.forEach((m, i) => {
      x.fillText(m, ((i + 0.5) / marks.length) * 2048, 190);
    });
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    // negative x-repeat mirrors the texture — needed because the wall renders
    // its BackSide (viewed from inside the bowl), which flips it horizontally
    tex.repeat.set(-2, 1);
    tex.anisotropy = 4;
    return tex;
  }

  _seatTexture() {
    const c = this._canvas(128);
    const x = c.getContext("2d");
    x.fillStyle = "#26303f";
    x.fillRect(0, 0, 128, 128);
    for (let r = 0; r < 128; r += 10) {
      x.fillStyle = "#1a222e";
      x.fillRect(0, r, 128, 3);
    }
    for (let i = 0; i < 128; i += 6) {
      x.fillStyle = "rgba(70,86,110,0.5)";
      x.fillRect(i, 0, 2, 128);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(60, 2);
    return t;
  }

  _scoreboardTexture() {
    const c = this._canvas(1024, 512);
    const x = c.getContext("2d");
    x.fillStyle = "#0a0e18";
    x.fillRect(0, 0, 1024, 512);
    x.strokeStyle = "#2a3a55";
    x.lineWidth = 10;
    x.strokeRect(14, 14, 996, 484);
    x.textAlign = "center";
    x.fillStyle = "#ffd54f";
    x.font = "bold 110px Arial Black, Arial";
    x.fillText("DIAMOND", 512, 170);
    x.fillStyle = "#ff5722";
    x.fillText("SLUGGERS", 512, 300);
    x.fillStyle = "#7ec8ff";
    x.font = "bold 44px Arial";
    x.fillText("● TURBO BASEBALL ●", 512, 420);
    return new THREE.CanvasTexture(c);
  }

  // Crowd points placed on the tier cone surfaces so they sit in the seats.
  _buildCrowd(tiers) {
    const COUNT = 9000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const t = tiers[(Math.random() * tiers.length) | 0];
      const f = Math.random(); // 0 = front row, 1 = back row
      const r = t.r0 + f * (t.r1 - t.r0);
      const y = t.y0 + f * t.h + 0.5;
      const a = Math.random() * Math.PI * 2;
      pos[i * 3] = Math.sin(a) * r;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = Math.cos(a) * r;
      // varied clothing: saturated colors with a share of dark jackets
      if (Math.random() < 0.3) c.setHSL(0.6, 0.15, 0.12 + Math.random() * 0.12);
      else c.setHSL(Math.random(), 0.6, 0.3 + Math.random() * 0.3);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.crowd = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.9, vertexColors: true }),
    );
    this.scene.add(this.crowd);
  }

  // =========================================================================
  // Strike-zone box + aim reticle (The Bigs' white zone rect + green target).
  // =========================================================================
  _buildAimUI() {
    const w = ZONE.halfWidth * 2 + 0.1;
    const h = ZONE.top - ZONE.bottom + 0.1;
    const cy = (ZONE.top + ZONE.bottom) / 2;

    const group = new THREE.Group();
    // translucent fill
    const fill = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.07,
        depthWrite: false,
        side: THREE.DoubleSide, // visible from both the plate and mound cameras
      }),
    );
    group.add(fill);
    // white outline (slightly thick: 4 thin bars)
    const barMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const t = 0.05;
    const mk = (bw, bh, bx, by) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), barMat);
      m.position.set(bx, by, 0.001);
      group.add(m);
    };
    mk(w + t, t, 0, h / 2);
    mk(w + t, t, 0, -h / 2);
    mk(t, h + t, -w / 2, 0);
    mk(t, h + t, w / 2, 0);
    group.position.set(0, cy, 0.55);
    this.scene.add(group);
    this.zoneBox = group;

    // green target ring
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.1, 0.16, 24),
      new THREE.MeshBasicMaterial({
        color: 0x54ff6a,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    ring.position.set(0, cy, 0.6);
    this.scene.add(ring);
    this.reticle = ring;
    this.setAimUI(0, cy, false);
  }

  // Called by the game every frame: position the reticle, toggle visibility.
  setAimUI(aimX, aimY, visible) {
    if (!this.zoneBox) return;
    this.zoneBox.visible = visible;
    this.reticle.visible = visible;
    if (visible) this.reticle.position.set(aimX, aimY, 0.6);
  }

  // =========================================================================
  // Ball + glowing trail
  // =========================================================================
  _buildBall() {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 20, 20),
      new THREE.MeshStandardMaterial({
        map: this._ballTexture(),
        emissive: 0x111111,
        roughness: 0.4,
      }),
    );
    ball.castShadow = true;

    const trailGeo = new THREE.BufferGeometry();
    this._trailLen = 24;
    this._trailPos = new Float32Array(this._trailLen * 3);
    trailGeo.setAttribute("position", new THREE.BufferAttribute(this._trailPos, 3));
    ball.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({
        color: 0xffe082,
        transparent: true,
        opacity: 0.9,
      }),
    );
    ball.trail.visible = false;
    this.scene.add(ball.trail);
    this.scene.add(ball);
    return ball;
  }

  _ballTexture() {
    const c = this._canvas(128);
    const x = c.getContext("2d");
    x.fillStyle = "#f6f4ea";
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "#c0392b";
    x.lineWidth = 2;
    for (const off of [34, 94]) {
      x.beginPath();
      x.arc(off, 64, 40, -0.9, 0.9);
      x.stroke();
      for (let a = -0.8; a < 0.8; a += 0.16) {
        const px = off + Math.cos(a) * 40;
        const py = 64 + Math.sin(a) * 40;
        x.beginPath();
        x.moveTo(px, py - 3);
        x.lineTo(px, py + 3);
        x.stroke();
      }
    }
    return new THREE.CanvasTexture(c);
  }

  // Jersey number decal texture (white base so material color tints it).
  _numberTex() {
    const c = this._canvas(128);
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, 128, 128);
    const num = 1 + ((Math.random() * 60) | 0);
    x.font = "bold 64px Arial Black, Arial";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.fillStyle = "rgba(20,22,30,0.85)";
    x.fillText(String(num), 64, 70);
    return new THREE.CanvasTexture(c);
  }

  // =========================================================================
  // Player figure — chunky arcade build: broad torso, team-colored cap/helmet,
  // sleeves and socks; gray uniform; bat for the batter, glove otherwise.
  // =========================================================================
  makePlayer(team, role = "fielder") {
    if (this.assets && this.assets.hasPlayer(team)) {
      return this._makeModelPlayer(team, role);
    }
    return this._makeProceduralPlayer(team, role);
  }

  _makeModelPlayer(team, role) {
    const { root, animations } = this.assets.clonePlayer(team);
    const m = this.assets.manifest;
    const g = new THREE.Group();
    root.scale.setScalar(m.playerScale || 1);
    root.position.y += m.playerYOffset || 0;
    root.rotation.y = m.playerYaw || 0;
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    g.add(root);
    g.userData.isModel = true;
    if (animations && animations.length) {
      const mixer = new THREE.AnimationMixer(root);
      this.mixers.push(mixer);
      g.userData.mixer = mixer;
      g.userData.actions = {};
      const map = m.clips || {};
      const findClip = (key) => {
        const want = (map[key] || key).toLowerCase();
        return animations.find((a) => a.name.toLowerCase().includes(want));
      };
      for (const key of ["idle", "swing", "pitch", "run", "dive"]) {
        const clip = findClip(key);
        if (clip) g.userData.actions[key] = mixer.clipAction(clip);
      }
      this._playLoop(g, role === "runner" ? "run" : "idle");
    }
    return g;
  }

  _makeProceduralPlayer(team, role = "fielder") {
    const t = TEAMS[team];
    const g = new THREE.Group();
    g.userData.isModel = false;

    const teamMat = new THREE.MeshStandardMaterial({
      color: t.color,
      roughness: 0.6,
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: t.color,
      roughness: 0.25,
      metalness: 0.15,
    });
    g.userData.tint = [teamMat, helmetMat];

    const skin = this._skinMat;
    const uni = this._uniMat;

    // Torso — broad arcade chest wearing the gray uniform + number.
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 0.52, 6, 12), uni);
    torso.position.y = 1.32;
    torso.scale.z = 0.78;
    torso.castShadow = true;
    g.add(torso);
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.35, 0.1, 12), this._beltMat);
    belt.position.y = 0.98;
    g.add(belt);
    const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.14, 4, 8), uni);
    pelvis.position.y = 0.88;
    pelvis.castShadow = true;
    g.add(pelvis);

    // Legs: gray pants, team socks, black shoes.
    for (const sx of [-0.17, 0.17]) {
      const hip = new THREE.Group();
      hip.position.set(sx, 0.86, 0);
      g.add(hip);
      const thigh = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.34, 4, 8), uni);
      thigh.position.y = -0.25;
      thigh.castShadow = true;
      hip.add(thigh);
      const sock = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.3, 4, 8), teamMat);
      sock.position.y = -0.62;
      hip.add(sock);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.13, 0.38), this._shoeMat);
      shoe.position.set(0, -0.84, 0.08);
      hip.add(shoe);
    }

    // Head + cap or batting helmet.
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 16), skin);
    head.position.y = 1.86;
    head.castShadow = true;
    g.add(head);
    if (role === "batter" || role === "runner") {
      const helmet = new THREE.Mesh(
        new THREE.SphereGeometry(0.27, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62),
        helmetMat,
      );
      helmet.position.y = 1.88;
      g.add(helmet);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.05, 0.24), helmetMat);
      brim.position.set(0, 1.9, 0.25);
      g.add(brim);
    } else {
      const dome = new THREE.Mesh(
        new THREE.SphereGeometry(0.255, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        teamMat,
      );
      dome.position.y = 1.9;
      g.add(dome);
      const brim = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.22), teamMat);
      brim.position.set(0, 1.9, 0.24);
      g.add(brim);
    }

    // Arms: team-colored sleeves (undershirt look) + skin forearms.
    const mkArm = (side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.44, 1.56, 0);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.26, 4, 8), teamMat);
      sleeve.position.y = -0.16;
      sleeve.castShadow = true;
      arm.add(sleeve);
      const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.28, 4, 8), skin);
      fore.position.y = -0.48;
      arm.add(fore);
      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 10), skin);
      hand.position.y = -0.68;
      arm.add(hand);
      g.add(arm);
      return arm;
    };
    const rArm = mkArm(1);
    const lArm = mkArm(-1);
    g.userData.rArm = rArm;
    g.userData.lArm = lArm;

    // Rest pose + role props.
    g.userData.restRArm = { x: 0, y: 0, z: 0 };
    g.userData.restLArm = { x: 0, y: 0, z: 0 };
    g.userData.restRotY = 0;
    if (role === "batter") {
      const bat = this._makeBat();
      bat.position.set(0, -0.72, 0);
      bat.rotation.set(-0.9, 0, 0.5);
      rArm.add(bat);
      // Bat up over the shoulder, elbows high — The Bigs stance.
      rArm.rotation.set(-2.2, 0, -0.7);
      lArm.rotation.set(-1.9, 0, 0.5);
      // stand sideways-on in the box, chest toward the plate
      g.rotation.y = 1.05;
      g.userData.restRArm = { x: -2.2, y: 0, z: -0.7 };
      g.userData.restLArm = { x: -1.9, y: 0, z: 0.5 };
      g.userData.restRotY = 1.05;
    } else {
      const glove = this._makeGlove();
      glove.position.set(0, -0.72, 0);
      lArm.add(glove);
    }
    g.scale.setScalar(1.12);
    return g;
  }

  _makeBat() {
    const bat = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({
      color: 0x9a6a33,
      roughness: 0.45,
      metalness: 0.05,
    });
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.6, 10), wood);
    handle.position.y = 0.3;
    bat.add(handle);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.05, 0.55, 10), wood);
    barrel.position.y = 0.85;
    bat.add(barrel);
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.03, 10), wood);
    knob.position.y = 0.0;
    bat.add(knob);
    return bat;
  }

  _makeGlove() {
    const glove = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a3b1c, roughness: 0.8 });
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mat);
    palm.scale.set(1, 1.2, 0.6);
    glove.add(palm);
    return glove;
  }

  // =========================================================================
  // Semantic animations (same API as before — game.js is agnostic).
  // =========================================================================
  animSwing(g, kind) {
    if (g.userData.isModel) return this._playOnce(g, "swing", "idle");
    const arm = g.userData.rArm;
    const lArm = g.userData.lArm;
    if (!arm) return;
    arm.rotation.set(0.4, 0, kind === "power" ? -2.6 : -2.0);
    if (lArm) lArm.rotation.set(0.3, 0, 1.2);
    g.rotation.y = -1.0;
    clearTimeout(g.userData._tSwing);
    g.userData._tSwing = setTimeout(() => {
      const r = g.userData.restRArm;
      const l = g.userData.restLArm;
      arm.rotation.set(r.x, r.y, r.z);
      if (lArm && l) lArm.rotation.set(l.x, l.y, l.z);
      g.rotation.y = g.userData.restRotY ?? 0.25;
    }, 280);
  }

  animPitchCharge(g, amt) {
    if (g.userData.isModel) return;
    const arm = g.userData.rArm;
    if (arm) arm.rotation.x = -amt * 2.2;
  }

  animPitchRelease(g) {
    if (g.userData.isModel) return this._playOnce(g, "pitch", "idle");
    const arm = g.userData.rArm;
    if (!arm) return;
    arm.rotation.x = 1.3;
    clearTimeout(g.userData._tPitch);
    g.userData._tPitch = setTimeout(() => (arm.rotation.x = 0), 500);
  }

  animDive(g) {
    if (g.userData.isModel) return this._playOnce(g, "dive", "idle");
    const arm = g.userData.rArm;
    if (!arm) return;
    arm.rotation.x = -2.4;
    clearTimeout(g.userData._tDive);
    g.userData._tDive = setTimeout(() => (arm.rotation.x = 0), 300);
  }

  animResetArms(g) {
    if (g.userData.isModel) return this._playLoop(g, "idle");
    const r = g.userData.restRArm;
    const l = g.userData.restLArm;
    if (g.userData.rArm && r) g.userData.rArm.rotation.set(r.x, r.y, r.z);
    if (g.userData.lArm && l) g.userData.lArm.rotation.set(l.x, l.y, l.z);
  }

  _playLoop(g, name) {
    const a = g.userData.actions && g.userData.actions[name];
    if (!a) return;
    a.reset().setLoop(THREE.LoopRepeat, Infinity);
    this._fadeTo(g, a);
  }

  _playOnce(g, name, thenLoop) {
    const acts = g.userData.actions || {};
    const a = acts[name];
    if (!a) return;
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    this._fadeTo(g, a);
    const mixer = g.userData.mixer;
    if (thenLoop && acts[thenLoop] && mixer) {
      const onFin = (e) => {
        if (e.action !== a) return;
        mixer.removeEventListener("finished", onFin);
        this._playLoop(g, thenLoop);
      };
      mixer.addEventListener("finished", onFin);
    }
  }

  _fadeTo(g, action) {
    const prev = g.userData._cur;
    if (prev && prev !== action) prev.fadeOut(0.15);
    action.fadeIn(0.15).play();
    g.userData._cur = action;
  }

  updateMixers(dt) {
    for (const m of this.mixers) m.update(dt);
  }

  // =========================================================================
  // Runtime helpers
  // =========================================================================
  updateCamera(dt) {
    const k = 1 - Math.pow(0.001, dt);
    this._camPos.lerp(this._camTarget.pos, k);
    this._camLook.lerp(this._camTarget.look, k);
    this.camera.position.copy(this._camPos);
    this.camera.lookAt(this._camLook);
  }

  setBallTrail(visible) {
    this.ball.trail.visible = visible;
    if (!visible) {
      for (let i = 0; i < this._trailLen; i++) {
        this._trailPos[i * 3] = this.ball.position.x;
        this._trailPos[i * 3 + 1] = this.ball.position.y;
        this._trailPos[i * 3 + 2] = this.ball.position.z;
      }
      this.ball.trail.geometry.attributes.position.needsUpdate = true;
    }
  }

  pushTrail() {
    const p = this._trailPos;
    p.copyWithin(3, 0, p.length - 3);
    p[0] = this.ball.position.x;
    p[1] = this.ball.position.y;
    p[2] = this.ball.position.z;
    this.ball.trail.geometry.attributes.position.needsUpdate = true;
  }

  setBloom(strength) {
    this.bloom.strength = strength;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.composer.setSize(innerWidth, innerHeight);
  }

  render() {
    this.composer.render();
  }
}
