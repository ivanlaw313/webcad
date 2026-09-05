export type NavigationWaypoint = { x: number; z: number };
export type NavigationObstacle = { x: number; z: number; radius: number };
export type NavigationPolicy = { navigationGain: number; avoidanceGain: number; dampingGain: number };
export type NavigationTrainingResult = {
  policy: NavigationPolicy;
  baselineScore: number;
  trainedScore: number;
  generations: number;
  candidates: number;
  seed: number;
};

const DEFAULT_POLICY: NavigationPolicy = { navigationGain: 0.14, avoidanceGain: 1, dampingGain: 0.42 };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function scoreNavigationPolicy(policy: NavigationPolicy, route: NavigationWaypoint[], obstacles: NavigationObstacle[]) {
  if (!route.length) return -Infinity;
  let x = 0, z = 0, vx = 0, vz = 0, targetIndex = 0, collisions = 0, energy = 0, minClearance = Infinity;
  const dt = 0.05;
  for (let step = 0; step < 1600 && targetIndex < route.length; step += 1) {
    const target = route[targetIndex];
    const dx = target.x - x, dz = target.z - z, distance = Math.hypot(dx, dz);
    if (distance <= 0.35) { targetIndex += 1; continue; }
    let ax = dx * policy.navigationGain - vx * policy.dampingGain;
    let az = dz * policy.navigationGain - vz * policy.dampingGain;
    for (const obstacle of obstacles) {
      const ox = x - obstacle.x, oz = z - obstacle.z;
      const centreDistance = Math.hypot(ox, oz), clearance = centreDistance - obstacle.radius;
      minClearance = Math.min(minClearance, clearance);
      if (clearance < 0) collisions += 1;
      if (centreDistance < obstacle.radius + 2.2) {
        const scale = policy.avoidanceGain * ((obstacle.radius + 2.2 - centreDistance) / 2.2) ** 2;
        const inv = centreDistance > 1e-6 ? 1 / centreDistance : 1;
        ax += (centreDistance > 1e-6 ? ox : 1) * inv * scale;
        az += (centreDistance > 1e-6 ? oz : 0) * inv * scale;
      }
    }
    const acceleration = Math.hypot(ax, az);
    if (acceleration > 2.5) { ax *= 2.5 / acceleration; az *= 2.5 / acceleration; }
    vx += ax * dt; vz += az * dt; x += vx * dt; z += vz * dt;
    energy += acceleration * acceleration * dt;
  }
  const finalTarget = route[Math.min(targetIndex, route.length - 1)];
  const remaining = Math.hypot(finalTarget.x - x, finalTarget.z - z);
  return (targetIndex / route.length) * 10000 - remaining * 150 - collisions * 120 - energy * 0.2 + Math.min(minClearance, 3) * 10;
}

export function trainNavigationPolicy(
  route: NavigationWaypoint[], obstacles: NavigationObstacle[],
  options: { seed?: number; generations?: number; candidates?: number } = {},
): NavigationTrainingResult {
  const seed = options.seed ?? 360;
  const generations = clamp(Math.round(options.generations ?? 8), 1, 30);
  const candidates = clamp(Math.round(options.candidates ?? 64), 8, 256);
  const random = seededRandom(seed);
  let best = { ...DEFAULT_POLICY };
  const baselineScore = scoreNavigationPolicy(best, route, obstacles);
  let bestScore = baselineScore;
  for (let generation = 0; generation < generations; generation += 1) {
    const spread = 0.75 * (1 - generation / Math.max(1, generations)) + 0.08;
    for (let candidate = 0; candidate < candidates; candidate += 1) {
      const policy: NavigationPolicy = {
        navigationGain: clamp(best.navigationGain * (0.55 + random() * (0.9 + spread)), 0.03, 0.7),
        avoidanceGain: clamp(best.avoidanceGain * (0.45 + random() * (1.1 + spread)), 0.15, 5),
        dampingGain: clamp(best.dampingGain * (0.5 + random() * (1 + spread)), 0.08, 2),
      };
      const score = scoreNavigationPolicy(policy, route, obstacles);
      if (score > bestScore) { best = policy; bestScore = score; }
    }
  }
  return { policy: best, baselineScore, trainedScore: bestScore, generations, candidates, seed };
}

export const defaultNavigationPolicy = (): NavigationPolicy => ({ ...DEFAULT_POLICY });
