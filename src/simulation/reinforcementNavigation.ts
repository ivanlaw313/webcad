export type RlObservation = {
  headingErrorRad: number;
  blockedLeft: boolean;
  blockedCenter: boolean;
  blockedRight: boolean;
};

export type RlAction = "left" | "straight" | "right" | "brake";

export type TabularNavigationPolicy = {
  algorithm: "tabular-q-learning";
  stateCount: 24;
  actions: RlAction[];
  q: number[];
  episodes: number;
  seed: number;
  trainingRewardMean: number;
  evaluationRewardMean: number;
  evaluationSuccessRate: number;
};

const ACTIONS: RlAction[] = ["left", "straight", "right", "brake"];
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function encodeRlObservation(observation: RlObservation) {
  const headingBin = observation.headingErrorRad < -0.18 ? 0 : observation.headingErrorRad > 0.18 ? 2 : 1;
  const obstacleBits = (observation.blockedLeft ? 1 : 0)
    | (observation.blockedCenter ? 2 : 0)
    | (observation.blockedRight ? 4 : 0);
  return headingBin * 8 + obstacleBits;
}

export function chooseRlAction(policy: TabularNavigationPolicy, observation: RlObservation): RlAction {
  const state = encodeRlObservation(observation);
  const offset = state * ACTIONS.length;
  let best = 0;
  for (let action = 1; action < ACTIONS.length; action += 1) {
    if ((policy.q[offset + action] ?? -Infinity) > (policy.q[offset + best] ?? -Infinity)) best = action;
  }
  return ACTIONS[best];
}

export function rlActionControl(action: RlAction) {
  if (action === "left") return { steeringDeg: 32, speedScale: 0.72 };
  if (action === "right") return { steeringDeg: -32, speedScale: 0.72 };
  if (action === "brake") return { steeringDeg: 0, speedScale: 0.12 };
  return { steeringDeg: 0, speedScale: 1 };
}

type EpisodeState = { x: number; z: number; heading: number };
type Obstacle = { x: number; z: number; radius: number };

const rngFactory = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 4294967296;
  };
};

function wrap(angle: number) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function observe(state: EpisodeState, target: [number, number], obstacles: Obstacle[]): RlObservation {
  const targetAngle = Math.atan2(target[1] - state.z, target[0] - state.x);
  const headingErrorRad = wrap(targetAngle - state.heading);
  const blocked = [false, false, false];
  for (const obstacle of obstacles) {
    const dx = obstacle.x - state.x, dz = obstacle.z - state.z;
    const distance = Math.hypot(dx, dz) - obstacle.radius;
    if (distance > 2.8) continue;
    const relative = wrap(Math.atan2(dz, dx) - state.heading);
    if (Math.abs(relative) < 0.24) blocked[1] = true;
    else if (relative >= 0.24 && relative < 0.85) blocked[0] = true;
    else if (relative <= -0.24 && relative > -0.85) blocked[2] = true;
  }
  return { headingErrorRad, blockedLeft: blocked[0], blockedCenter: blocked[1], blockedRight: blocked[2] };
}

function stepEpisode(state: EpisodeState, action: RlAction, target: [number, number], obstacles: Obstacle[]) {
  const before = Math.hypot(target[0] - state.x, target[1] - state.z);
  const control = rlActionControl(action);
  state.heading = wrap(state.heading + control.steeringDeg * Math.PI / 180 * 0.32);
  const distance = 0.32 * control.speedScale;
  state.x += Math.cos(state.heading) * distance;
  state.z += Math.sin(state.heading) * distance;
  const after = Math.hypot(target[0] - state.x, target[1] - state.z);
  const collision = obstacles.some((obstacle) => Math.hypot(obstacle.x - state.x, obstacle.z - state.z) < obstacle.radius + 0.22);
  const success = after < 0.45;
  const reward = (before - after) * 8 - 0.03 - (collision ? 18 : 0) + (success ? 35 : 0);
  return { reward, collision, success };
}

function scenario(random: () => number) {
  const target: [number, number] = [8, (random() - 0.5) * 5];
  const obstacles: Obstacle[] = Array.from({ length: 4 }, (_, index) => ({
    x: 2 + index * 1.35 + (random() - 0.5) * 0.4,
    z: (random() - 0.5) * 4.5,
    radius: 0.45 + random() * 0.25,
  }));
  return { target, obstacles };
}

function runEvaluation(q: number[], seed: number, episodes: number) {
  const random = rngFactory(seed);
  let rewardSum = 0, successes = 0;
  const policy: TabularNavigationPolicy = {
    algorithm: "tabular-q-learning", stateCount: 24, actions: ACTIONS, q,
    episodes: 0, seed, trainingRewardMean: 0, evaluationRewardMean: 0, evaluationSuccessRate: 0,
  };
  for (let episode = 0; episode < episodes; episode += 1) {
    const { target, obstacles } = scenario(random);
    const state: EpisodeState = { x: 0, z: 0, heading: 0 };
    for (let step = 0; step < 120; step += 1) {
      const result = stepEpisode(state, chooseRlAction(policy, observe(state, target, obstacles)), target, obstacles);
      rewardSum += result.reward;
      if (result.success) { successes += 1; break; }
      if (result.collision) break;
    }
  }
  return { rewardMean: rewardSum / episodes, successRate: successes / episodes };
}

export function trainTabularNavigationPolicy(options: { episodes?: number; seed?: number } = {}): TabularNavigationPolicy {
  const episodes = Math.round(clamp(options.episodes ?? 1200, 50, 10000));
  const seed = Math.round(options.seed ?? 90210);
  const random = rngFactory(seed);
  const q = Array(24 * ACTIONS.length).fill(0);
  let rewardSum = 0;
  for (let episode = 0; episode < episodes; episode += 1) {
    const { target, obstacles } = scenario(random);
    const state: EpisodeState = { x: 0, z: 0, heading: 0 };
    const epsilon = 0.45 * (1 - episode / episodes) + 0.03;
    for (let step = 0; step < 120; step += 1) {
      const observation = observe(state, target, obstacles);
      const stateIndex = encodeRlObservation(observation);
      let actionIndex: number;
      if (random() < epsilon) actionIndex = Math.floor(random() * ACTIONS.length);
      else {
        actionIndex = 0;
        for (let action = 1; action < ACTIONS.length; action += 1)
          if (q[stateIndex * 4 + action] > q[stateIndex * 4 + actionIndex]) actionIndex = action;
      }
      const result = stepEpisode(state, ACTIONS[actionIndex], target, obstacles);
      rewardSum += result.reward;
      const nextState = encodeRlObservation(observe(state, target, obstacles));
      const nextBest = Math.max(...q.slice(nextState * 4, nextState * 4 + 4));
      const index = stateIndex * 4 + actionIndex;
      q[index] += 0.16 * (result.reward + (result.success || result.collision ? 0 : 0.94 * nextBest) - q[index]);
      if (result.success || result.collision) break;
    }
  }
  const evaluation = runEvaluation(q, seed ^ 0x9e3779b9, 160);
  return {
    algorithm: "tabular-q-learning",
    stateCount: 24,
    actions: [...ACTIONS],
    q,
    episodes,
    seed,
    trainingRewardMean: rewardSum / episodes,
    evaluationRewardMean: evaluation.rewardMean,
    evaluationSuccessRate: evaluation.successRate,
  };
}
