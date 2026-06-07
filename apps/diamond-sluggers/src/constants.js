// constants.js — field geometry and tuning knobs shared by the renderer and
// the simulation. One unit = one meter. Home plate sits at the world origin,
// the outfield extends toward -Z, and the camera looks from +Z toward -Z
// (the classic "behind the batter" broadcast angle).

import { Vector3 } from "three";

// 90 ft ≈ 27.43 m between bases; projected onto X/Z that's 27.43/√2 each axis.
const B = 19.4;

export const BASES = {
  home: new Vector3(0, 0, 0),
  first: new Vector3(B, 0, -B),
  second: new Vector3(0, 0, -2 * B),
  third: new Vector3(-B, 0, -B),
};

// Ordered base-path loop a runner travels: home -> first -> second -> third -> home.
export const BASE_PATH = [
  BASES.home,
  BASES.first,
  BASES.second,
  BASES.third,
];

export const MOUND = new Vector3(0, 0.25, -18.44); // 60.5 ft from the plate
export const PLATE = new Vector3(0, 0, 0.4);

// Outfield fence: arc radius from home plate where a fly ball is a home run.
export const FENCE_RADIUS = 100;
export const FENCE_HEIGHT = 4;

// Foul lines run from home through first and third out to the fence.
export const FOUL_HALF_ANGLE = Math.PI / 4; // 45° each side of center (-Z)

export const PHYS = {
  gravity: 18, // arcade gravity — low enough that power swings carry the fence
  drag: 0.001, // per-frame velocity retention loss (small — it compounds at 60fps)
  restitution: 0.45, // ground bounce energy retained
};

// Strike zone in the X (horizontal) / Y (vertical) plane at the plate.
export const ZONE = {
  halfWidth: 0.6,
  bottom: 0.5,
  top: 1.8,
};

export const TEAMS = {
  away: { abbr: "AWY", color: 0x4fc3f7, accent: 0x0d2538 },
  home: { abbr: "HOM", color: 0xff5722, accent: 0x3a1405 },
};

export const INNINGS = 9;
