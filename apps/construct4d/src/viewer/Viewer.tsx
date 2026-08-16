import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { BuildingModel, Mapping, ProjectData } from '../types';
import { CATEGORY_COLORS } from '../types';
import { elementStatusAt } from '../sim/status';

const ACTIVE_COLOR = 0xfab219; // in-progress "under construction" yellow
const GHOST_COLOR = 0x3a3a38;

interface ViewerProps {
  model: BuildingModel | null;
  project: ProjectData | null;
  mapping: Mapping;
  currentDate: Date;
  showGhost: boolean;
}

interface ElementMesh {
  mesh: THREE.Mesh;
  height: number;
  baseY: number;
  doneMaterial: THREE.MeshStandardMaterial;
  activeMaterial: THREE.MeshStandardMaterial;
  ghostMaterial: THREE.MeshStandardMaterial;
}

export function Viewer({ model, project, mapping, currentDate, showGhost }: ViewerProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const meshesRef = useRef<Map<string, ElementMesh>>(new Map());
  const groupRef = useRef<THREE.Group | null>(null);

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
      group.add(mesh);
      meshesRef.current.set(el.id, {
        mesh,
        height: el.h,
        baseY: el.y,
        doneMaterial,
        activeMaterial,
        ghostMaterial,
      });
    }
    scene.add(group);
    groupRef.current = group;
  }, [model]);

  // Drive element visibility/growth from the simulation date
  useEffect(() => {
    if (!model || !project) return;
    const taskByUid = new Map(project.tasks.map((t) => [t.uid, t]));
    for (const el of model.elements) {
      const entry = meshesRef.current.get(el.id);
      if (!entry) continue;
      const status = elementStatusAt(el, taskByUid, mapping, currentDate, project.start, project.finish);
      const { mesh } = entry;
      if (status.state === 'future') {
        mesh.visible = showGhost;
        mesh.material = entry.ghostMaterial;
        mesh.scale.y = 1;
      } else if (status.state === 'active') {
        mesh.visible = true;
        mesh.material = entry.activeMaterial;
        mesh.scale.y = Math.max(0.04, status.progress);
      } else {
        mesh.visible = true;
        mesh.material = entry.doneMaterial;
        mesh.scale.y = 1;
      }
    }
  }, [model, project, mapping, currentDate, showGhost]);

  return <div ref={mountRef} className="viewer-mount" />;
}
