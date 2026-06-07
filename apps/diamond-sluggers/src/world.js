// world.js — builds and renders the 3D scene: stadium, field, sky, lighting,
// player figures, the ball, and an UnrealBloom post pass for the modern glow.

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
  constructor(canvas) {
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
    this.scene.fog = new THREE.Fog(0x0b1626, 130, 320);

    this.camera = new THREE.PerspectiveCamera(
      52,
      innerWidth / innerHeight,
      0.1,
      1000,
    );
    this._setCam("bat");

    this._buildLights();
    this._buildSky();
    this._buildField();
    this._buildStadium();
    this.ball = this._buildBall();

    // Post-processing: subtle bloom for lights, fire FX, and the ball trail.
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(innerWidth, innerHeight),
      0.55, // strength
      0.7, // radius
      0.85, // threshold
    );
    this.composer.addPass(this.bloom);

    this.resize();
    window.addEventListener("resize", () => this.resize());
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
    this.scene.add(new THREE.HemisphereLight(0x9fc6ff, 0x2a4d2a, 0.65));

    const key = new THREE.DirectionalLight(0xfff2d6, 2.4);
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

    // Stadium-tower fill from the other side.
    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.7);
    fill.position.set(-50, 60, -40);
    this.scene.add(fill);
  }

  _buildSky() {
    // Vertical gradient sky as a large inverted sphere.
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

  // Procedural mowed-grass texture so the outfield has stripes like a real park.
  _grassTexture() {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d");
    for (let i = 0; i < 16; i++) {
      x.fillStyle = i % 2 ? "#2f7d34" : "#287030";
      x.fillRect(0, i * 16, 256, 16);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(8, 8);
    return tex;
  }

  _buildField() {
    // Grass plane.
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
      color: 0xb07a45,
      roughness: 1,
    });

    // Infield dirt: a diamond (rotated square) under the bases.
    const diamond = new THREE.Mesh(
      new THREE.CircleGeometry(28, 4),
      dirtMat,
    );
    diamond.rotation.x = -Math.PI / 2;
    diamond.rotation.z = Math.PI / 4;
    diamond.position.set(0, 0.01, -19.4);
    diamond.receiveShadow = true;
    this.scene.add(diamond);

    // Grass cut-in inside the basepaths so only the paths/mound are dirt.
    const infieldGrass = new THREE.Mesh(
      new THREE.CircleGeometry(15.5, 4),
      new THREE.MeshStandardMaterial({ color: 0x2f7d34, roughness: 0.95 }),
    );
    infieldGrass.rotation.x = -Math.PI / 2;
    infieldGrass.rotation.z = Math.PI / 4;
    infieldGrass.position.set(0, 0.02, -19.4);
    this.scene.add(infieldGrass);

    // Pitcher's mound.
    const mound = new THREE.Mesh(
      new THREE.CylinderGeometry(2.6, 2.6, 0.5, 24),
      dirtMat,
    );
    mound.position.copy(MOUND).setY(0.05);
    mound.receiveShadow = true;
    this.scene.add(mound);

    // Bases + home plate.
    const baseMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0x222222,
    });
    for (const key of ["first", "second", "third"]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.2, 1.1), baseMat);
      b.position.copy(BASES[key]).setY(0.12);
      b.castShadow = true;
      this.scene.add(b);
    }
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8, 0.8, 0.1, 5),
      baseMat,
    );
    plate.position.set(0, 0.06, 0.4);
    this.scene.add(plate);

    // Foul lines (chalk).
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    for (const sign of [1, -1]) {
      const line = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.02, FENCE_RADIUS * 1.45),
        lineMat,
      );
      line.position.set(0, 0.05, 0);
      line.rotation.y = sign * (Math.PI / 4);
      // shift so the line emanates from home toward the corner
      line.position.x = sign * (FENCE_RADIUS * 0.51);
      line.position.z = -(FENCE_RADIUS * 0.51);
      this.scene.add(line);
    }
  }

  _buildStadium() {
    // Outfield wall: a curved arc of fence around the field.
    const wall = new THREE.Mesh(
      new THREE.CylinderGeometry(
        FENCE_RADIUS,
        FENCE_RADIUS,
        FENCE_HEIGHT,
        64,
        1,
        true,
        -Math.PI * 0.75,
        Math.PI * 1.5,
      ),
      new THREE.MeshStandardMaterial({
        color: 0x0d3b16,
        side: THREE.DoubleSide,
        roughness: 0.9,
      }),
    );
    wall.position.set(0, FENCE_HEIGHT / 2, 0);
    wall.castShadow = true;
    this.scene.add(wall);

    // Yellow padding stripe on top of the wall.
    const top = new THREE.Mesh(
      new THREE.CylinderGeometry(
        FENCE_RADIUS + 0.05,
        FENCE_RADIUS + 0.05,
        0.4,
        64,
        1,
        true,
        -Math.PI * 0.75,
        Math.PI * 1.5,
      ),
      new THREE.MeshStandardMaterial({
        color: 0xffd54f,
        side: THREE.DoubleSide,
        emissive: 0x4a3a00,
      }),
    );
    top.position.set(0, FENCE_HEIGHT, 0);
    this.scene.add(top);

    // Tiered stands: concentric rings of "seats" (instanced boxes) + crowd specks.
    const seatMat = new THREE.MeshStandardMaterial({
      color: 0x243042,
      roughness: 1,
    });
    for (let tier = 0; tier < 4; tier++) {
      const r = FENCE_RADIUS + 10 + tier * 9;
      const h = 6 + tier * 5;
      const ring = new THREE.Mesh(
        new THREE.CylinderGeometry(
          r,
          r - 6,
          5,
          64,
          1,
          true,
          -Math.PI * 0.85,
          Math.PI * 1.7,
        ),
        seatMat,
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

  _buildCrowd() {
    // Thousands of tiny colored points to read as a packed crowd.
    const COUNT = 6000;
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
      new THREE.PointsMaterial({ size: 1.1, vertexColors: true }),
    );
    this.scene.add(this.crowd);
  }

  _buildBall() {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 16, 16),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        emissive: 0x111111,
        roughness: 0.4,
      }),
    );
    ball.castShadow = true;

    // A glowing trail (line) we update as the ball flies.
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

  // Build a stylized player figure (group) in a team's colors.
  makePlayer(team) {
    const t = TEAMS[team];
    const g = new THREE.Group();
    const skin = new THREE.MeshStandardMaterial({ color: 0xe0a878 });
    const jersey = new THREE.MeshStandardMaterial({
      color: t.color,
      roughness: 0.6,
    });
    const pants = new THREE.MeshStandardMaterial({ color: 0xf2f2f2 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 8), jersey);
    torso.position.y = 1.5;
    torso.castShadow = true;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 16), skin);
    head.position.y = 2.25;
    head.castShadow = true;
    g.add(head);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.32, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: t.accent }),
    );
    cap.position.y = 2.34;
    g.add(cap);

    const legGeo = new THREE.CapsuleGeometry(0.18, 0.7, 4, 8);
    for (const sx of [-0.2, 0.2]) {
      const leg = new THREE.Mesh(legGeo, pants);
      leg.position.set(sx, 0.6, 0);
      leg.castShadow = true;
      g.add(leg);
    }

    // Arms — kept as a reference so we can swing/throw procedurally.
    const armGeo = new THREE.CapsuleGeometry(0.13, 0.6, 4, 8);
    const rArm = new THREE.Mesh(armGeo, jersey);
    rArm.position.set(0.5, 1.6, 0);
    g.add(rArm);
    const lArm = new THREE.Mesh(armGeo, jersey);
    lArm.position.set(-0.5, 1.6, 0);
    g.add(lArm);
    g.userData.rArm = rArm;
    g.userData.lArm = lArm;

    return g;
  }

  // Smoothly chase the active camera preset each frame.
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
      // collapse the trail onto the ball so it doesn't streak on reappear
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
    // shift history back by one and write the head
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
