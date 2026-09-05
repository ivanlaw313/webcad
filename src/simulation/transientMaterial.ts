export type ReducedMaterialId = "steel" | "aluminum" | "abs";
export type ReducedMaterial = {
  name: string;
  youngPa: number;
  yieldPa: number;
  densityKgM3: number;
  dampingRatio: number;
  failurePlasticStrain: number;
};
export type TransientMaterialState = {
  displacementM: number;
  velocityMps: number;
  plasticDisplacementM: number;
  plasticStrain: number;
  /** Accumulated equivalent plastic strain, including load reversals. */
  cumulativePlasticStrain: number;
  /** Plastic dissipation estimated from yield force × plastic travel. */
  plasticWorkJ: number;
  stressPa: number;
  maxStressPa: number;
  damage: number;
  yielded: boolean;
  failed: boolean;
  /** Dominant CAD-local compression axis measured from the Rapier contact. */
  loadAxis: "x" | "y" | "z";
  /** Unit contact-force direction in CAD-local coordinates. */
  loadDirectionLocal: [number, number, number];
  loadReversals: number;
  peakForceN: number;
};

export const REDUCED_MATERIALS: Record<ReducedMaterialId, ReducedMaterial> = {
  steel: { name: "結構鋼（工程預設）", youngPa: 200e9, yieldPa: 250e6, densityKgM3: 7850, dampingRatio: 0.025, failurePlasticStrain: 0.18 },
  aluminum: { name: "6061-T6 鋁（工程預設）", youngPa: 69e9, yieldPa: 276e6, densityKgM3: 2700, dampingRatio: 0.02, failurePlasticStrain: 0.12 },
  abs: { name: "ABS（工程預設）", youngPa: 2.1e9, yieldPa: 40e6, densityKgM3: 1040, dampingRatio: 0.08, failurePlasticStrain: 0.08 },
};

export const initialTransientMaterialState = (): TransientMaterialState => ({
  displacementM: 0, velocityMps: 0, plasticDisplacementM: 0, plasticStrain: 0,
  cumulativePlasticStrain: 0, plasticWorkJ: 0,
  stressPa: 0, maxStressPa: 0, damage: 0, yielded: false, failed: false,
  loadAxis: "y", loadDirectionLocal: [0, 1, 0], loadReversals: 0, peakForceN: 0,
});

export function normalizeLoadDirection(
  direction: readonly [number, number, number] | undefined,
): { direction: [number, number, number]; axis: "x" | "y" | "z" } {
  const raw = direction ?? [0, 1, 0];
  const length = Math.hypot(raw[0], raw[1], raw[2]);
  const unit: [number, number, number] = Number.isFinite(length) && length > 1e-9
    ? [raw[0] / length, raw[1] / length, raw[2] / length]
    : [0, 1, 0];
  const absolute = unit.map(Math.abs);
  const index = absolute[0] >= absolute[1] && absolute[0] >= absolute[2]
    ? 0
    : absolute[1] >= absolute[2] ? 1 : 2;
  return { direction: unit, axis: (["x", "y", "z"] as const)[index] };
}

export function worldDirectionToLocal(
  direction: readonly [number, number, number],
  rotation: { x: number; y: number; z: number; w: number },
): [number, number, number] {
  const [x, y, z] = direction;
  const q = rotation;
  // R(q)^T transforms a world vector into the rotating CAD body frame.
  return [
    (1 - 2 * (q.y * q.y + q.z * q.z)) * x + 2 * (q.x * q.y + q.w * q.z) * y + 2 * (q.x * q.z - q.w * q.y) * z,
    2 * (q.x * q.y - q.w * q.z) * x + (1 - 2 * (q.x * q.x + q.z * q.z)) * y + 2 * (q.y * q.z + q.w * q.x) * z,
    2 * (q.x * q.z + q.w * q.y) * x + 2 * (q.y * q.z - q.w * q.x) * y + (1 - 2 * (q.x * q.x + q.y * q.y)) * z,
  ];
}

export function stepTransientMaterial(
  previous: TransientMaterialState,
  forceN: number,
  dt: number,
  geometry: { lengthM: number; areaM2: number; effectiveMassKg: number },
  material: ReducedMaterial,
  loadDirectionLocal?: readonly [number, number, number],
): TransientMaterialState {
  if (!(dt > 0) || !Number.isFinite(forceN)) return previous;
  const lengthM = Math.max(1e-4, geometry.lengthM);
  const areaM2 = Math.max(1e-8, geometry.areaM2);
  const mass = Math.max(1e-5, geometry.effectiveMassKg);
  const stiffness = material.youngPa * areaM2 / lengthM;
  const damping = 2 * material.dampingRatio * Math.sqrt(stiffness * mass);
  const load = normalizeLoadDirection(loadDirectionLocal ?? previous.loadDirectionLocal);
  const axisIndex = load.axis === "x" ? 0 : load.axis === "y" ? 1 : 2;
  const sense = load.direction[axisIndex] < 0 ? -1 : 1;
  const signedForceN = Math.max(0, forceN) * sense;
  // Implicit Euler remains stable for the very stiff CAD materials at 120 Hz.
  let velocity = (
    previous.velocityMps + dt * (signedForceN - stiffness * (previous.displacementM - previous.plasticDisplacementM)) / mass
  ) / (1 + dt * damping / mass + dt * dt * stiffness / mass);
  let displacement = previous.displacementM + dt * velocity;
  let plasticDisplacement = previous.plasticDisplacementM;
  let elasticDisplacement = displacement - plasticDisplacement;
  let stressPa = material.youngPa * elasticDisplacement / lengthM;
  let yielded = previous.yielded;
  let plasticIncrementM = 0;
  if (Math.abs(stressPa) > material.yieldPa) {
    yielded = true;
    const stressSign = stressPa < 0 ? -1 : 1;
    elasticDisplacement = stressSign * material.yieldPa * lengthM / material.youngPa;
    const nextPlasticDisplacement = displacement - elasticDisplacement;
    plasticIncrementM = Math.abs(nextPlasticDisplacement - plasticDisplacement);
    plasticDisplacement = nextPlasticDisplacement;
    stressPa = stressSign * material.yieldPa;
  }
  let plasticStrain = Math.abs(plasticDisplacement) / lengthM;
  let cumulativePlasticStrain = (previous.cumulativePlasticStrain ?? previous.plasticStrain) + plasticIncrementM / lengthM;
  const damage = Math.max(previous.damage, Math.min(1, cumulativePlasticStrain / material.failurePlasticStrain));
  let plasticWorkJ = (previous.plasticWorkJ ?? 0) + material.yieldPa * areaM2 * plasticIncrementM;
  const directionDot = load.direction[0] * previous.loadDirectionLocal[0]
    + load.direction[1] * previous.loadDirectionLocal[1]
    + load.direction[2] * previous.loadDirectionLocal[2];
  const loadReversals = (previous.loadReversals ?? 0) + (forceN > 1e-6 && directionDot < -0.5 ? 1 : 0);
  if (damage >= 1) {
    // This reduced-order branch has no post-failure constitutive law. Keep the
    // terminal state finite; optional Rapier fragments take over in the scene.
    const cap = material.failurePlasticStrain * lengthM;
    plasticDisplacement = Math.max(-cap, Math.min(cap, plasticDisplacement));
    plasticStrain = Math.abs(plasticDisplacement) / lengthM;
    const elasticCap = material.yieldPa * lengthM / material.youngPa;
    displacement = Math.max(-cap - elasticCap, Math.min(cap + elasticCap, displacement));
    cumulativePlasticStrain = Math.min(cumulativePlasticStrain, material.failurePlasticStrain);
    plasticWorkJ = Math.min(plasticWorkJ, material.yieldPa * areaM2 * cap);
    velocity = 0;
  }
  if (forceN <= 0 && Math.abs(velocity) < 1e-8) displacement = plasticDisplacement;
  return {
    displacementM: displacement,
    velocityMps: velocity,
    plasticDisplacementM: plasticDisplacement,
    plasticStrain,
    stressPa,
    maxStressPa: Math.max(previous.maxStressPa, Math.abs(stressPa)),
    cumulativePlasticStrain,
    plasticWorkJ,
    damage,
    yielded,
    failed: damage >= 1,
    loadAxis: load.axis,
    loadDirectionLocal: load.direction,
    loadReversals,
    peakForceN: Math.max(previous.peakForceN ?? 0, Math.max(0, forceN)),
  };
}
