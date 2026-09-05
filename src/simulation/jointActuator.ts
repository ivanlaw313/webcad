export type JointActuatorInput = {
  mode: "revolute" | "slider";
  targetVelocity: number;
  measuredVelocity: number;
  position: number;
  minPosition: number | null;
  maxPosition: number | null;
  maxEffort: number;
  velocityGain: number;
  efficiency: number;
};

export type JointActuatorOutput = {
  commandedVelocity: number;
  velocityError: number;
  estimatedEffort: number;
  mechanicalPowerW: number;
  electricalPowerW: number;
  atLowerLimit: boolean;
  atUpperLimit: boolean;
  stalled: boolean;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Deterministic bounded velocity-servo telemetry for a Rapier joint motor. */
export function stepJointActuator(input: JointActuatorInput): JointActuatorOutput {
  const target = clamp(finite(input.targetVelocity), -1e4, 1e4);
  const measured = clamp(finite(input.measuredVelocity), -1e4, 1e4);
  const position = finite(input.position);
  const tolerance = input.mode === "revolute" ? 1e-4 : 1e-5;
  const min = input.minPosition == null ? null : finite(input.minPosition);
  const max = input.maxPosition == null ? null : finite(input.maxPosition);
  const atLowerLimit = min != null && position <= min + tolerance;
  const atUpperLimit = max != null && position >= max - tolerance;
  const commandedVelocity = (atLowerLimit && target < 0) || (atUpperLimit && target > 0) ? 0 : target;
  const velocityError = commandedVelocity - measured;
  const maxEffort = Math.max(0, finite(input.maxEffort));
  const estimatedEffort = clamp(Math.abs(velocityError) * Math.max(0, finite(input.velocityGain, 1)), 0, maxEffort);
  const mechanicalPowerW = estimatedEffort * Math.abs(measured);
  const efficiency = clamp(finite(input.efficiency, 0.8), 0.05, 1);
  const electricalPowerW = mechanicalPowerW / efficiency;
  const stalled = Math.abs(commandedVelocity) > 1e-4
    && Math.abs(measured) < Math.max(1e-4, Math.abs(commandedVelocity) * 0.05)
    && estimatedEffort >= maxEffort * 0.98;
  return { commandedVelocity, velocityError, estimatedEffort, mechanicalPowerW, electricalPowerW, atLowerLimit, atUpperLimit, stalled };
}
