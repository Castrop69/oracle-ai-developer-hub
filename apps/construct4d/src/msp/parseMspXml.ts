import type { ProjectData, Task } from '../types';

/**
 * Parses a Microsoft Project XML export (File > Save As > XML Format).
 * Works with the http://schemas.microsoft.com/project namespace by matching
 * on localName, so it tolerates namespace variations across Project versions.
 */
export function parseMspXml(xmlText: string): ProjectData {
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error('Not valid XML. Export from Microsoft Project with File > Save As > XML Format (*.xml).');
  }

  const root = doc.documentElement;
  if (root.localName !== 'Project') {
    throw new Error('XML root is not <Project>. This does not look like a Microsoft Project XML export.');
  }

  const childText = (el: Element, name: string): string | null => {
    for (const child of Array.from(el.children)) {
      if (child.localName === name) return child.textContent;
    }
    return null;
  };

  const projectName =
    childText(root, 'Title') || childText(root, 'Name') || 'Untitled Project';

  const tasksEl = Array.from(root.children).find((c) => c.localName === 'Tasks');
  if (!tasksEl) throw new Error('No <Tasks> section found in the Project XML.');

  const tasks: Task[] = [];
  for (const taskEl of Array.from(tasksEl.children)) {
    if (taskEl.localName !== 'Task') continue;

    const name = childText(taskEl, 'Name')?.trim();
    const uid = Number(childText(taskEl, 'UID'));
    // UID 0 is MS Project's hidden project-summary task; skip it and blanks.
    if (!name || !Number.isFinite(uid) || uid === 0) continue;

    const active = childText(taskEl, 'Active');
    if (active === '0') continue; // inactivated tasks don't build anything

    const startStr = childText(taskEl, 'Start');
    const finishStr = childText(taskEl, 'Finish');
    if (!startStr || !finishStr) continue;
    const start = new Date(startStr);
    const finish = new Date(finishStr);
    if (isNaN(start.getTime()) || isNaN(finish.getTime())) continue;

    const predecessors: number[] = [];
    for (const child of Array.from(taskEl.children)) {
      if (child.localName === 'PredecessorLink') {
        const p = Number(
          Array.from(child.children).find((c) => c.localName === 'PredecessorUID')?.textContent,
        );
        if (Number.isFinite(p)) predecessors.push(p);
      }
    }

    tasks.push({
      uid,
      id: Number(childText(taskEl, 'ID') ?? uid),
      name,
      wbs: childText(taskEl, 'WBS') ?? '',
      outlineLevel: Number(childText(taskEl, 'OutlineLevel') ?? 1),
      summary: childText(taskEl, 'Summary') === '1',
      milestone: childText(taskEl, 'Milestone') === '1',
      start,
      finish,
      percentComplete: Number(childText(taskEl, 'PercentComplete') ?? 0),
      predecessors,
    });
  }

  if (tasks.length === 0) {
    throw new Error('No usable tasks found in the Project XML.');
  }

  tasks.sort((a, b) => a.id - b.id);
  const start = new Date(Math.min(...tasks.map((t) => t.start.getTime())));
  const finish = new Date(Math.max(...tasks.map((t) => t.finish.getTime())));

  return { name: projectName, tasks, start, finish };
}
