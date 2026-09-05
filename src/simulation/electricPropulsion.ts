import type { RotorThrusts } from "./multirotor";

export type ElectricPropulsionState = { rotorThrustN: RotorThrusts; remainingWh: number };
export type ElectricPropulsionOutput = ElectricPropulsionState & {
  electricalPowerW: number;
  inducedMechanicalPowerW: number;
  stateOfCharge: number;
  estimatedEnduranceS: number | null;
  depleted: boolean;
};

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** First-order electric motor response plus momentum-theory hover power. */
export function stepElectricPropulsion(input: {
  previous: ElectricPropulsionState;
  targetRotorThrustN: RotorThrusts;
  dtS: number;
  motorTimeConstantS: number;
  maxRotorThrustN: number;
  batteryCapacityWh: number;
  electricalEfficiency: number;
  rotorDiskAreaM2: number;
  airDensityKgM3: number;
  avionicsPowerW: number;
}): ElectricPropulsionOutput {
  const dt = clamp(finite(input.dtS), 0, 1);
  const tau = clamp(Math.abs(finite(input.motorTimeConstantS, 0.08)), 0.001, 10);
  const maxRotor = clamp(Math.abs(finite(input.maxRotorThrustN)), 0, 1e6);
  const capacityWh = clamp(Math.abs(finite(input.batteryCapacityWh)), 0, 1e9);
  const previousWh = clamp(finite(input.previous.remainingWh, capacityWh), 0, capacityWh);
  const depletedBeforeStep = previousWh <= 0 || capacityWh <= 0;
  const alpha = 1 - Math.exp(-dt / tau);
  const rotorThrustN = input.targetRotorThrustN.map((target, index) => {
    const previous = clamp(finite(input.previous.rotorThrustN[index]), 0, maxRotor);
    const boundedTarget = depletedBeforeStep ? 0 : clamp(finite(target), 0, maxRotor);
    return clamp(previous + (boundedTarget - previous) * alpha, 0, maxRotor);
  }) as RotorThrusts;
  const rho = Math.max(0.01, finite(input.airDensityKgM3, 1.225));
  const diskArea = Math.max(1e-4, finite(input.rotorDiskAreaM2, 0.05));
  const inducedMechanicalPowerW = rotorThrustN.reduce(
    (sum, thrust) => sum + Math.pow(Math.max(0, thrust), 1.5) / Math.sqrt(2 * rho * diskArea), 0,
  );
  const efficiency = clamp(finite(input.electricalEfficiency, 0.82), 0.05, 1);
  const electricalPowerW = inducedMechanicalPowerW / efficiency + Math.max(0, finite(input.avionicsPowerW));
  const remainingWh = Math.max(0, previousWh - electricalPowerW * dt / 3600);
  const depleted = remainingWh <= 1e-9 || capacityWh <= 0;
  return {
    rotorThrustN,
    remainingWh,
    electricalPowerW,
    inducedMechanicalPowerW,
    stateOfCharge: capacityWh > 0 ? remainingWh / capacityWh : 0,
    estimatedEnduranceS: electricalPowerW > 1e-9 ? remainingWh * 3600 / electricalPowerW : null,
    depleted,
  };
}
