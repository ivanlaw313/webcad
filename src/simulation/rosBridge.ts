export type RosTwistCommand = {
  linearMps: number;
  angularRadS: number;
};

export type RosSimulationState = {
  simulationTimeS: number;
  positionM: readonly [number, number, number];
  velocityMps: readonly [number, number, number];
  targetSpeedMps: number;
  forwardSpeedMps: number;
  steeringDeg: number;
  grounded: boolean;
};

const finite = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

export function rosSubscribe(topic = "/webcad/cmd_vel") {
  return { op: "subscribe", topic, type: "geometry_msgs/msg/Twist", queue_length: 1 };
}

export function rosAdvertise(topic = "/webcad/simulation_state") {
  return { op: "advertise", topic, type: "std_msgs/msg/String" };
}

export function parseRosTwist(
  input: unknown,
  topic = "/webcad/cmd_vel",
): RosTwistCommand | null {
  let envelope: unknown = input;
  if (typeof input === "string") {
    try { envelope = JSON.parse(input); } catch { return null; }
  }
  if (!envelope || typeof envelope !== "object") return null;
  const record = envelope as Record<string, unknown>;
  if (record.op !== "publish" || record.topic !== topic || !record.msg || typeof record.msg !== "object") return null;
  const msg = record.msg as Record<string, unknown>;
  const linear = msg.linear && typeof msg.linear === "object" ? msg.linear as Record<string, unknown> : {};
  const angular = msg.angular && typeof msg.angular === "object" ? msg.angular as Record<string, unknown> : {};
  return {
    linearMps: Math.max(-30, Math.min(60, finite(linear.x))),
    angularRadS: Math.max(-4, Math.min(4, finite(angular.z))),
  };
}

export function rosPublishSimulationState(
  state: RosSimulationState,
  topic = "/webcad/simulation_state",
) {
  const clean: RosSimulationState = {
    simulationTimeS: finite(state.simulationTimeS),
    positionM: state.positionM.map((value) => finite(value)) as [number, number, number],
    velocityMps: state.velocityMps.map((value) => finite(value)) as [number, number, number],
    targetSpeedMps: finite(state.targetSpeedMps),
    forwardSpeedMps: finite(state.forwardSpeedMps),
    steeringDeg: finite(state.steeringDeg),
    grounded: state.grounded === true,
  };
  return {
    op: "publish",
    topic,
    msg: { data: JSON.stringify(clean) },
  };
}
