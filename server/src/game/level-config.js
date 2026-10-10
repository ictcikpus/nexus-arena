export const MAX_PLAYERS = Math.max(2, Math.min(8, Number(process.env.MAX_PLAYERS) || 8));
export const MATCH_DURATION_SECONDS = 180;
export const MOVE_SPEED = 7.5;
export const SPRINT_SPEED = 9.3;
export const JUMP_VELOCITY = 11.0;
export const GRAVITY = 24.0;
export const TRACK_MIN_X = -6.85;
export const TRACK_MAX_X = 6.85;
export const TRACK_MIN_Z = -106;
export const TRACK_MAX_Z = 7;
export const FINISH_Z = -103;
export const CHECKPOINTS = [
  { z: -42, respawnZ: -42.5 },
  { z: -79, respawnZ: -79.5 }
];
export const GAPS = [
  { start: -38, end: -33 },
  { start: -75, end: -71 }
];
export const OBSTACLES = [
  { x: -4.2, z: -14, width: 5.5, depth: 1.25, height: 1.65 },
  { x: 4.2, z: -14, width: 5.5, depth: 1.25, height: 1.65 },
  { x: -2.6, z: -23, width: 8.6, depth: 1.25, height: 1.55 },
  { x: 5.4, z: -23, width: 3.1, depth: 1.25, height: 1.55 },
  { x: -6, z: -47, width: 2, depth: 1.25, height: 1.7 },
  { x: 2.35, z: -47, width: 9.2, depth: 1.25, height: 1.7 },
  { x: -4.2, z: -58, width: 5.5, depth: 1.25, height: 1.55 },
  { x: 4.2, z: -58, width: 5.5, depth: 1.25, height: 1.55 },
  { x: -2.6, z: -84, width: 8.6, depth: 1.25, height: 1.7 },
  { x: 5.4, z: -84, width: 3.1, depth: 1.25, height: 1.7 },
  { x: -4.2, z: -94, width: 5.5, depth: 1.25, height: 1.55 },
  { x: 4.2, z: -94, width: 5.5, depth: 1.25, height: 1.55 }
];
export function inGap(z) {
  return GAPS.some((gap) => z < gap.end && z > gap.start);
}
export function collidesWithObstacle(x, z, y) {
  return OBSTACLES.some((o) => y < o.height - 0.03 && Math.abs(x - o.x) < o.width / 2 + 0.42 && Math.abs(z - o.z) < o.depth / 2 + 0.45);
}
