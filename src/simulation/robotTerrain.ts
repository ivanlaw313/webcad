export type RobotStabilityState = {
  fallenDurationS: number;
  maxTiltDeg: number;
  fallCount: number;
  wasFallen: boolean;
};

export type RobotStabilityOutput = RobotStabilityState & {
  uprightDot: number;
  tiltDeg: number;
  fallen: boolean;
  centerHeightM: number;
  horizontalSpeedMps: number;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Deterministic tile height used by both Rapier collider creation and tests. */
export function terrainTileHeightM(row: number, column: number, roughnessM: number, seed = 17) {
  const roughness = clamp(Math.abs(finite(roughnessM)), 0, 2);
  const hash = Math.sin((row * 127.1 + column * 311.7 + seed * 74.7)) * 43758.5453;
  return roughness * (0.15 + 0.85 * (hash - Math.floor(hash)));
}

export function stepRobotStability(input: {
  previous: RobotStabilityState;
  rotation: { x: number; y: number; z: number; w: number };
  centerHeightM: number;
  velocityMps: [number, number, number];
  minimumCenterHeightM: number;
  fallTiltDeg: number;
  dtS: number;
}): RobotStabilityOutput {
  const qx = finite(input.rotation.x), qz = finite(input.rotation.z);
  // Body-local +Y dotted with world +Y, directly from the quaternion matrix.
  const uprightDot = clamp(1 - 2 * (qx * qx + qz * qz), -1, 1);
  const tiltDeg = Math.acos(uprightDot) * 180 / Math.PI;
  const centerHeightM = finite(input.centerHeightM);
  const fallen = tiltDeg >= clamp(finite(input.fallTiltDeg, 60), 1, 179)
    || centerHeightM <= Math.max(0, finite(input.minimumCenterHeightM));
  const dt = clamp(finite(input.dtS), 0, 1);
  const fallCount = input.previous.fallCount + (fallen && !input.previous.wasFallen ? 1 : 0);
  return {
    uprightDot,
    tiltDeg,
    fallen,
    centerHeightM,
    horizontalSpeedMps: Math.hypot(finite(input.velocityMps[0]), finite(input.velocityMps[2])),
    fallenDurationS: fallen ? input.previous.fallenDurationS + dt : 0,
    maxTiltDeg: Math.max(finite(input.previous.maxTiltDeg), tiltDeg),
    fallCount,
    wasFallen: fallen,
  };
}
