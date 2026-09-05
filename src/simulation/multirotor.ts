export type RotorThrusts = [number, number, number, number];

export type MultirotorAllocationInput = {
  collectiveThrustN: number;
  bodyTorqueNm: [number, number, number];
  armM: number;
  yawTorquePerThrustM: number;
  maxRotorThrustN: number;
};

export type MultirotorAllocation = {
  rotorThrustN: RotorThrusts;
  achievedCollectiveThrustN: number;
  achievedBodyTorqueNm: [number, number, number];
  saturated: boolean;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function quadrotorWrench(rotorThrustN: RotorThrusts, armM: number, yawTorquePerThrustM: number) {
  const arm = clamp(Math.abs(finite(armM, 0.2)), 0.01, 10);
  const yawK = clamp(Math.abs(finite(yawTorquePerThrustM, 0.015)), 1e-5, 2);
  const [fr, fl, rl, rr] = rotorThrustN.map((value) => Math.max(0, finite(value))) as RotorThrusts;
  return {
    collectiveThrustN: fr + fl + rl + rr,
    bodyTorqueNm: [
      arm * (-fr - fl + rl + rr),
      yawK * (fr - fl + rl - rr),
      arm * (fr - fl - rl + rr),
    ] as [number, number, number],
  };
}

/**
 * Bounded X-quad motor allocator.
 *
 * Rotor order is front-right, front-left, rear-left, rear-right. All rotors
 * thrust along body +Y. Alternating reaction torque signs provide yaw. The
 * returned achieved wrench is recomputed from the clamped rotor forces so the
 * physics engine and telemetry never claim an unavailable command.
 */
export function allocateQuadrotor(input: MultirotorAllocationInput): MultirotorAllocation {
  const arm = clamp(Math.abs(finite(input.armM, 0.2)), 0.01, 10);
  const yawK = clamp(Math.abs(finite(input.yawTorquePerThrustM, 0.015)), 1e-5, 2);
  const maxRotor = clamp(Math.abs(finite(input.maxRotorThrustN, 20)), 0, 1e6);
  const collective = clamp(finite(input.collectiveThrustN), 0, maxRotor * 4);
  const tx = finite(input.bodyTorqueNm[0]);
  const ty = finite(input.bodyTorqueNm[1]);
  const tz = finite(input.bodyTorqueNm[2]);
  const raw: RotorThrusts = [
    collective / 4 - tx / (4 * arm) + tz / (4 * arm) + ty / (4 * yawK),
    collective / 4 - tx / (4 * arm) - tz / (4 * arm) - ty / (4 * yawK),
    collective / 4 + tx / (4 * arm) - tz / (4 * arm) + ty / (4 * yawK),
    collective / 4 + tx / (4 * arm) + tz / (4 * arm) - ty / (4 * yawK),
  ];
  const rotorThrustN = raw.map((value) => clamp(finite(value), 0, maxRotor)) as RotorThrusts;
  const [fr, fl, rl, rr] = rotorThrustN;
  return {
    rotorThrustN,
    achievedCollectiveThrustN: fr + fl + rl + rr,
    achievedBodyTorqueNm: [
      arm * (-fr - fl + rl + rr),
      yawK * (fr - fl + rl - rr),
      arm * (fr - fl - rl + rr),
    ],
    saturated: raw.some((value, index) => Math.abs(value - rotorThrustN[index]) > 1e-9),
  };
}
