import type { BuildingElement, ElementCategory, Mapping, Task } from '../types';

const CATEGORY_KEYWORDS: Record<ElementCategory, RegExp> = {
  site: /\b(site|sitework|grading|excavat|earthwork|utilit|paving|asphalt|landscap|mobiliz|demolition|demo)\b/i,
  foundation: /\b(foundation|footing|pier|caisson|pile|grade beam|slab[- ]on[- ]grade|sog|underslab|waterproofing)\b/i,
  structure: /\b(steel|structure|structural|frame|framing|erect|column|beam|deck|elevated slab|topping|shear|precast|tilt[- ]up|concrete)\b/i,
  envelope: /\b(envelope|fa[cç]ade|curtain ?wall|exterior wall|glazing|window|storefront|masonry|brick|cmu|siding|cladding|panel)\b/i,
  roof: /\b(roof|roofing|membrane|coping|parapet)\b/i,
  interior: /\b(interior|drywall|gypsum|partition|stud|paint|floor|flooring|tile|carpet|ceiling|act\b|casework|millwork|finish|door|trim)\b/i,
  mep: /\b(mep|mechanical|electrical|plumbing|hvac|fire protection|sprinkler|duct|ductwork|piping|conduit|rough[- ]?in|equipment|ahu|switchgear|elevator)\b/i,
};

// Order matters: more specific trades win over the broad "structure"/"interior" nets.
const CATEGORY_ORDER: ElementCategory[] = [
  'foundation',
  'roof',
  'envelope',
  'mep',
  'site',
  'interior',
  'structure',
];

export function categorizeTask(name: string): ElementCategory | null {
  for (const cat of CATEGORY_ORDER) {
    if (CATEGORY_KEYWORDS[cat].test(name)) return cat;
  }
  return null;
}

export function taskLevel(name: string): number | null {
  const m =
    name.match(/\blevel\s*(\d+)/i) ||
    name.match(/\bl(\d+)\b/i) ||
    name.match(/\b(\d+)(?:st|nd|rd|th)\s*floor\b/i) ||
    name.match(/\bfloor\s*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Links schedule tasks to model elements by trade category and level.
 * A task with no detectable level drives that category on every level.
 */
export function autoMap(tasks: Task[], elements: BuildingElement[]): Mapping {
  const leaf = tasks.filter((t) => !t.summary && !t.milestone);
  const classified = leaf
    .map((t) => ({ task: t, category: categorizeTask(t.name), level: taskLevel(t.name) }))
    .filter((c) => c.category !== null) as {
    task: Task;
    category: ElementCategory;
    level: number | null;
  }[];

  const mapping: Mapping = {};
  for (const el of elements) {
    const matches = classified.filter((c) => {
      if (c.category !== el.category) return false;
      if (c.level === null || el.level === null) return true;
      return c.level === el.level;
    });
    if (matches.length > 0) {
      mapping[el.id] = matches.map((m) => m.task.uid);
    }
  }
  return mapping;
}
