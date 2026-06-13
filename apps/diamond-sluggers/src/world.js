// world.js — builds and renders the 3D scene: stadium, textured field, sky,
// lighting, articulated player figures, the ball, and an UnrealBloom post pass.
// Visual target: early-PS2-era baseball (jointed, textured low-poly models,
// uniform numbers, caps/bats/gloves, ad walls, a center-field scoreboard).

import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import {
  BASES,
  FENCE_RADIUS,
  FENCE_HEIGHT,
  MOUND,
  TEAMS,
} from "./constants.js";

export class World {
  constructor(canvas, assets = null) {
    this.assets = assets;
    this.mixers = []; // AnimationMixers for any loaded glTF characters

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x0b1626, 150, 360);

    this.camera = new THREE.PerspectiveCamera(
      52,
      innerWidth / innerHeight,
      0.1,
      1000,
    );
    this._setCam("bat");

    this._buildAssets(); // shared materials + procedural textures
    this._buildLights();
    this._buildSky();
    // Use an imported stadium if the manifest asks to replace the procedural
    // one; otherwise build the procedural field + ballpark.
    if (!(this.assets && this.assets.replaceStadium)) {
      this._buildField();
      this._buildStadium();
    }
    if (this.assets && this.assets.stadium) {
      this.scene.add(this.assets.stadium);
    }
    this.ball = this._buildBall();

    // Post-processing: subtle bloom for lights, fire FX, and the ball trail.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.5, // strength
      0.7, // radius
      0.85, // threshold
    );
    this.composer.addPass(this.bloom);

    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  // =========================================================================
  // Procedural textures & shared materials (no external asset files).
  // =========================================================================
  _buildAssets() {
    this._skinMat = new THREE.MeshStandardMaterial({
      color: 0xe6b08a,
      roughness: 0.7,
    });
    this._pantsMat = new THREE.MeshStandardMaterial({
      color: 0xf3f3f3,
      roughness: 0.8,
      map: this._pinstripeTex(),
    });
    this._shoeMat = new THREE.MeshStandardMaterial({
      color: 0x14181f,
      roughness: 0.5,
    });
    this._beltMat = new THREE.MeshStandardMaterial({ color: 0x111317 });
    this._jerseyTex = this._jerseyTex || this._makeJerseyTex();
  }

  _canvas(size = 128) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    return c;
  }

  _pinstripeTex() {
    const c = this._canvas(64);
    const x = c.getContext("2d");
    x.fillStyle = "#f3f3f3";
    x.fillRect(0, 0, 64, 64);
    x.strokeStyle = "rgba(40,40,60,0.25)";
    x.lineWidth = 1;
    for (let i = 4; i < 64; i += 8) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 64);
      x.stroke();
    }
    return new THREE.CanvasTexture(c);
  }

  // White-based jersey detail (pinstripes + a uniform number). The team color
  // comes from the material's `color`, which multiplies this map — so retinting
  // a player just changes material.color and the number/stripes stay readable.
  _makeJerseyTex() {
    const c = this._canvas(128);
    const x = c.getContext("2d");
    x.fillStyle = "#ffffff";
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "rgba(255,255,255,0.0)";
    // subtle pinstripes
    x.strokeStyle = "rgba(0,0,0,0.12)";
    x.lineWidth = 2;
    for (let i = 10; i < 128; i += 14) {
      x.beginPath();
      x.moveTo(i, 0);
      x.lineTo(i, 128);
      x.stroke();
    }
    // a big uniform number on the chest
    const num = 1 + ((Math.random() * 60) | 0);
    x.font = "bold 60px Arial Black, Arial";
    x.textAlign = "center";
    x.textBaseline = "middle";
    x.lineWidth = 6;
    x.strokeStyle = "rgba(255,255,255,0.9)";
    x.strokeText(String(num), 64, 72);
    x.fillStyle = "rgba(15,15,25,0.75)";
    x.fillText(String(num), 64, 72);
    return new THREE.CanvasTexture(c);
  }

  _grassTexture() {
    const c = this._canvas(256);
    const x = c.getContext("2d");
    for (let i = 0; i < 16; i++) {
      x.fillStyle = i % 2 ? "#2f7d34" : "#287030";
      x.fillRect(0, i * 16, 256, 16);
    }
    // speckle for a mowed-turf grain
    for (let i = 0; i < 2200; i++) {
      x.fillStyle = `rgba(${20 + Math.random() * 30},${90 + Math.random() * 50},${
        30 + Math.random() * 30
      },0.25)`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    return tex;
  }

  _dirtTexture() {
    const c = this._canvas(256);
    const x = c.getContext("2d");
    x.fillStyle = "#a8703f";
    x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      const v = Math.random();
      x.fillStyle = `rgba(${120 + v * 60},${70 + v * 40},${30 + v * 30},0.5)`;
      x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }

  // Repeating outfield-wall advertising banners.
  _adWallTexture() {
    const c = document.createElement("canvas");
    c.width = 1024;
    c.height = 128;
    const x = c.getContext("2d");
    x.fillStyle = "#0d3b16";
    x.fillRect(0, 0, 1024, 128);
    const ads = [
      ["#1b3a6b", "ORACLE", "#ffffff"],
      ["#7a1020", "26ai", "#ffd54f"],
      ["#143d2a", "SLUGGERS", "#ffffff"],
      ["#3a2a05", "DIAMOND", "#ffd54f"],
    ];
    for (let i = 0; i < 8; i++) {
      const [bg, txt, fg] = ads[i % ads.length];
      x.fillStyle = bg;
      x.fillRect(i * 128 + 6, 18, 116, 92);
      x.fillStyle = fg;
      x.font = "bold 34px Arial Black, Arial";
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(txt, i * 128 + 64, 66);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = THREE.RepeatWrapping;
    tex.repeat.set(8, 1);
    return tex;
  }

  _scoreboardTexture() {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const x = c.getContext("2d");
    x.fillStyle = "#05080f";
    x.fillRect(0, 0, 512, 256);
    x.strokeStyle = "#1d2a40";
    x.lineWidth = 6;
    x.strokeRect(8, 8, 496, 240);
    x.fillStyle = "#ffd54f";
    x.font = "bold 54px Arial Black, Arial";
    x.textAlign = "center";
    x.fillText("DIAMOND", 256, 90);
    x.fillStyle = "#ff5722";
    x.fillText("SLUGGERS", 256, 150);
    x.fillStyle = "#4fc3f7";
    x.font = "bold 26px Arial";
    x.fillText("● ● ● ● ● ● ● ● ●", 256, 210);
    return new THREE.CanvasTexture(c);
  }

  // ---- camera presets ------------------------------------------------------
  _setCam(mode) {
    this.camMode = mode;
    if (mode === "bat") {
      this._camTarget = {
        pos: new THREE.Vector3(0, 6.2, 16),
        look: new THREE.Vector3(0, 1.6, -8),
      };
    } else if (mode === "field") {
      this._camTarget = {
        pos: new THREE.Vector3(0, 34, 30),
        look: new THREE.Vector3(0, 0, -28),
      };
    } else if (mode === "pitch") {
      this._camTarget = {
        pos: new THREE.Vector3(0, 7.5, 20),
        look: new THREE.Vector3(0, 1.4, -14),
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

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0x9fc6ff, 0x2a4d2a, 0.6));

    const key = new THREE.DirectionalLight(0xfff2d6, 2.5);
    key.position.set(40, 80, 30);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const s = 90;
    key.shadow.camera.left = -s;
    key.shadow.camera.right = s;
    key.shadow.camera.top = s;
    key.shadow.camera.bottom = -s;
    key.shadow.camera.far = 260;
    key.shadow.bias = -0.0004;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7);
    fill.position.set(-50, 60, -40);
    this.scene.add(fill);
  }

  _buildSky() {
    const geo = new THREE.SphereGeometry(500, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        top: { value: new THREE.Color(0x0a1f3c) },
        bottom: { value: new THREE.Color(0x16324f) },
      },
      vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);} `,
      fragmentShader: `varying vec3 vP; uniform vec3 top; uniform vec3 bottom;
        void main(){ float h = normalize(vP).y*0.5+0.5; gl_FragColor = vec4(mix(bottom, top, smoothstep(0.0,0.9,h)),1.0);} `,
    });
    this.scene.add(new THREE.Mesh(geo, mat));
  }

  _buildField() {
    const grass = new THREE.Mesh(
      new THREE.CircleGeometry(FENCE_RADIUS + 8, 64),
      new THREE.MeshStandardMaterial({
        map: this._grassTexture(),
        roughness: 0.95,
      }),
    );
    grass.rotation.x = -Math.PI / 2;
    grass.position.z = -FENCE_RADIUS * 0.45;
    grass.receiveShadow = true;
    this.scene.add(grass);

    const dirtMat = new THREE.MeshStandardMaterial({
      map: this._dirtTexture(),
      roughness: 1,
    });

    // Infield dirt diamond.
    const diamond = new THREE.Mesh(new THREE.CircleGeometry(28, 4), dirtMat);
    diamond.rotation.x = -Math.PI / 2;
    diamond.rotation.z = Math.PI / 4;
    diamond.position.set(0, 0.01, -19.4);
    diamond.receiveShadow = true;
    this.scene.add(diamond);

    // Grass cut-in inside the basepaths.
    const infieldGrass = new THREE.Mesh(
      new THREE.CircleGeometry(15.5, 4),
      new THREE.MeshStandardMaterial({
        map: this._grassTexture(),
        color: 0x6fae6f,
        roughness: 0.95,
      }),
    );
    infieldGrass.rotation.x = -Math.PI / 2;
    infieldGrass.rotation.z = Math.PI / 4;
    infieldGrass.position.set(0, 0.02, -19.4);
    this.scene.add(infieldGrass);

    // Pitcher's mound + rubber.
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.8, 0.5, 24),
      dirtMat,
    );
    mound.position.copy(MOUND).setY(0.05);
    mound.receiveShadow = true;
    this.scene.add(mound);
    const rubber = new THREE.Mesh(
      new THREE.BoxGeometry(0.6, 0.06, 0.18),
      new THREE.MeshStandardMaterial({ color: 0xffffff }),
    );
    rubber.position.copy(MOUND).setY(0.31);
    this.scene.add(rubber);

    // Bases + home plate.
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x222222,
    });
    for (const key of ["first", "second", "third"]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 1.1), baseMat);
      b.position.copy(BASES[key]).setY(0.12);
      b.rotation.y = Math.PI / 4;
      b.castShadow = true;
      this.scene.add(b);
    }
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.1, 5),
      baseMat,
    );
    plate.position.set(0, 0.06, 0.4);
    this.scene.add(plate);

    // Batter's boxes (chalk dirt) and foul lines.
    const chalk = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sx of [-1.5, 1.5]) {
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(1.3, 0.02, 2.4),
        new THREE.MeshStandardMaterial({
          color: 0xc8a06a,
          transparent: true,
          opacity: 0.5,
        }),
      );
      b.position.set(sx, 0.03, 0.4);
      this.scene.add(b);
    }
    for (const sign of [1, -1]) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.02, FENCE_RADIUS * 1.45),
        chalk,
      );
      line.rotation.y = sign * (Math.PI / 4);
      line.position.x = sign * (FENCE_RADIUS * 0.51);
      line.position.z = -(FENCE_RADIUS * 0.51);
      line.position.y = 0.05;
      this.scene.add(line);
    }
  }

  _buildStadium() {
    const thetaStart = -Math.PI * 0.75;
    const thetaLen = Math.PI * 1.5;

    // Outfield wall with advertising banners.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        FENCE_RADIUS,
        FENCE_RADIUS,
        FENCE_HEIGHT,
        96,
        1,
        true,
        thetaStart,
        thetaLen,
      ),
      new THREE.MeshStandardMaterial({
        map: this._adWallTexture(),
        side: THREE.DoubleSide,
        roughness: 0.85,
      }),
    );
    wall.position.set(0, FENCE_HEIGHT / 2, 0);
    wall.castShadow = true;
    this.scene.add(wall);

    // Yellow padding stripe atop the wall.
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(
        FENCE_RADIUS + 0.05,
        FENCE_RADIUS + 0.05,
        0.4,
        96,
        1,
        true,
        thetaStart,
        thetaLen,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffd54f,
        side: THREE.DoubleSide,
        emissive: 0x4a3a00,
      }),
    );
    top.position.set(0, FENCE_HEIGHT, 0);
    this.scene.add(top);

    // Center-field scoreboard on a frame.
    const board = new THREE.Mesh(
      new THREE.BoxGeometry(26, 13, 1),
      new THREE.MeshStandardMaterial({
        map: this._scoreboardTexture(),
        emissive: 0x222233,
        emissiveIntensity: 0.6,
      }),
    );
    board.position.set(0, 17, -(FENCE_RADIUS + 10));
    this.scene.add(board);
    for (const sx of [-11, 11]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 22),
        new THREE.MeshStandardMaterial({ color: 0x10151d }),
      );
      leg.position.set(sx, 11, -(FENCE_RADIUS + 10.6));
      this.scene.add(leg);
    }

    // Tiered stands.
    const seatTex = this._seatTexture();
    for (let tier = 0; tier < 4; tier++) {
      const r = FENCE_RADIUS + 10 + tier * 9;
      const h = 6 + tier * 5;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(
          r,
          r - 6,
          5,
          96,
          1,
          true,
          -Math.PI * 0.85,
          Math.PI * 1.7,
        ),
        new THREE.MeshStandardMaterial({
          map: seatTex,
          roughness: 1,
          side: THREE.DoubleSide,
        }),
      );
      ring.position.set(0, h, 0);
      this.scene.add(ring);
    }
    this._buildCrowd();

    // Light towers.
    for (const ang of [-1.0, -0.4, 0.4, 1.0]) {
      const x = Math.sin(ang) * (FENCE_RADIUS + 26);
      const z = -Math.cos(ang) * (FENCE_RADIUS + 26);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.6, 0.6, 40),
        new THREE.MeshStandardMaterial({ color: 0x111820 }),
      );
      pole.position.set(x, 20, z);
      this.scene.add(pole);
      const bank = new THREE.Mesh(
        new THREE.BoxGeometry(7, 4, 1),
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          emissive: 0xfff4d0,
          emissiveIntensity: 1.4,
        }),
      );
      bank.position.set(x, 40, z);
      bank.lookAt(0, 0, -20);
      this.scene.add(bank);
    }
  }

  _seatTexture() {
    const c = this._canvas(64);
    const x = c.getContext("2d");
    x.fillStyle = "#202a3c";
    x.fillRect(0, 0, 64, 64);
    for (let i = 0; i < 64; i += 8) {
      x.fillStyle = "#161e2c";
      x.fillRect(0, i, 64, 2);
      x.fillStyle = "#28344a";
      x.fillRect(i, 0, 2, 64);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(40, 3);
    return t;
  }

  _buildCrowd() {
    const COUNT = 7000;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(COUNT * 3);
    const col = new Float32Array(COUNT * 3);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const tier = Math.floor(Math.random() * 4);
      const r = FENCE_RADIUS + 9 + tier * 9 + Math.random() * 6;
      const a = -Math.PI * 0.85 + Math.random() * Math.PI * 1.7;
      pos[i * 3] = Math.sin(a) * r;
      pos[i * 3 + 1] = 6 + tier * 5 + Math.random() * 4;
      pos[i * 3 + 2] = -Math.cos(a) * r;
      c.setHSL(Math.random(), 0.5, 0.5 + Math.random() * 0.3);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    this.crowd = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 1.2, vertexColors: true }),
    );
    this.scene.add(this.crowd);
  }

  _buildBall() {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 20, 20),
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
    trailGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(this._trailPos, 3),
    );
    ball.trail = new THREE.Line(
      trailGeo,
      new THREE.LineBasicMaterial({
        color: 0xffc107,
        transparent: true,
        opacity: 0.8,
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
    x.fillStyle = "#fdfdf5";
    x.fillRect(0, 0, 128, 128);
    x.strokeStyle = "#c0392b";
    x.lineWidth = 2;
    for (const off of [34, 94]) {
      x.beginPath();
      x.arc(off, 64, 40, -0.9, 0.9);
      x.stroke();
      // stitch ticks
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

  // =========================================================================
  // Player figure. Uses an imported glTF model for the team if one was loaded,
  // otherwise builds the procedural figure. Both expose the same interface
  // (userData.isModel + the world.anim* methods drive the right animation).
  // role: "batter" | "pitcher" | "fielder" | "runner"
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

    const jerseyMat = new THREE.MeshStandardMaterial({
      color: t.color,
      map: this._jerseyTex,
      roughness: 0.7,
    });
    const capMat = new THREE.MeshStandardMaterial({
      color: t.color,
      roughness: 0.6,
    });
    g.userData.tint = [jerseyMat, capMat]; // materials retinted on team change

    const skin = this._skinMat;
    const pants = this._pantsMat;

    // Torso + belt + pelvis.
    const torso = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.32, 0.5, 6, 12),
      jerseyMat,
    );
    torso.position.y = 1.3;
    torso.castShadow = true;
    g.add(torso);
    const belt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.31, 0.31, 0.1, 12),
      this._beltMat,
    );
    belt.position.y = 1.02;
    g.add(belt);
    const pelvis = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.12, 4, 8),
      pants,
    );
    pelvis.position.y = 0.92;
    pelvis.castShadow = true;
    g.add(pelvis);

    // Legs.
    for (const sx of [-0.16, 0.16]) {
      const hip = new THREE.Group();
      hip.position.set(sx, 0.9, 0);
      g.add(hip);
      const thigh = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.14, 0.36, 4, 8),
        pants,
      );
      thigh.position.y = -0.26;
      thigh.castShadow = true;
      hip.add(thigh);
      const shin = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.11, 0.36, 4, 8),
        pants,
      );
      shin.position.y = -0.66;
      hip.add(shin);
      const shoe = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.12, 0.36),
        this._shoeMat,
      );
      shoe.position.set(0, -0.9, 0.07);
      hip.add(shoe);
    }

    // Head + cap (dome + brim).
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 16), skin);
    head.position.y = 1.78;
    head.castShadow = true;
    g.add(head);
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.225, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      capMat,
    );
    dome.position.y = 1.82;
    g.add(dome);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.2), capMat);
    brim.position.set(0, 1.81, 0.2);
    g.add(brim);

    // Arms — shoulder-pivot groups so a rotation swings the whole arm + prop.
    const mkArm = (side) => {
      const arm = new THREE.Group();
      arm.position.set(side * 0.36, 1.55, 0);
      const upper = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.11, 0.3, 4, 8),
        jerseyMat,
      );
      upper.position.y = -0.17;
      arm.add(upper);
      const fore = new THREE.Mesh(
        new THREE.CapsuleGeometry(0.09, 0.28, 4, 8),
        skin,
      );
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

    // Role props + rest pose (arm rotations the anim* methods return to).
    g.userData.restRArm = { x: 0, y: 0, z: 0 };
    g.userData.restLArm = { x: 0, y: 0, z: 0 };
    g.userData.restRotY = 0;
    if (role === "batter") {
      const bat = this._makeBat();
      bat.position.set(0, -0.7, 0);
      bat.rotation.set(-0.35, 0, 0.35);
      rArm.add(bat);
      // hands up together in a stance
      rArm.rotation.set(-0.5, 0, -0.55);
      lArm.rotation.set(-0.5, 0, 0.25);
      g.rotation.y = 0.2;
      g.userData.restRArm = { x: -0.5, y: 0, z: -0.55 };
      g.userData.restLArm = { x: -0.5, y: 0, z: 0.25 };
      g.userData.restRotY = 0.2;
    } else {
      // pitcher / fielder / runner all carry a glove on the left hand
      const glove = this._makeGlove();
      glove.position.set(0, -0.72, 0);
      lArm.add(glove);
    }

    return g;
  }

  // =========================================================================
  // Semantic animations — branch on procedural vs. glTF so game.js never has
  // to know which representation a player uses.
  // =========================================================================
  animSwing(g, kind) {
    if (g.userData.isModel) return this._playOnce(g, "swing", "idle");
    const arm = g.userData.rArm;
    if (!arm) return;
    arm.rotation.z = kind === "power" ? -2.4 : -1.8;
    g.rotation.y = -0.9;
    clearTimeout(g.userData._tSwing);
    g.userData._tSwing = setTimeout(() => {
      const r = g.userData.restRArm;
      arm.rotation.set(r.x, r.y, r.z);
      g.rotation.y = g.userData.restRotY ?? 0.2;
    }, 260);
  }

  animPitchCharge(g, amt) {
    if (g.userData.isModel) return; // idle clip plays during the windup
    const arm = g.userData.rArm;
    if (arm) arm.rotation.x = -amt * 2;
  }

  animPitchRelease(g) {
    if (g.userData.isModel) return this._playOnce(g, "pitch", "idle");
    const arm = g.userData.rArm;
    if (!arm) return;
    arm.rotation.x = 1.2;
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

  _makeBat() {
    const bat = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({
      color: 0x8a5a2b,
      roughness: 0.5,
      metalness: 0.1,
    });
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.045, 0.55, 8),
      wood,
    );
    handle.position.y = 0.27;
    bat.add(handle);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.045, 0.45, 8),
      wood,
    );
    barrel.position.y = 0.72;
    bat.add(barrel);
    return bat;
  }

  _makeGlove() {
    const glove = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: 0x5a3b1c,
      roughness: 0.8,
    });
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 10), mat);
    palm.scale.set(1, 1.2, 0.6);
    glove.add(palm);
    return glove;
  }

  // ---- runtime helpers -----------------------------------------------------
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
