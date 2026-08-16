import type { BuildingElement, ElementStatus, Mapping, Task } from '../types';

/** Time-based progress of one task at simulation date t (planned dates). */
export function taskProgressAt(task: Task, t: Date): number {
  const start = task.start.getTime();
  const finish = task.finish.getTime();
  const now = t.getTime();
  if (now <= start) return 0;
  if (now >= finish) return 1;
  if (finish === start) return 1;
  return (now - start) / (finish - start);
}

/**
 * Element status = average progress of its linked tasks at date t.
 * Unlinked elements fall back to project-wide progress so nothing is stranded.
 */
export function elementStatusAt(
  el: BuildingElement,
  taskByUid: Map<number, Task>,
  mapping: Mapping,
  t: Date,
  projectStart: Date,
  projectFinish: Date,
): ElementStatus {
  const uids = mapping[el.id];
  let progress: number;
  if (uids && uids.length > 0) {
    let sum = 0;
    let n = 0;
    for (const uid of uids) {
      const task = taskByUid.get(uid);
      if (task) {
        sum += taskProgressAt(task, t);
        n++;
      }
    }
    progress = n > 0 ? sum / n : 0;
  } else {
    const span = projectFinish.getTime() - projectStart.getTime();
    progress = span > 0 ? clamp01((t.getTime() - projectStart.getTime()) / span) : 0;
  }

  if (progress <= 0.001) return { state: 'future', progress: 0 };
  if (progress >= 0.999) return { state: 'done', progress: 1 };
  return { state: 'active', progress };
}

/**
 * Schedule variance for an element at the simulation date: recorded
 * %-complete (from MS Project) minus planned progress at date t, averaged
 * over the linked tasks. Negative = behind plan. Returns null when the
 * element has no linked tasks to measure.
 */
export function elementVarianceAt(
  el: BuildingElement,
  taskByUid: Map<number, Task>,
  mapping: Mapping,
  t: Date,
): number | null {
  const uids = mapping[el.id];
  if (!uids || uids.length === 0) return null;
  let planned = 0;
  let actual = 0;
  let n = 0;
  for (const uid of uids) {
    const task = taskByUid.get(uid);
    if (!task) continue;
    planned += taskProgressAt(task, t);
    actual += clamp01(task.percentComplete / 100);
    n++;
  }
  if (n === 0) return null;
  return actual / n - planned / n;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}
