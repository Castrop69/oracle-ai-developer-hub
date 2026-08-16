import type { ProjectData, ScheduleEdits, Task } from '../types';

const DAY_MS = 86400000;

/**
 * Applies in-app overrides to the base schedule, then rolls summary-task dates
 * up from their descendants so the WBS bars stay honest.
 */
export function applyEdits(base: ProjectData, edits: ScheduleEdits): ProjectData {
  if (Object.keys(edits).length === 0) return base;

  const tasks = base.tasks.map((t) => {
    const e = edits[t.uid];
    if (!e) return t;
    return {
      ...t,
      start: e.start ?? t.start,
      finish: e.finish ?? t.finish,
      percentComplete: e.percentComplete ?? t.percentComplete,
    };
  });

  rollupSummaries(tasks);

  const leaf = tasks.filter((t) => !t.summary);
  const start = new Date(Math.min(...leaf.map((t) => t.start.getTime())));
  const finish = new Date(Math.max(...leaf.map((t) => t.finish.getTime())));
  return { ...base, tasks, start, finish };
}

/** Summary bars span their descendants (tasks are in outline order). */
function rollupSummaries(tasks: Task[]): void {
  for (let i = tasks.length - 1; i >= 0; i--) {
    const t = tasks[i];
    if (!t.summary) continue;
    let min = Infinity;
    let max = -Infinity;
    for (let j = i + 1; j < tasks.length && tasks[j].outlineLevel > t.outlineLevel; j++) {
      min = Math.min(min, tasks[j].start.getTime());
      max = Math.max(max, tasks[j].finish.getTime());
    }
    if (isFinite(min)) tasks[i] = { ...t, start: new Date(min), finish: new Date(max) };
  }
}

/**
 * Ripple: when a task's finish moves by delta, shift every transitive
 * successor (via predecessor links) by the same delta.
 */
export function rippleSuccessors(
  tasks: Task[],
  fromUid: number,
  deltaMs: number,
  edits: ScheduleEdits,
): ScheduleEdits {
  if (deltaMs === 0) return edits;
  const successors = new Map<number, number[]>();
  for (const t of tasks) {
    for (const p of t.predecessors) {
      const list = successors.get(p) ?? [];
      list.push(t.uid);
      successors.set(p, list);
    }
  }
  const byUid = new Map(tasks.map((t) => [t.uid, t]));
  const out = { ...edits };
  const visited = new Set<number>([fromUid]);
  const queue = [...(successors.get(fromUid) ?? [])];
  while (queue.length > 0) {
    const uid = queue.shift()!;
    if (visited.has(uid)) continue;
    visited.add(uid);
    const task = byUid.get(uid);
    if (!task || task.summary) continue;
    const cur = out[uid] ?? {};
    const start = cur.start ?? task.start;
    const finish = cur.finish ?? task.finish;
    out[uid] = {
      ...cur,
      start: new Date(start.getTime() + deltaMs),
      finish: new Date(finish.getTime() + deltaMs),
    };
    queue.push(...(successors.get(uid) ?? []));
  }
  return out;
}

/**
 * Writes the current (edited) dates back into the original MSPDI XML so the
 * file can be opened in Microsoft Project. Start/Finish/PercentComplete are
 * replaced per task by UID; Duration is recomputed as working hours (8h
 * weekdays) so Project honors the new finish dates.
 */
export function exportMspXml(project: ProjectData): string {
  const doc = new DOMParser().parseFromString(project.rawXml, 'application/xml');
  const byUid = new Map(project.tasks.map((t) => [t.uid, t]));

  const setChild = (el: Element, name: string, value: string) => {
    for (const child of Array.from(el.children)) {
      if (child.localName === name) {
        child.textContent = value;
        return;
      }
    }
  };

  const taskEls = Array.from(doc.getElementsByTagName('*')).filter((e) => e.localName === 'Task');
  for (const el of taskEls) {
    const uidText = Array.from(el.children).find((c) => c.localName === 'UID')?.textContent;
    const task = byUid.get(Number(uidText));
    if (!task) continue;
    setChild(el, 'Start', toMspDate(task.start));
    setChild(el, 'Finish', toMspDate(task.finish, true));
    setChild(el, 'PercentComplete', String(Math.round(task.percentComplete)));
    if (!task.summary && !task.milestone) {
      setChild(el, 'Duration', `PT${workingHours(task.start, task.finish)}H0M0S`);
    }
  }

  const root = doc.documentElement;
  setChild(root, 'StartDate', toMspDate(project.start));
  setChild(root, 'FinishDate', toMspDate(project.finish, true));

  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + new XMLSerializer().serializeToString(root);
}

function toMspDate(d: Date, endOfDay = false): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = endOfDay ? '17:00:00' : '08:00:00';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}`;
}

/** Approximate working hours between two dates: 8h per weekday. */
function workingHours(start: Date, finish: Date): number {
  let hours = 0;
  const d = new Date(start);
  d.setHours(12, 0, 0, 0);
  const end = new Date(finish);
  end.setHours(13, 0, 0, 0);
  while (d < end) {
    const day = d.getDay();
    if (day !== 0 && day !== 6) hours += 8;
    d.setTime(d.getTime() + DAY_MS);
  }
  return Math.max(8, hours);
}
