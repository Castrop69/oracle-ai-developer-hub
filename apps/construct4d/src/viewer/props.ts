import * as THREE from 'three';

/** Construction-site props that make the scene read as a live jobsite. */

const CRANE_YELLOW = 0xdca018;

/**
 * A tower crane. The returned group's userData.slew is the rotating part
 * (jib + counter-jib); spin it slowly in the render loop.
 */
export function buildCrane(hookHeight: number): THREE.Group {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: CRANE_YELLOW, roughness: 0.5, metalness: 0.45 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.7, metalness: 0.3 });

  const mastH = hookHeight;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, mastH, 1.4), steel);
  mast.position.y = mastH / 2;
  mast.castShadow = true;
  g.add(mast);
  // lattice hint: darker inner core
  const core = new THREE.Mesh(new THREE.BoxGeometry(0.9, mastH, 0.9), dark);
  core.position.y = mastH / 2;
  g.add(core);

  const slew = new THREE.Group();
  slew.position.y = mastH;
  g.add(slew);
  g.userData.slew = slew;

  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.8, 1.8), dark);
  cab.position.set(1.1, 0.6, 0);
  cab.castShadow = true;
  slew.add(cab);

  const jibLen = 26;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(jibLen, 0.85, 0.85), steel);
  jib.position.set(jibLen / 2 + 1, 1.6, 0);
  jib.castShadow = true;
  slew.add(jib);

  const cjLen = 8;
  const cjib = new THREE.Mesh(new THREE.BoxGeometry(cjLen, 0.8, 0.8), steel);
  cjib.position.set(-cjLen / 2 - 0.8, 1.6, 0);
  slew.add(cjib);

  const weight = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.0, 2.0), dark);
  weight.position.set(-cjLen - 0.6, 0.6, 0);
  weight.castShadow = true;
  slew.add(weight);

  const apexH = 4;
  const apex = new THREE.Mesh(new THREE.BoxGeometry(0.7, apexH, 0.7), steel);
  apex.position.set(0, apexH / 2 + 1.2, 0);
  slew.add(apex);

  // pendant cables + hook line
  const lineMat = new THREE.LineBasicMaterial({ color: 0x8f8f8a, transparent: true, opacity: 0.8 });
  const pts: THREE.Vector3[] = [
    new THREE.Vector3(0, apexH + 1.2, 0), new THREE.Vector3(jibLen * 0.65, 2.0, 0),
    new THREE.Vector3(0, apexH + 1.2, 0), new THREE.Vector3(-cjLen - 0.4, 2.0, 0),
    new THREE.Vector3(jibLen * 0.8, 1.2, 0), new THREE.Vector3(jibLen * 0.8, -9, 0),
  ];
  const cableGeo = new THREE.BufferGeometry().setFromPoints(pts);
  slew.add(new THREE.LineSegments(cableGeo, lineMat));

  const hook = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.7), dark);
  hook.position.set(jibLen * 0.8, -9.4, 0);
  slew.add(hook);

  return g;
}

/** A simple low-poly tree (trunk + stacked canopy cones). */
function buildTree(scale: number): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.14, 0.2, 1.4, 6),
    new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
  );
  trunk.position.y = 0.7;
  trunk.castShadow = true;
  g.add(trunk);
  const leaf = new THREE.MeshStandardMaterial({ color: 0x3f5a33, roughness: 0.95, flatShading: true });
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.5, 2.6, 7), leaf);
  c1.position.y = 2.4;
  c1.castShadow = true;
  g.add(c1);
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.0, 7), leaf);
  c2.position.y = 3.6;
  c2.castShadow = true;
  g.add(c2);
  g.scale.setScalar(scale);
  return g;
}

/** Ring of trees around the site; grown/shrunk by landscaping progress. */
export function buildTreeRing(rx: number, rz: number, count = 12): THREE.Group {
  const ring = new THREE.Group();
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + rand() * 0.4;
    const base = 0.9 + rand() * 0.7;
    const t = buildTree(base);
    t.userData.baseScale = base;
    t.position.set(Math.cos(a) * (rx + rand() * 8), 0, Math.sin(a) * (rz + rand() * 8));
    ring.add(t);
  }
  return ring;
}

/** Distant low-poly context buildings that fade into the fog for depth. */
export function buildContext(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x161920, roughness: 1 });
  let seed = 23;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rand() * 0.35;
    const r = 150 + rand() * 90;
    const w = 14 + rand() * 22;
    const h = 10 + rand() * 34;
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 12 + rand() * 18), mat);
    b.position.set(Math.cos(a) * r, h / 2 - 0.3, Math.sin(a) * r);
    b.rotation.y = rand() * Math.PI;
    g.add(b);
  }
  return g;
}
