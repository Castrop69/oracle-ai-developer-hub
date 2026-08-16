export interface Task {
  uid: number;
  id: number;
  name: string;
  wbs: string;
  outlineLevel: number;
  summary: boolean;
  milestone: boolean;
  start: Date;
  finish: Date;
  percentComplete: number;
  predecessors: number[];
}

export interface ProjectData {
  name: string;
  tasks: Task[];
  start: Date;
  finish: Date;
  /** The original MSPDI XML text, kept so in-app edits can be exported back to MS Project. */
  rawXml: string;
}

/** In-app schedule overrides, keyed by task UID. */
export type ScheduleEdits = Record<number, { start?: Date; finish?: Date; percentComplete?: number }>;

export type ElementCategory =
  | 'excavation'
  | 'site'
  | 'foundation'
  | 'structure'
  | 'envelope'
  | 'roof'
  | 'interior'
  | 'mep';

/** Axis-aligned box element. x/z are plan center (m), y is bottom elevation (m). */
export interface BuildingElement {
  id: string;
  name: string;
  category: ElementCategory;
  level: number | null;
  x: number;
  y: number;
  z: number;
  w: number;
  d: number;
  h: number;
  /** 'up' (default) builds from the bottom; 'down' digs from the top (excavation, piers). */
  growth?: 'up' | 'down';
}

/** elementId -> task UIDs driving that element */
export type Mapping = Record<string, number[]>;

export interface BuildingModel {
  elements: BuildingElement[];
  source: 'schedule' | 'drawings';
  label: string;
}

export type ElementState = 'future' | 'active' | 'done';

export interface ElementStatus {
  state: ElementState;
  progress: number; // 0..1
}

export const CATEGORY_LABELS: Record<ElementCategory, string> = {
  excavation: 'Excavation',
  site: 'Sitework',
  foundation: 'Foundations',
  structure: 'Structure',
  envelope: 'Envelope',
  roof: 'Roof',
  interior: 'Interiors',
  mep: 'MEP',
};

/** Completed-element material colors for the 3D view (dark scene). */
export const CATEGORY_COLORS: Record<ElementCategory, string> = {
  excavation: '#4a3e2e',
  site: '#5f6553',
  foundation: '#84827b',
  structure: '#a7adb8',
  envelope: '#6f9fc9',
  roof: '#6d675f',
  interior: '#cec2a2',
  mep: '#d95926',
};
