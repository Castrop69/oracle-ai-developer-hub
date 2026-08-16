import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import type { BuildingModel, ElementCategory, Mapping, ProjectData } from '../types';
import { CATEGORY_LABELS } from '../types';
import { elementStatusAt, elementVarianceAt, excavationClosureAt } from '../sim/status';

const ACTIVE_COLOR = 0xfab219; // in-progress "under construction" yellow
const SELECT_EMISSIVE = 0x1c5cab;

// Status palette (fixed, reserved): ahead/on plan, slightly behind, behind
const VAR_GOOD = 0x0ca30c;
const VAR_WARN = 0xfab219;
const VAR_CRIT = 0xd03b3b;

/** Completed-element PBR materials per trade. */
const CATEGORY_MATERIALS: Record<
  ElementCategory,
  { color: number; roughness: number; metalness: number; opacity?: number }
> = {
  excavation: { color: 0x4a3e2e, roughness: 1.0, metalness: 0.0, opacity: 0.45 },
  site: { color: 0x5c6653, roughness: 0.95, metalness: 0.0 },
  foundation: { color: 0x807d75, roughness: 0.9, metalness: 0.02 },
  structure: { color: 0xb9bec8, roughness: 0.38, metalness: 0.55 },
  envelope: { color: 0x8fb8dd, roughness: 0.12, metalness: 0.85, opacity: 0.55 },
  roof: { color: 0x57534c, roughness: 0.85, metalness: 0.05 },
  interior: { color: 0xd8cca8, roughness: 0.8, metalness: 0.0 },
  mep: { color: 0xd95926, roughness: 0.5, metalness: 0.25 },
};

interface ViewerProps {
  model: BuildingModel | null;
  project: ProjectData | null;
  mapping: Mapping;
  currentDate: Date;
  showGhost: boolean;
  varianceMode: boolean;
  xray: boolean;
  selectedElementIds: Set<string>;
  onPickElement: (id: string | null) => void;
}

interface ElementMesh {
  mesh: THREE.Mesh;
  edges: THREE.LineSegments;
  edgeMaterial: THREE.LineBasicMaterial;
  doneMaterial: THREE.MeshStandardMaterial;
  activeMaterial: THREE.MeshStandardMaterial;
  ghostMaterial: THREE.MeshStandardMaterial;
}

interface HoverInfo {
  x: number;
  y: number;
  title: string;
  lines: string[];
}

export function Viewer({
  model,
  project,
  mapping,
  currentDate,
  showGhost,
  varianceMode,
  xray,
  selectedElementIds,
  onPickElement,
}: ViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshesRef = useRef<Map<string, ElementMesh>>(new Map());
  const activeMaterialsRef = useRef<Set<THREE.MeshStandardMaterial>>(new Set());
  const groupRef = useRef<THREE.Group | null>(null);
  const groundRef = useRef<THREE.Mesh | null>(null);
  const gridRef = useRef<THREE.GridHelper | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const [hover, setHover] = useState<HoverInfo | null>(null);

  // Latest data for event handlers without re-binding listeners
  const pickCtxRef = useRef({ model, project, mapping, currentDate, onPickElement });
  pickCtxRef.current = { model, project, mapping, currentDate, onPickElement };

  // Scene bootstrap
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    // Subtle vertical gradient sky, dusk-blue over near-black
    const skyCanvas = document.createElement('canvas');
    skyCanvas.width = 2;
    skyCanvas.height = 512;
    const skyCtx = skyCanvas.getContext('2d')!;
    const grad = skyCtx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0, '#12161f');
    grad.addColorStop(0.55, '#0d0f14');
    grad.addColorStop(1, '#0a0a0c');
    skyCtx.fillStyle = grad;
    skyCtx.fillRect(0, 0, 2, 512);
    const skyTex = new THREE.CanvasTexture(skyCanvas);
    skyTex.colorSpace = THREE.SRGBColorSpace;
    scene.background = skyTex;
    scene.fog = new THREE.Fog(0x0c0e12, 190, 460);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 1200);
    camera.position.set(58, 40, 68);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    mount.appendChild(renderer.domElement);

    // Image-based lighting so metals and glass pick up believable reflections
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.maxPolarAngle = Math.PI / 2.05;
    controls.minDistance = 12;
    controls.maxDistance = 320;
    controlsRef.current = controls;

    scene.add(new THREE.HemisphereLight(0x9db8d4, 0x24231f, 0.5));

    const sun = new THREE.DirectionalLight(0xffe8c4, 2.4);
    sun.position.set(70, 95, 40);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -90;
    sun.shadow.camera.right = 90;
    sun.shadow.camera.top = 90;
    sun.shadow.camera.bottom = -90;
    sun.shadow.camera.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    scene.add(sun);

    const rim = new THREE.DirectionalLight(0x6d8fc4, 0.5);
    rim.position.set(-60, 40, -50);
    scene.add(rim);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(300, 64),
      new THREE.MeshStandardMaterial({ color: 0x131311, roughness: 1, transparent: true }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.36;
    ground.receiveShadow = true;
    scene.add(ground);
    groundRef.current = ground;

    const grid = new THREE.GridHelper(260, 52, 0x2a2a28, 0x1f1f1d);
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.5;
    grid.position.y = -0.35;
    scene.add(grid);
    gridRef.current = grid;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    // --- Picking ---
    const intersectAt = (clientX: number, clientY: number): string | null => {
      const group = groupRef.current;
      const cam = cameraRef.current;
      if (!group || !cam) return null;
      const rect = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        -((clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycasterRef.current.setFromCamera(ndc, cam);
      const candidates = group.children.filter(
        (c) => c.visible && c instanceof THREE.Mesh && !c.userData.ghost,
      );
      const hits = raycasterRef.current.intersectObjects(candidates, false);
      return hits.length ? ((hits[0].object as THREE.Mesh).userData.elementId as string) : null;
    };

    let downPos: { x: number; y: number } | null = null;
    const onDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      // Only treat as a click if the pointer didn't orbit the camera
      if (!downPos || Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 5) return;
      pickCtxRef.current.onPickElement(intersectAt(e.clientX, e.clientY));
    };

    let hoverPending = false;
    const onMove = (e: PointerEvent) => {
      if (hoverPending) return;
      hoverPending = true;
      requestAnimationFrame(() => {
        hoverPending = false;
        const { model, project, mapping, currentDate } = pickCtxRef.current;
        const id = intersectAt(e.clientX, e.clientY);
        if (!id || !model || !project) {
          setHover(null);
          renderer.domElement.style.cursor = '';
          return;
        }
        renderer.domElement.style.cursor = 'pointer';
        const el = model.elements.find((x) => x.id === id);
        if (!el) {
          setHover(null);
          return;
        }
        const taskByUid = new Map(project.tasks.map((t) => [t.uid, t]));
        const status = elementStatusAt(el, taskByUid, mapping, currentDate, project.start, project.finish);
        const taskNames = (mapping[id] ?? [])
          .map((uid) => taskByUid.get(uid)?.name)
          .filter(Boolean) as string[];
        const lines = [
          `${CATEGORY_LABELS[el.category]}${el.level ? ` · Level ${el.level}` : ''} — ${
            status.state === 'future' ? 'not started' : status.state === 'done' ? 'complete' : `${Math.round(status.progress * 100)}% built`
          }`,
          ...(taskNames.length
            ? taskNames.slice(0, 4).map((n) => `⟶ ${n}`)
            : ['No linked schedule tasks']),
        ];
        if (taskNames.length > 4) lines.push(`…and ${taskNames.length - 4} more`);
        setHover({ x: e.clientX, y: e.clientY, title: el.name, lines });
      });
    };
    const onLeave = () => setHover(null);

    renderer.domElement.addEventListener('pointerdown', onDown);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerleave', onLeave);

    let raf = 0;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
      // Breathing glow on in-progress work
      const pulse = 0.45 + 0.3 * Math.sin(clock.getElapsedTime() * 2.4);
      for (const m of activeMaterialsRef.current) m.emissiveIntensity = pulse;
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onDown);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerleave', onLeave);
      controls.dispose();
      pmrem.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
      sceneRef.current = null;
    };
  }, []);

  // (Re)build element meshes when the model changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (groupRef.current) {
      scene.remove(groupRef.current);
      groupRef.current.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.LineSegments) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    }
    meshesRef.current.clear();
    activeMaterialsRef.current.clear();
    if (!model) return;

    const group = new THREE.Group();
    for (const el of model.elements) {
      const geo = new THREE.BoxGeometry(el.w, el.h, el.d);
      // Anchor so growth reads as construction: bottom-anchored boxes rise,
      // top-anchored boxes (excavation, drilled piers) dig downward.
      const digsDown = el.growth === 'down';
      geo.translate(0, digsDown ? -el.h / 2 : el.h / 2, 0);

      const spec = CATEGORY_MATERIALS[el.category];
      const doneMaterial = new THREE.MeshStandardMaterial({
        color: spec.color,
        roughness: spec.roughness,
        metalness: spec.metalness,
        transparent: spec.opacity !== undefined,
        opacity: spec.opacity ?? 1,
      });
      const activeMaterial = new THREE.MeshStandardMaterial({
        color: ACTIVE_COLOR,
        emissive: 0x8a5a00,
        emissiveIntensity: 0.5,
        roughness: 0.55,
        metalness: 0.1,
        transparent: true,
        opacity: 0.95,
      });
      const ghostMaterial = new THREE.MeshStandardMaterial({
        color: 0x30302d,
        transparent: true,
        opacity: 0.05,
        depthWrite: false,
      });

      if (el.category === 'excavation') {
        // The pit is a translucent cut volume: no shadow, and no depth write so
        // the piers and footings inside it stay visible.
        doneMaterial.depthWrite = false;
        activeMaterial.depthWrite = false;
        activeMaterial.opacity = 0.5;
      }

      const mesh = new THREE.Mesh(geo, ghostMaterial);
      mesh.position.set(el.x, digsDown ? el.y + el.h : el.y, el.z);
      mesh.castShadow = el.category !== 'excavation';
      mesh.receiveShadow = true;
      mesh.userData.elementId = el.id;
      mesh.userData.noShadow = el.category === 'excavation';

      // Crisp box edges — doubles as the clean "ghost" outline for future work
      const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x52514e,
        transparent: true,
        opacity: 0.35,
      });
      const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), edgeMaterial);
      mesh.add(edges);

      group.add(mesh);
      meshesRef.current.set(el.id, {
        mesh,
        edges,
        edgeMaterial,
        doneMaterial,
        activeMaterial,
        ghostMaterial,
      });
    }
    scene.add(group);
    groupRef.current = group;
  }, [model]);

  // Drive element visibility/growth/coloring from the simulation date
  useEffect(() => {
    if (!model || !project) return;
    const taskByUid = new Map(project.tasks.map((t) => [t.uid, t]));
    const closure = excavationClosureAt(project.tasks, currentDate);
    activeMaterialsRef.current.clear();

    for (const el of model.elements) {
      const entry = meshesRef.current.get(el.id);
      if (!entry) continue;
      const status = elementStatusAt(el, taskByUid, mapping, currentDate, project.start, project.finish);
      const { mesh, edges, edgeMaterial } = entry;
      const selected = selectedElementIds.has(el.id);

      let material: THREE.MeshStandardMaterial;
      if (status.state === 'future') {
        mesh.visible = showGhost || selected;
        mesh.userData.ghost = true;
        mesh.castShadow = false;
        material = entry.ghostMaterial;
        mesh.scale.y = 1;
        edges.visible = true;
        edgeMaterial.color.setHex(selected ? SELECT_EMISSIVE : 0x4c4b47);
        edgeMaterial.opacity = selected ? 0.9 : 0.28;
      } else if (status.state === 'active') {
        mesh.visible = true;
        mesh.userData.ghost = false;
        mesh.castShadow = !mesh.userData.noShadow;
        material = entry.activeMaterial;
        mesh.scale.y = Math.max(0.04, status.progress);
        edges.visible = false;
        activeMaterialsRef.current.add(entry.activeMaterial);
      } else {
        mesh.visible = true;
        mesh.userData.ghost = false;
        mesh.castShadow = !mesh.userData.noShadow;
        material = entry.doneMaterial;
        mesh.scale.y = 1;
        edges.visible = true;
        edgeMaterial.color.setHex(selected ? 0x86b6ef : 0x0b0b0b);
        edgeMaterial.opacity = selected ? 0.9 : 0.18;
      }

      // Variance overlay: recolor started elements by recorded-%-complete vs plan
      if (varianceMode && status.state !== 'future') {
        const v = elementVarianceAt(el, taskByUid, mapping, currentDate);
        if (v !== null) {
          material.color.setHex(v >= -0.05 ? VAR_GOOD : v >= -0.2 ? VAR_WARN : VAR_CRIT);
        }
      } else if (status.state === 'done') {
        material.color.setHex(CATEGORY_MATERIALS[el.category].color);
      } else if (status.state === 'active') {
        material.color.setHex(ACTIVE_COLOR);
      }

      // Backfill: a finished pit closes up in normal view, stays a faint trace in x-ray
      if (el.category === 'excavation' && status.state === 'done') {
        const baseOpacity = xray ? 0.22 : 0.45;
        if (closure >= 0.999 && !xray) {
          mesh.visible = false;
        } else {
          entry.doneMaterial.opacity = Math.max(xray ? 0.08 : 0, baseOpacity * (1 - closure));
          if (!xray && entry.doneMaterial.opacity <= 0.01) mesh.visible = false;
        }
        edges.visible = mesh.visible;
        edgeMaterial.opacity = Math.min(edgeMaterial.opacity, 0.2);
      }

      material.emissive.setHex(
        selected ? SELECT_EMISSIVE : material === entry.activeMaterial ? 0x8a5a00 : 0x000000,
      );
      if (material !== entry.activeMaterial) material.emissiveIntensity = selected ? 0.8 : 1;
      mesh.material = material;
    }
  }, [model, project, mapping, currentDate, showGhost, varianceMode, xray, selectedElementIds]);

  // X-ray ground: fade the terrain and surface work so below-grade elements read
  useEffect(() => {
    const ground = groundRef.current;
    const grid = gridRef.current;
    const controls = controlsRef.current;
    if (ground) {
      (ground.material as THREE.MeshStandardMaterial).opacity = xray ? 0.12 : 1;
      ground.receiveShadow = !xray;
    }
    if (grid) grid.visible = !xray;
    if (controls) controls.maxPolarAngle = xray ? Math.PI * 0.62 : Math.PI / 2.05;
    if (!model) return;
    for (const el of model.elements) {
      const entry = meshesRef.current.get(el.id);
      if (!entry) continue;
      if (el.category === 'site') {
        entry.doneMaterial.transparent = true;
        entry.doneMaterial.opacity = xray ? 0.18 : 1;
        entry.doneMaterial.depthWrite = !xray;
        entry.activeMaterial.opacity = xray ? 0.25 : 0.95;
      }
    }
  }, [xray, model]);

  return (
    <div ref={mountRef} className="viewer-mount">
      {hover && (
        <div className="gantt-tooltip" style={{ left: hover.x + 14, top: hover.y + 14 }}>
          <div className="tt-title">{hover.title}</div>
          {hover.lines.map((l, i) => (
            <div key={i} className="tt-row">
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
