import type { BuildingElement, BuildingModel, Task } from '../types';
import { categorizeTask, taskLevel } from '../mapping/autoMap';

/**
 * Builds a massing model straight from the schedule when no drawings have been
 * interpreted yet: detects how many floors the task names mention and generates
 * foundations, framed levels, envelope, roof, interiors, MEP risers, and
 * sitework so every construction activity has geometry to animate.
 */
export function generateModelFromSchedule(tasks: Task[]): BuildingModel {
  const leaf = tasks.filter((t) => !t.summary && !t.milestone);

  let maxLevel = 1;
  const categories = new Set<string>();
  for (const t of leaf) {
    const lvl = taskLevel(t.name);
    if (lvl && lvl > maxLevel && lvl <= 60) maxLevel = lvl;
    const cat = categorizeTask(t.name);
    if (cat) categories.add(cat);
  }
  const levels = Math.max(1, maxLevel);

  const W = 42; // footprint width (m)
  const D = 26; // footprint depth (m)
  const FLOOR_H = 4;
  const SLAB_T = 0.35;

  const els: BuildingElement[] = [];
  const add = (e: Omit<BuildingElement, 'id'> & { id?: string }) =>
    els.push({ ...e, id: e.id ?? `el-${els.length}` });

  // --- Sitework ---
  add({ name: 'Site pad / grading', category: 'site', level: null, x: 0, y: -0.3, z: 0, w: W + 36, d: D + 30, h: 0.3 });
  add({ name: 'Parking & paving (north)', category: 'site', level: null, x: 0, y: 0, z: -(D / 2 + 11), w: W + 20, d: 12, h: 0.15 });
  add({ name: 'Site utilities corridor', category: 'site', level: null, x: -(W / 2 + 10), y: 0, z: 0, w: 6, d: D, h: 0.15 });

  // --- Foundations: perimeter grade beams + interior pad footings ---
  const gb = 0.9;
  add({ name: 'Grade beam (south)', category: 'foundation', level: null, x: 0, y: -1.2, z: D / 2, w: W, d: gb, h: 1.2 });
  add({ name: 'Grade beam (north)', category: 'foundation', level: null, x: 0, y: -1.2, z: -D / 2, w: W, d: gb, h: 1.2 });
  add({ name: 'Grade beam (east)', category: 'foundation', level: null, x: W / 2, y: -1.2, z: 0, w: gb, d: D, h: 1.2 });
  add({ name: 'Grade beam (west)', category: 'foundation', level: null, x: -W / 2, y: -1.2, z: 0, w: gb, d: D, h: 1.2 });
  for (const gx of gridPositions(W, 6)) {
    for (const gz of gridPositions(D, 3)) {
      add({ name: 'Pad footing', category: 'foundation', level: null, x: gx, y: -1.0, z: gz, w: 1.6, d: 1.6, h: 1.0 });
    }
  }
  add({ name: 'Slab on grade', category: 'foundation', level: null, x: 0, y: 0, z: 0, w: W, d: D, h: SLAB_T });

  // --- Per level: columns, elevated slab, envelope, interiors, MEP ---
  for (let lvl = 1; lvl <= levels; lvl++) {
    const base = SLAB_T + (lvl - 1) * FLOOR_H;
    for (const gx of gridPositions(W, 6)) {
      for (const gz of gridPositions(D, 3)) {
        add({ name: `Column L${lvl}`, category: 'structure', level: lvl, x: gx, y: base, z: gz, w: 0.5, d: 0.5, h: FLOOR_H - SLAB_T });
      }
    }
    add({ name: `Elevated slab / deck L${lvl}`, category: 'structure', level: lvl, x: 0, y: base + FLOOR_H - SLAB_T, z: 0, w: W, d: D, h: SLAB_T });

    const wallH = FLOOR_H - SLAB_T;
    const t = 0.25;
    add({ name: `Envelope L${lvl} (south)`, category: 'envelope', level: lvl, x: 0, y: base, z: D / 2 + t / 2, w: W + t * 2, d: t, h: wallH });
    add({ name: `Envelope L${lvl} (north)`, category: 'envelope', level: lvl, x: 0, y: base, z: -(D / 2 + t / 2), w: W + t * 2, d: t, h: wallH });
    add({ name: `Envelope L${lvl} (east)`, category: 'envelope', level: lvl, x: W / 2 + t / 2, y: base, z: 0, w: t, d: D, h: wallH });
    add({ name: `Envelope L${lvl} (west)`, category: 'envelope', level: lvl, x: -(W / 2 + t / 2), y: base, z: 0, w: t, d: D, h: wallH });

    // Interior partitions: a corridor spine and cross walls
    add({ name: `Corridor walls L${lvl}`, category: 'interior', level: lvl, x: 0, y: base, z: 0, w: W - 6, d: 0.15, h: wallH - 0.6 });
    for (const gx of gridPositions(W - 8, 4)) {
      add({ name: `Partitions L${lvl}`, category: 'interior', level: lvl, x: gx, y: base, z: D / 4, w: 0.15, d: D / 2 - 2, h: wallH - 0.6 });
    }

    // MEP: core risers + overhead distribution
    add({ name: `MEP riser L${lvl}`, category: 'mep', level: lvl, x: W / 2 - 3, y: base, z: -(D / 2 - 3), w: 2.4, d: 2.4, h: FLOOR_H - SLAB_T });
    add({ name: `Overhead MEP L${lvl}`, category: 'mep', level: lvl, x: 0, y: base + wallH - 0.5, z: 0, w: W - 4, d: 1.4, h: 0.45 });
  }

  // --- Roof ---
  const roofBase = SLAB_T + levels * FLOOR_H;
  add({ name: 'Roof membrane', category: 'roof', level: null, x: 0, y: roofBase, z: 0, w: W + 0.6, d: D + 0.6, h: 0.25 });
  add({ name: 'Rooftop units & screen', category: 'roof', level: null, x: -W / 6, y: roofBase + 0.25, z: 0, w: 10, d: 6, h: 2.2 });

  return {
    elements: els,
    source: 'schedule',
    label: `Auto-massing — ${levels} level${levels > 1 ? 's' : ''}`,
  };
}

function gridPositions(span: number, bays: number): number[] {
  const pts: number[] = [];
  for (let i = 0; i <= bays; i++) pts.push(-span / 2 + (span / bays) * i);
  return pts;
}
