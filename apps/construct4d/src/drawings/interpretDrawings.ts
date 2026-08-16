import Anthropic from '@anthropic-ai/sdk';
import type { BuildingElement, BuildingModel, ElementCategory } from '../types';

const MODEL = 'claude-opus-5';

const CATEGORIES: ElementCategory[] = [
  'site',
  'foundation',
  'structure',
  'envelope',
  'roof',
  'interior',
  'mep',
];

/** JSON schema Claude's response is constrained to (structured outputs). */
const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    building_name: { type: 'string' },
    summary: { type: 'string', description: 'Two or three sentences on what the drawings show.' },
    footprint: {
      type: 'object',
      properties: {
        width_m: { type: 'number' },
        depth_m: { type: 'number' },
      },
      required: ['width_m', 'depth_m'],
      additionalProperties: false,
    },
    levels: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          number: { type: 'integer' },
          name: { type: 'string' },
          floor_to_floor_m: { type: 'number' },
        },
        required: ['number', 'name', 'floor_to_floor_m'],
        additionalProperties: false,
      },
    },
    elements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          category: { type: 'string', enum: CATEGORIES },
          level: { type: ['integer', 'null'], description: 'Floor number, or null for site/foundation/roof scope.' },
          x_m: { type: 'number', description: 'Plan center X, meters, origin at building center.' },
          z_m: { type: 'number', description: 'Plan center Y (depth axis), meters, origin at building center.' },
          bottom_m: { type: 'number', description: 'Bottom elevation in meters above ground floor slab.' },
          width_m: { type: 'number' },
          depth_m: { type: 'number' },
          height_m: { type: 'number' },
        },
        required: ['name', 'category', 'level', 'x_m', 'z_m', 'bottom_m', 'width_m', 'depth_m', 'height_m'],
        additionalProperties: false,
      },
    },
  },
  required: ['building_name', 'summary', 'footprint', 'levels', 'elements'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT = `You are a construction drawing interpreter inside a 4D scheduling application.
You are given rendered sheets from a construction drawing set (plans, elevations, sections, structural or civil sheets).
Your job is to produce a simplified block model of the building that a scheduler can animate: every element is an axis-aligned box.

Rules:
- Read title blocks, grids, dimension strings, level datums, and schedules to establish real sizes. If the drawings are dimensioned in feet/inches, convert to meters.
- If overall dimensions are not legible, estimate from door widths (~0.9 m), parking stalls (~2.7 m), or grid spacing, and say so in the summary.
- Represent the building with 30–120 boxes: foundations (footings, grade beams, slab on grade), structure per level (columns as a representative grid, one slab/deck box per level), envelope as one wall box per face per level, roof, interior partitions as a few representative boxes per level, MEP as riser/shaft boxes, and site elements (pads, paving) when shown.
- Coordinates: X is plan width, Z is plan depth, origin at the building footprint center. bottom_m is meters above the ground-floor slab (foundations are negative).
- Assign every element the category that matches the trade that builds it.
- Name elements the way a scheduler would recognize them (e.g. "Elevated slab L2", "Curtain wall north L3").`;

export interface InterpretedBuilding {
  building_name: string;
  summary: string;
  footprint: { width_m: number; depth_m: number };
  levels: { number: number; name: string; floor_to_floor_m: number }[];
  elements: {
    name: string;
    category: ElementCategory;
    level: number | null;
    x_m: number;
    z_m: number;
    bottom_m: number;
    width_m: number;
    depth_m: number;
    height_m: number;
  }[];
}

export interface DrawingImage {
  data: string; // base64, no data: prefix
  mediaType: string;
}

/**
 * Sends drawing sheet images to Claude Opus 5 and returns a structured block
 * model. Runs directly from the browser with the user's API key.
 * Server-side refusal fallback is enabled so benign sheets that trip a safety
 * classifier are retried on a fallback model automatically.
 */
export async function interpretDrawings(
  apiKey: string,
  images: DrawingImage[],
  onProgress?: (msg: string) => void,
): Promise<{ building: InterpretedBuilding; model: BuildingModel }> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  onProgress?.(`Sending ${images.length} sheet${images.length > 1 ? 's' : ''} to Claude (${MODEL})…`);

  const content: Anthropic.ContentBlockParam[] = [
    ...images.map(
      (img): Anthropic.ImageBlockParam => ({
        type: 'image',
        source: {
          type: 'base64',
          media_type: img.mediaType as 'image/png',
          data: img.data,
        },
      }),
    ),
    {
      type: 'text',
      text: 'Interpret this drawing set and return the block model as JSON per the schema.',
    },
  ];

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema: OUTPUT_SCHEMA } },
  } as never);

  stream.on('text', () => onProgress?.('Claude is reading the drawings…'));
  const message = await stream.finalMessage();

  if (message.stop_reason === 'refusal') {
    throw new Error('Claude declined to interpret these sheets. Try different pages of the drawing set.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('The interpretation was truncated. Try sending fewer sheets at once.');
  }

  const text = message.content.find((b) => b.type === 'text')?.text;
  if (!text) throw new Error('Claude returned no interpretable content.');
  const building = JSON.parse(text) as InterpretedBuilding;

  const elements: BuildingElement[] = building.elements.map((e, i) => ({
    id: `dwg-${i}`,
    name: e.name,
    category: CATEGORIES.includes(e.category) ? e.category : 'structure',
    level: e.level,
    x: e.x_m,
    y: e.bottom_m,
    z: e.z_m,
    w: Math.max(0.05, e.width_m),
    d: Math.max(0.05, e.depth_m),
    h: Math.max(0.05, e.height_m),
  }));

  onProgress?.(`Interpreted "${building.building_name}" — ${elements.length} elements.`);

  return {
    building,
    model: { elements, source: 'drawings', label: `From drawings — ${building.building_name}` },
  };
}
