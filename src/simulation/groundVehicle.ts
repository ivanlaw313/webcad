export type GroundVec3 = [number, number, number];

export type GroundVehicleInput = {
  massKg: number;
  gravityMps2: number;
  friction: number;
  velocityMps: GroundVec3;
  forwardWorld: GroundVec3;
  yawRateRadS: number;
  targetSpeedMps: number;
  maxDriveForceN: number;
  maxBrakeForceN: number;
  maxSteeringTorqueNm: number;
  steeringDeg: number;
  targetDirectionWorld?: GroundVec3 | null;
  grounded: boolean;
};

export type GroundVehicleOutput = {
  forceWorldN: GroundVec3;
  torqueWorldNm: GroundVec3;
  forwardSpeedMps: number;
  lateralSpeedMps: number;
  speedErrorMps: number;
  headingErrorDeg: number;
  driveForceN: number;
  lateralForceN: number;
  steeringTorqueNm: number;
  mechanicalPowerW: number;
  grounded: boolean;
};

const finite = (value: number, fallback = 0) =>
  Number.isFinite(value) ? value : fallback;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const clean = (value: number) => Math.abs(value) < 1e-12 ? 0 : value;

const horizontalUnit = (value: GroundVec3, fallback: GroundVec3): GroundVec3 => {
  const x = finite(value[0]);
  const z = finite(value[2]);
  const length = Math.hypot(x, z);
  if (length < 1e-9) return fallback;
  return [x / length, 0, z / length];
};

/**
 * Deterministic reduced-order ground-drive controller for a CAD rigid body.
 *
 * It does not fake wheel geometry. It applies bounded longitudinal traction,
 * braking, lateral tyre force and yaw torque to the real Rapier body. The
 * caller decides whether the body is touching drivable ground. Keeping this
 * calculation pure makes 120 Hz real-time and accelerated batches identical.
 */
export function stepGroundVehicleController(
  input: GroundVehicleInput,
): GroundVehicleOutput {
  const massKg = clamp(finite(input.massKg, 1), 0.001, 1e6);
  const gravity = Math.max(0, finite(input.gravityMps2));
  const friction = Math.max(0, finite(input.friction));
  const forward = horizontalUnit(input.forwardWorld, [1, 0, 0]);
  const right: GroundVec3 = [-forward[2], 0, forward[0]];
  const velocity: GroundVec3 = [
    finite(input.velocityMps[0]),
    finite(input.velocityMps[1]),
    finite(input.velocityMps[2]),
  ];
  const forwardSpeedMps = velocity[0] * forward[0] + velocity[2] * forward[2];
  const lateralSpeedMps = velocity[0] * right[0] + velocity[2] * right[2];
  const targetSpeedMps = clamp(finite(input.targetSpeedMps), -100, 100);
  const speedErrorMps = targetSpeedMps - forwardSpeedMps;

  const maxDriveForceN = Math.max(0, finite(input.maxDriveForceN));
  const maxBrakeForceN = Math.max(0, finite(input.maxBrakeForceN));
  const requestedLongitudinalForce = massKg * speedErrorMps * 2.5;
  const driveForceN = input.grounded
    ? clamp(requestedLongitudinalForce, -maxBrakeForceN, maxDriveForceN)
    : 0;

  // Coulomb traction limit keeps the reduced-order tyre model physically
  // bounded by the configured floor friction and normal load.
  const tractionLimitN = friction * massKg * gravity;
  const lateralForceN = input.grounded
    ? clamp(-lateralSpeedMps * massKg * 4, -tractionLimitN, tractionLimitN)
    : 0;

  const manualSteeringRad = clamp(finite(input.steeringDeg), -60, 60) * Math.PI / 180;
  const cos = Math.cos(manualSteeringRad);
  const sin = Math.sin(manualSteeringRad);
  const manualDirection: GroundVec3 = [
    forward[0] * cos + right[0] * sin,
    0,
    forward[2] * cos + right[2] * sin,
  ];
  const targetDirection = input.targetDirectionWorld
    ? horizontalUnit(input.targetDirectionWorld, manualDirection)
    : manualDirection;
  const headingCross = forward[0] * targetDirection[2] - forward[2] * targetDirection[0];
  const headingDot = clamp(
    forward[0] * targetDirection[0] + forward[2] * targetDirection[2],
    -1,
    1,
  );
  const headingErrorRad = Math.atan2(headingCross, headingDot);
  const maxSteeringTorqueNm = Math.max(0, finite(input.maxSteeringTorqueNm));
  const steeringTorqueNm = input.grounded
    ? clamp(
        // Rapier/Three positive world-Y rotation turns local +X toward -Z,
        // while our heading error is positive toward +Z. The applied torque
        // below is therefore negated; yaw damping must use the same sign here
        // as heading demand so the final world torque opposes angular velocity.
        massKg * (4 * headingErrorRad + 1.4 * finite(input.yawRateRadS)),
        -maxSteeringTorqueNm,
        maxSteeringTorqueNm,
      )
    : 0;

  return {
    forceWorldN: [
      clean(forward[0] * driveForceN + right[0] * lateralForceN),
      0,
      clean(forward[2] * driveForceN + right[2] * lateralForceN),
    ],
    torqueWorldNm: [0, clean(-steeringTorqueNm), 0],
    forwardSpeedMps,
    lateralSpeedMps,
    speedErrorMps,
    headingErrorDeg: headingErrorRad * 180 / Math.PI,
    driveForceN,
    lateralForceN,
    steeringTorqueNm,
    mechanicalPowerW: Math.abs(driveForceN * forwardSpeedMps),
    grounded: input.grounded,
  };
}
