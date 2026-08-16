import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuildingModel, Mapping, ProjectData } from '../types';
import { CATEGORY_COLORS, CATEGORY_LABELS } from '../types';
import { elementStatusAt, elementVarianceAt } from '../sim/status';

const ACTIVE_COLOR = 0xfab219; // in-progress "under construction" yellow
const GHOST_COLOR = 0x3a3a38;
const SELECT_EMISSIVE = 0x1c5cab;

// Status palette (fixed, reserved): ahead/on plan, slightly behind, behind
const VAR_GOOD = 0x0ca30c;
const VAR_WARN = 0xfab219;
const VAR_CRIT = 0xd03b3b;

interface ViewerProps {
  model: BuildingModel | null;
  project: ProjectData | null;
  mapping: Mapping;
  currentDate: Date;
  showGhost: boolean;
  varianceMode: boolean;
  selectedElementIds: Set<string>;
  onPickElement: (id: string | null) => void;
}

interface ElementMesh {
  mesh: THREE.Mesh;
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
  selectedElementIds,
  onPickElement,
}: ViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const meshesRef = useRef<Map<string, ElementMesh>>(new Map());
  const groupRef = useRef<THREE.Group | null>(null);
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
    scene.background = new THREE.Color(0x0d0d0d);
    scene.fog = new THREE.Fog(0x0d0d0d, 180, 420);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
    camera.position.set(58, 42, 66);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 8, 0);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.05;

    scene.add(new THREE.HemisphereLight(0xbdd3e6, 0x2a2a26, 0.9));
    const sun = new THREE.DirectionalLight(0xfff2dc, 1.6);
    sun.position.set(60, 90, 30);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(260, 48),
      new THREE.MeshStandardMaterial({ color: 0x161614, roughness: 1 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.35;
    scene.add(ground);

    const grid = new THREE.GridHelper(240, 48, 0x2c2c2a, 0x232321);
    grid.position.y = -0.34;
    scene.add(grid);

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
      const visible = group.children.filter((c) => c.visible);
      const hits = raycasterRef.current.intersectObjects(visible, false);
      const hit = hits.find((h) => {
        const m = h.object as THREE.Mesh;
        return !(m.material as THREE.MeshStandardMaterial).wireframe; // ignore ghosts
      });
      return hit ? ((hit.object as THREE.Mesh).userData.elementId as string) : null;
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
    const animate = () => {
      raf = requestAnimationFrame(animate);
      controls.update();
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
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
    }
    meshesRef.current.clear();
    if (!model) return;

    const group = new THREE.Group();
    for (const el of model.elements) {
      const geo = new THREE.BoxGeometry(el.w, el.h, el.d);
      // Anchor the box at its bottom so vertical growth looks like construction.
      geo.translate(0, el.h / 2, 0);

      const doneMaterial = new THREE.MeshStandardMaterial({
        color: new THREE.Color(CATEGORY_COLORS[el.category]),
        roughness: el.category === 'envelope' ? 0.25 : 0.85,
        metalness: el.category === 'structure' ? 0.35 : 0.05,
        transparent: el.category === 'envelope',
        opacity: el.category === 'envelope' ? 0.75 : 1,
      });
      const activeMaterial = new THREE.MeshStandardMaterial({
        color: ACTIVE_COLOR,
        emissive: 0x664400,
        roughness: 0.6,
        transparent: true,
        opacity: 0.92,
      });
      const ghostMaterial = new THREE.MeshStandardMaterial({
        color: GHOST_COLOR,
        wireframe: true,
        transparent: true,
        opacity: 0.22,
      });

      const mesh = new THREE.Mesh(geo, ghostMaterial);
      mesh.position.set(el.x, el.y, el.z);
      mesh.userData.elementId = el.id;
      group.add(mesh);
      meshesRef.current.set(el.id, { mesh, doneMaterial, activeMaterial, ghostMaterial });
    }
    scene.add(group);
    groupRef.current = group;
  }, [model]);

  // Drive element visibility/growth/coloring from the simulation date
  useEffect(() => {
    if (!model || !project) return;
    const taskByUid = new Map(project.tasks.map((t) => [t.uid, t]));
    for (const el of model.elements) {
      const entry = meshesRef.current.get(el.id);
      if (!entry) continue;
      const status = elementStatusAt(el, taskByUid, mapping, currentDate, project.start, project.finish);
      const { mesh } = entry;
      const selected = selectedElementIds.has(el.id);

      let material: THREE.MeshStandardMaterial;
      if (status.state === 'future') {
        mesh.visible = showGhost || selected;
        material = entry.ghostMaterial;
        mesh.scale.y = 1;
      } else if (status.state === 'active') {
        mesh.visible = true;
        material = entry.activeMaterial;
        mesh.scale.y = Math.max(0.04, status.progress);
      } else {
        mesh.visible = true;
        material = entry.doneMaterial;
        mesh.scale.y = 1;
      }

      // Variance overlay: recolor started elements by recorded-%-complete vs plan
      if (varianceMode && status.state !== 'future') {
        const v = elementVarianceAt(el, taskByUid, mapping, currentDate);
        if (v !== null) {
          material = status.state === 'done' ? entry.doneMaterial : entry.activeMaterial;
          material.color.setHex(v >= -0.05 ? VAR_GOOD : v >= -0.2 ? VAR_WARN : VAR_CRIT);
        }
      } else {
        entry.doneMaterial.color.set(CATEGORY_COLORS[el.category]);
        entry.activeMaterial.color.setHex(ACTIVE_COLOR);
      }

      material.emissive.setHex(
        selected ? SELECT_EMISSIVE : material === entry.activeMaterial ? 0x664400 : 0x000000,
      );
      mesh.material = material;
    }
  }, [model, project, mapping, currentDate, showGhost, varianceMode, selectedElementIds]);

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
