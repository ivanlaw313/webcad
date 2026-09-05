import { Canvas, useFrame } from "@react-three/fiber";
import { Grid, Line, OrbitControls } from "@react-three/drei";
import RAPIER from "@dimforge/rapier3d-compat";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BufferGeometry,
  Float32BufferAttribute,
  Vector3,
  type Mesh,
} from "three";
import { MATERIALS, useApp } from "../store";
import type { Joint } from "../assembly/kinematics";
import {
  defaultNavigationPolicy,
  trainNavigationPolicy,
  type NavigationPolicy,
  type NavigationTrainingResult,
} from "../simulation/navigationPolicy";
import {
  REDUCED_MATERIALS,
  initialTransientMaterialState,
  stepTransientMaterial,
  worldDirectionToLocal,
  type ReducedMaterialId,
  type TransientMaterialState,
} from "../simulation/transientMaterial";
import {
  stepGroundVehicleController,
  type GroundVehicleOutput,
} from "../simulation/groundVehicle";
import {
  parseRosTwist,
  rosAdvertise,
  rosPublishSimulationState,
  rosSubscribe,
} from "../simulation/rosBridge";
import {
  chooseRlAction,
  rlActionControl,
  trainTabularNavigationPolicy,
  type TabularNavigationPolicy,
} from "../simulation/reinforcementNavigation";
import { allocateQuadrotor, quadrotorWrench } from "../simulation/multirotor";
import {
  stepElectricPropulsion,
  type ElectricPropulsionState,
} from "../simulation/electricPropulsion";
import { stepJointActuator, type JointActuatorOutput } from "../simulation/jointActuator";
import {
  stepRobotStability,
  terrainTileHeightM,
  type RobotStabilityOutput,
  type RobotStabilityState,
} from "../simulation/robotTerrain";

type Vec3 = [number, number, number];
type Waypoint = { x: number; z: number };
type WindDirection = "x+" | "x-" | "z+" | "z-";
type BallMaterial = "steel" | "aluminum" | "rubber";
type CadBodyMode = "dynamic" | "fixed";
type EnvironmentPreset = "earth" | "moon" | "mars" | "zero-g" | "custom";
const ENVIRONMENT_PRESETS: Record<
  Exclude<EnvironmentPreset, "custom">,
  { label: string; gravity: number; airDensity: number }
> = {
  earth: { label: "地球", gravity: 9.81, airDensity: 1.225 },
  moon: { label: "月球", gravity: 1.62, airDensity: 0 },
  mars: { label: "火星", gravity: 3.71, airDensity: 0.02 },
  "zero-g": { label: "零重力真空", gravity: 0, airDensity: 0 },
};
const BALL_MATERIALS: Record<
  BallMaterial,
  {
    label: string;
    densityKgM3: number;
    color: string;
    metalness: number;
    roughness: number;
  }
> = {
  steel: {
    label: "鋼",
    densityKgM3: 7800,
    color: "#f59e0b",
    metalness: 0.35,
    roughness: 0.32,
  },
  aluminum: {
    label: "鋁",
    densityKgM3: 2700,
    color: "#cbd5e1",
    metalness: 0.72,
    roughness: 0.28,
  },
  rubber: {
    label: "橡膠",
    densityKgM3: 1100,
    color: "#d94b4b",
    metalness: 0,
    roughness: 0.82,
  },
};
type BodyState = { p: Vec3; r: [number, number, number, number]; v: Vec3 };
type ComponentState = BodyState & { id: string; name: string };
type ComponentMotor =
  | { type: "revolute"; id: string; name: string; joint: RAPIER.RevoluteImpulseJoint; parent: RAPIER.RigidBody; child: RAPIER.RigidBody; axisParent: RAPIER.Vector3; min: number | null; max: number | null; position: number }
  | { type: "slider"; id: string; name: string; joint: RAPIER.PrismaticImpulseJoint; parent: RAPIER.RigidBody; child: RAPIER.RigidBody; axisParent: RAPIER.Vector3; min: number | null; max: number | null; position: number };
type JointActuatorTelemetry = JointActuatorOutput & {
  id: string;
  name: string;
  type: "revolute" | "slider";
  position: number;
  measuredVelocity: number;
  maxEffort: number;
  effortUnit: "N·m" | "N";
};
type RobotTerrainTelemetry = RobotStabilityOutput & {
  terrainEnabled: boolean;
  roughnessM: number;
  distanceFromStartM: number;
};
type CustomConstraint =
  | {
      type: "screw";
      parent: RAPIER.RigidBody;
      child: RAPIER.RigidBody;
      parentAnchor: RAPIER.Vector3;
      childAnchor: RAPIER.Vector3;
      parentAxis: RAPIER.Vector3;
      childAxis: RAPIER.Vector3;
      /** Metres advanced per radian; the initial anchor separation is rest. */
      pitchPerRad: number;
      angleRad: number;
    }
  | {
      type: "pinslot";
      parent: RAPIER.RigidBody;
      child: RAPIER.RigidBody;
      /** The slot axis is held by Rapier's generic translation constraint. */
      parentPinAxis: RAPIER.Vector3;
      childPinAxis: RAPIER.Vector3;
    };
type Settings = {
  gravity: number;
  environmentPreset: EnvironmentPreset;
  restitution: number;
  friction: number;
  airDensity: number;
  wind: number;
  windDirection: WindDirection;
  ballMaterial: BallMaterial;
  running: boolean;
  reset: number;
  startX: number;
  startHeight: number;
  startZ: number;
  startVx: number;
  startVz: number;
  cadStartX: number;
  cadStartHeight: number;
  cadStartZ: number;
  cadStartVx: number;
  cadStartVz: number;
  cadBodyMode: CadBodyMode;
  extraBalls: number;
  cadHinge: boolean;
  motorRpm: number;
  cadSlider: boolean;
  sliderSpeed: number;
  rampEnabled: boolean;
  rampAngle: number;
  obstacleCount: number;
  unevenTerrainEnabled: boolean;
  terrainRoughnessM: number;
  robotFallTiltDeg: number;
  timeScale: number;
  fastForwardEnabled: boolean;
  fastForwardStepsPerFrame: number;
  stopAtSimulationS: number;
  demoArm: boolean;
  armRpm: number;
  componentBodies: boolean;
  componentJointRpm: number;
  componentJointMaxTorqueNm: number;
  componentJointMaxForceN: number;
  componentJointEfficiency: number;
  /** Active CAD flight model: local +Y is thrust/up, local +X is forward. */
  cadFlightEnabled: boolean;
  /** Reduced-order tyre/traction model: local +X is vehicle forward. */
  cadGroundVehicleEnabled: boolean;
  cadGroundTargetSpeedMps: number;
  cadGroundMaxDriveForceN: number;
  cadGroundMaxBrakeForceN: number;
  cadGroundSteeringDeg: number;
  cadGroundMaxSteeringTorqueNm: number;
  cadRlNavigationEnabled: boolean;
  cadRlNavigationPolicy: TabularNavigationPolicy | null;
  cadThrustN: number;
  cadBatteryCapacityWh: number;
  cadMotorTimeConstantS: number;
  cadMaxRotorThrustN: number;
  cadElectricalEfficiency: number;
  cadRotorDiskAreaM2: number;
  cadAvionicsPowerW: number;
  /** A bounded PD altitude hold; this is deterministic control, not trained AI. */
  cadAutopilotEnabled: boolean;
  cadTargetAltitudeM: number;
  cadWaypointEnabled: boolean;
  cadWaypointX: number;
  cadWaypointZ: number;
  cadWaypointRoute: Waypoint[];
  cadWaypointLoop: boolean;
  /** Avoids only the procedural fixed obstacle cubes in this Lab room. */
  cadObstacleAvoidanceEnabled: boolean;
  cadRaycastAvoidanceEnabled: boolean;
  cadDynamicReplanEnabled: boolean;
  cadNavigationPolicy: NavigationPolicy;
  cadTransientEnabled: boolean;
  cadTransientMaterial: ReducedMaterialId;
  cadFractureEnabled: boolean;
  cadFractureDamageThreshold: number;
  cadLiftCoefficient: number;
  cadDragCoefficient: number;
  cadReferenceAreaM2: number;
  roomWidth: number;
  roomDepth: number;
  roomHeight: number;
};
type CadShape = {
  positions: Float32Array;
  size: Vec3;
  source: "cad" | "fallback";
  densityKgM3: number;
  /** CAD-space centre and scale shared with parked sibling bodies. */
  centerCad: Vec3;
  scale: number;
};
type ParkedShape = {
  id: string;
  name: string;
  positions: Float32Array;
  size: Vec3;
};
type ComponentShape = {
  id: string;
  name: string;
  positions: Float32Array;
  size: Vec3;
  color: string;
  densityKgM3: number;
  material: string;
  spawnOffset: Vec3;
  spawnRotation: [number, number, number, number];
  layoutOrigin: Vec3;
  layoutScale: number;
};
type CollisionEvent = {
  at: number;
  label: string;
  /** Rapier's instantaneous summed contact-force magnitude (N), when available. */
  forceN?: number;
};
type ImpactLoad = {
  atS: number;
  magnitudeN: number;
  /** Force acting on the active CAD collider in Physics Lab world axes. */
  forceWorldN: Vec3;
  counterparty: string;
  /** Rapier event's strongest individual contact, not a time-integrated impulse. */
  source: "rapier-max-contact";
};
type FlightTelemetry = {
  atS: number;
  airspeedMps: number;
  liftN: number;
  dragN: number;
  thrustN: number;
  commandedThrustN: number;
  altitudeHoldEnabled: boolean;
  altitudeErrorM: number;
  waypointEnabled: boolean;
  waypointDistanceM: number;
  waypointIndex: number;
  waypointCount: number;
  waypointCompleted: boolean;
  obstacleAvoidanceEnabled: boolean;
  nearestObstacleDistanceM: number | null;
  raycastAvoidanceEnabled: boolean;
  nearestColliderDistanceM: number | null;
  detourActive: boolean;
  replanCount: number;
  plannedTarget: Waypoint | null;
  dynamicPressurePa: number;
  /** World-space resultant applied to the active CAD rigid body. */
  forceWorldN: Vec3;
  rotorThrustN?: [number, number, number, number];
  bodyTorqueNm?: Vec3;
  motorSaturated?: boolean;
  electricalPowerW?: number;
  batteryRemainingWh?: number;
  batteryStateOfCharge?: number;
  estimatedEnduranceS?: number | null;
  batteryDepleted?: boolean;
};
type GroundTelemetry = GroundVehicleOutput & {
  atS: number;
  targetSpeedMps: number;
  waypointEnabled: boolean;
  waypointDistanceM: number;
  waypointIndex: number;
  waypointCount: number;
  waypointCompleted: boolean;
  obstacleAvoidanceEnabled: boolean;
  raycastAvoidanceEnabled: boolean;
  nearestColliderDistanceM: number | null;
  detourActive: boolean;
  replanCount: number;
  plannedTarget: Waypoint | null;
};
/** Sampled at the same bounded reporting cadence as the visible lab readout. */
type CadTelemetrySample = {
  atS: number;
  positionM: Vec3;
  velocityMps: Vec3;
  flight: FlightTelemetry;
  ground: GroundTelemetry;
};
type ReplanDecision = {
  atS: number;
  waypointIndex: number;
  originalTarget: Waypoint;
  detourTarget: Waypoint;
  obstacleDistanceM: number;
  chosenSide: "left" | "right";
};
type FractureEvent = {
  atS: number;
  damage: number;
  plasticStrain: number;
  strengthUtilization: number;
  fragmentCount: number;
  source: "reduced-order-damage-threshold";
};
type Scenario = {
  gravity: number;
  environmentPreset?: EnvironmentPreset;
  restitution: number;
  friction: number;
  airDensity?: number;
  wind: number;
  windDirection?: WindDirection;
  ballMaterial?: BallMaterial;
  startX?: number;
  startHeight: number;
  startZ?: number;
  startVx: number;
  startVz?: number;
  cadStartX?: number;
  cadStartHeight?: number;
  cadStartZ?: number;
  cadStartVx?: number;
  cadStartVz?: number;
  cadBodyMode?: CadBodyMode;
  extraBalls?: number;
  cadHinge?: boolean;
  motorRpm?: number;
  cadSlider?: boolean;
  sliderSpeed?: number;
  rampEnabled?: boolean;
  rampAngle?: number;
  obstacleCount?: number;
  unevenTerrainEnabled?: boolean;
  terrainRoughnessM?: number;
  robotFallTiltDeg?: number;
  timeScale?: number;
  fastForwardEnabled?: boolean;
  fastForwardStepsPerFrame?: number;
  stopAtSimulationS?: number;
  demoArm?: boolean;
  armRpm?: number;
  componentBodies?: boolean;
  componentJointRpm?: number;
  componentJointMaxTorqueNm?: number;
  componentJointMaxForceN?: number;
  componentJointEfficiency?: number;
  cadFlightEnabled?: boolean;
  cadGroundVehicleEnabled?: boolean;
  cadGroundTargetSpeedMps?: number;
  cadGroundMaxDriveForceN?: number;
  cadGroundMaxBrakeForceN?: number;
  cadGroundSteeringDeg?: number;
  cadGroundMaxSteeringTorqueNm?: number;
  cadRlNavigationEnabled?: boolean;
  cadRlNavigationPolicy?: TabularNavigationPolicy | null;
  cadThrustN?: number;
  cadBatteryCapacityWh?: number;
  cadMotorTimeConstantS?: number;
  cadMaxRotorThrustN?: number;
  cadElectricalEfficiency?: number;
  cadRotorDiskAreaM2?: number;
  cadAvionicsPowerW?: number;
  cadAutopilotEnabled?: boolean;
  cadTargetAltitudeM?: number;
  cadWaypointEnabled?: boolean;
  cadWaypointX?: number;
  cadWaypointZ?: number;
  cadWaypointRoute?: Waypoint[];
  cadWaypointLoop?: boolean;
  cadObstacleAvoidanceEnabled?: boolean;
  cadRaycastAvoidanceEnabled?: boolean;
  cadDynamicReplanEnabled?: boolean;
  cadNavigationPolicy?: NavigationPolicy;
  cadTransientEnabled?: boolean;
  cadTransientMaterial?: ReducedMaterialId;
  cadFractureEnabled?: boolean;
  cadFractureDamageThreshold?: number;
  cadLiftCoefficient?: number;
  cadDragCoefficient?: number;
  cadReferenceAreaM2?: number;
  roomWidth?: number;
  roomDepth?: number;
  roomHeight?: number;
};

function CadVisual({
  shape,
  bodyRef,
  color = "#18a6d5",
}: {
  shape: Pick<CadShape, "positions">;
  bodyRef: React.RefObject<Mesh | null>;
  color?: string;
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(shape.positions, 3));
    g.computeVertexNormals();
    return g;
  }, [shape]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh ref={bodyRef} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color={color}
        metalness={0.15}
        roughness={0.48}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

function ParkedCadVisual({
  shape,
  anchor,
}: {
  shape: ParkedShape;
  anchor: Vec3;
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(shape.positions, 3));
    g.computeVertexNormals();
    return g;
  }, [shape]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh position={anchor} geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#64748b"
        metalness={0.28}
        roughness={0.48}
        transparent
        opacity={0.82}
      />
    </mesh>
  );
}

function ComponentVisual({
  shape,
  index,
  meshRefs,
}: {
  shape: ComponentShape;
  index: number;
  meshRefs: React.MutableRefObject<Array<Mesh | null>>;
}) {
  const geometry = useMemo(() => {
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(shape.positions, 3));
    g.computeVertexNormals();
    return g;
  }, [shape]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh
      ref={(mesh) => {
        meshRefs.current[index] = mesh;
      }}
      geometry={geometry}
      castShadow
      receiveShadow
    >
      <meshStandardMaterial
        color={shape.color}
        metalness={0.15}
        roughness={0.48}
        transparent
        opacity={0.9}
      />
    </mesh>
  );
}

/** Fixed-step browser rigid-body scene.  CAD geometry uses a convex-hull collider;
 * concave shapes therefore remain conservative until compound/trimesh handling lands. */
function LabWorld({
  settings,
  cadShape,
  parkedShapes,
  componentShapes,
  componentJoints,
  groundedComponent,
  onState,
  onCadState,
  onComponentStates,
  onTrace,
  onCadTrace,
  onCollision,
  onTime,
  onFlightTelemetry,
  onGroundTelemetry,
  onJointActuatorTelemetry,
  onRobotTerrainTelemetry,
  onCadTelemetrySample,
  onCadImpact,
  onReplanDecision,
  onTransientMaterialState,
  onFracture,
  onSimulationTargetReached,
  onWorldReady,
  worldKey,
}: {
  settings: Settings;
  cadShape: CadShape;
  parkedShapes: ParkedShape[];
  componentShapes: ComponentShape[];
  componentJoints: Joint[];
  groundedComponent: string | null;
  onState: (s: BodyState) => void;
  onCadState: (s: BodyState) => void;
  onComponentStates: (s: ComponentState[]) => void;
  onTrace: (p: Vec3) => void;
  onCadTrace: (p: Vec3) => void;
  onCollision: (e: CollisionEvent) => void;
  onTime: (seconds: number) => void;
  onFlightTelemetry: (telemetry: FlightTelemetry) => void;
  onGroundTelemetry: (telemetry: GroundTelemetry) => void;
  onJointActuatorTelemetry: (telemetry: JointActuatorTelemetry[]) => void;
  onRobotTerrainTelemetry: (telemetry: RobotTerrainTelemetry) => void;
  onCadTelemetrySample: (sample: CadTelemetrySample) => void;
  onCadImpact: (impact: ImpactLoad) => void;
  onReplanDecision: (decision: ReplanDecision) => void;
  onTransientMaterialState: (state: TransientMaterialState) => void;
  onFracture: (event: FractureEvent) => void;
  onSimulationTargetReached: (seconds: number) => void;
  onWorldReady: (ready: boolean, worldKey: string) => void;
  worldKey: string;
}) {
  const world = useRef<RAPIER.World | null>(null);
  const ball = useRef<RAPIER.RigidBody | null>(null);
  const cad = useRef<RAPIER.RigidBody | null>(null);
  const cadHinge = useRef<RAPIER.RevoluteImpulseJoint | null>(null);
  const cadSlider = useRef<RAPIER.PrismaticImpulseJoint | null>(null);
  const armMotor = useRef<RAPIER.RevoluteImpulseJoint | null>(null);
  const componentMotors = useRef<ComponentMotor[]>([]);
  const jointActuatorTelemetry = useRef<JointActuatorTelemetry[]>([]);
  const robotStability = useRef<RobotStabilityState>({ fallenDurationS: 0, maxTiltDeg: 0, fallCount: 0, wasFallen: false });
  const robotTerrainTelemetry = useRef<RobotTerrainTelemetry>({
    fallenDurationS: 0, maxTiltDeg: 0, fallCount: 0, wasFallen: false,
    uprightDot: 1, tiltDeg: 0, fallen: false, centerHeightM: 0,
    horizontalSpeedMps: 0, terrainEnabled: false, roughnessM: 0,
    distanceFromStartM: 0,
  });
  const customConstraints = useRef<CustomConstraint[]>([]);
  const armBodies = useRef<RAPIER.RigidBody[]>([]);
  const componentBodies = useRef<RAPIER.RigidBody[]>([]);
  const extraBodies = useRef<RAPIER.RigidBody[]>([]);
  const fractureBodies = useRef<RAPIER.RigidBody[]>([]);
  const ballMesh = useRef<Mesh>(null);
  const cadMesh = useRef<Mesh>(null);
  const extraMeshes = useRef<Array<Mesh | null>>([]);
  const fractureMeshes = useRef<Array<Mesh | null>>([]);
  const armMeshes = useRef<Array<Mesh | null>>([]);
  const componentMeshes = useRef<Array<Mesh | null>>([]);
  const accumulator = useRef(0);
  const reportClock = useRef(0);
  const lastCadTelemetrySampleAt = useRef(0);
  const elapsed = useRef(0);
  const colliderLabels = useRef(new Map<number, string>());
  const roomColliderHandles = useRef(new Set<number>());
  const waypointRouteIndex = useRef(0);
  const waypointDetour = useRef<Waypoint | null>(null);
  const replanCount = useRef(0);
  const lastReplanAt = useRef(-Infinity);
  const transientMaterial = useRef<TransientMaterialState>(initialTransientMaterialState());
  const fractured = useRef(false);
  const targetReachedSent = useRef(false);
  const floorContacts = useRef(new Set<string>());
  const lastForceReport = useRef(new Map<string, number>());
  const eventQueue = useRef<RAPIER.EventQueue | null>(null);
  const cadColliderHandle = useRef<number | null>(null);
  const flightTelemetry = useRef<FlightTelemetry>({
    atS: 0,
    airspeedMps: 0,
    liftN: 0,
    dragN: 0,
    thrustN: 0,
    commandedThrustN: 0,
    altitudeHoldEnabled: false,
    altitudeErrorM: 0,
    waypointEnabled: false,
    waypointDistanceM: 0,
    waypointIndex: 0,
    waypointCount: 0,
    waypointCompleted: false,
    obstacleAvoidanceEnabled: false,
    nearestObstacleDistanceM: null,
    raycastAvoidanceEnabled: false,
    nearestColliderDistanceM: null,
    detourActive: false,
    replanCount: 0,
    plannedTarget: null,
    dynamicPressurePa: 0,
    forceWorldN: [0, 0, 0],
  });
  const electricPropulsion = useRef<ElectricPropulsionState>({
    rotorThrustN: [0, 0, 0, 0],
    remainingWh: 500,
  });
  const groundTelemetry = useRef<GroundTelemetry>({
    atS: 0,
    forceWorldN: [0, 0, 0],
    torqueWorldNm: [0, 0, 0],
    forwardSpeedMps: 0,
    lateralSpeedMps: 0,
    speedErrorMps: 0,
    headingErrorDeg: 0,
    driveForceN: 0,
    lateralForceN: 0,
    steeringTorqueNm: 0,
    mechanicalPowerW: 0,
    grounded: false,
    targetSpeedMps: 0,
    waypointEnabled: false,
    waypointDistanceM: 0,
    waypointIndex: 0,
    waypointCount: 1,
    waypointCompleted: false,
    obstacleAvoidanceEnabled: false,
    raycastAvoidanceEnabled: false,
    nearestColliderDistanceM: null,
    detourActive: false,
    replanCount: 0,
    plannedTarget: null,
  });

  // Rapier's generic joint deliberately exposes independent linear/angular
  // coordinates. These helpers add the two CAD joint rules Rapier does not
  // provide natively, while retaining dynamic rigid bodies and collisions.
  const rotate = (q: RAPIER.Rotation, v: RAPIER.Vector3): RAPIER.Vector3 => {
    const tx = 2 * (q.y * v.z - q.z * v.y);
    const ty = 2 * (q.z * v.x - q.x * v.z);
    const tz = 2 * (q.x * v.y - q.y * v.x);
    return {
      x: v.x + q.w * tx + (q.y * tz - q.z * ty),
      y: v.y + q.w * ty + (q.z * tx - q.x * tz),
      z: v.z + q.w * tz + (q.x * ty - q.y * tx),
    };
  };
  const unit = (v: RAPIER.Vector3): RAPIER.Vector3 => {
    const l = Math.hypot(v.x, v.y, v.z);
    // A malformed imported transform must never inject NaN into Rapier. A
    // zero/invalid direction simply yields no aerodynamic force this frame.
    if (!Number.isFinite(l) || l < 1e-9) return { x: 0, y: 0, z: 0 };
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  };
  const applyPair = (
    parent: RAPIER.RigidBody,
    child: RAPIER.RigidBody,
    impulse: RAPIER.Vector3,
    torque?: RAPIER.Vector3,
  ) => {
    if (!child.isFixed()) {
      child.applyImpulse(impulse, true);
      if (torque) child.applyTorqueImpulse(torque, true);
    }
    if (!parent.isFixed()) {
      parent.applyImpulse({ x: -impulse.x, y: -impulse.y, z: -impulse.z }, true);
      if (torque)
        parent.applyTorqueImpulse(
          { x: -torque.x, y: -torque.y, z: -torque.z },
          true,
        );
    }
  };

  useEffect(() => {
    let alive = true;
    onWorldReady(false, worldKey);
    void RAPIER.init().then(() => {
      if (!alive) return;
      const w = new RAPIER.World({ x: 0, y: -settings.gravity, z: 0 });
      electricPropulsion.current = {
        rotorThrustN: [0, 0, 0, 0],
        remainingWh: settings.cadBatteryCapacityWh,
      };
      const material = (d: RAPIER.ColliderDesc) => {
        d.setFriction(settings.friction);
        d.setRestitution(settings.restitution);
        d.setActiveEvents(
          RAPIER.ActiveEvents.COLLISION_EVENTS |
            RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS,
        );
        // A low non-zero threshold avoids noisy near-zero contacts while still
        // reporting gentle drops and CAD-to-CAD impacts in the lab report.
        d.setContactForceEventThreshold(0.05);
        return d;
      };
      const fixed = w.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const halfW = settings.roomWidth / 2,
        halfD = settings.roomDepth / 2,
        halfH = settings.roomHeight / 2;
      const room: RAPIER.Collider[] = [];
      for (const d of [
        RAPIER.ColliderDesc.cuboid(halfW, 0.1, halfD).setTranslation(
          0,
          -0.1,
          0,
        ),
        RAPIER.ColliderDesc.cuboid(0.1, halfH, halfD).setTranslation(
          -halfW,
          halfH,
          0,
        ),
        RAPIER.ColliderDesc.cuboid(0.1, halfH, halfD).setTranslation(
          halfW,
          halfH,
          0,
        ),
        RAPIER.ColliderDesc.cuboid(halfW, halfH, 0.1).setTranslation(
          0,
          halfH,
          -halfD,
        ),
        RAPIER.ColliderDesc.cuboid(halfW, halfH, 0.1).setTranslation(
          0,
          halfH,
          halfD,
        ),
        RAPIER.ColliderDesc.cuboid(halfW, 0.1, halfD).setTranslation(
          0,
          settings.roomHeight + 0.1,
          0,
        ),
      ])
        room.push(w.createCollider(material(d), fixed));
      const b = w.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(
            settings.startX,
            settings.startHeight,
            settings.startZ,
          )
          .setLinvel(settings.startVx, 0, settings.startVz),
      );
      const ballCollider = w.createCollider(
        material(
          RAPIER.ColliderDesc.ball(0.45).setDensity(
            BALL_MATERIALS[settings.ballMaterial].densityKgM3,
          ),
        ),
        b,
      );
      const cadDescription =
        settings.cadBodyMode === "fixed"
          ? RAPIER.RigidBodyDesc.fixed()
          : RAPIER.RigidBodyDesc.dynamic().setLinvel(
              settings.cadStartVx,
              0,
              settings.cadStartVz,
            );
      const c = w.createRigidBody(
        cadDescription.setTranslation(
          settings.cadStartX,
          settings.cadStartHeight,
          settings.cadStartZ,
        ),
      );
      const hull = RAPIER.ColliderDesc.convexHull(cadShape.positions);
      const cadCollider = w.createCollider(
        material(
          hull ??
            RAPIER.ColliderDesc.cuboid(
              cadShape.size[0] / 2,
              cadShape.size[1] / 2,
              cadShape.size[2] / 2,
            ),
        ).setDensity(cadShape.densityKgM3),
        c,
      );
      // Ground vehicles already model longitudinal traction and lateral tyre
      // grip explicitly. Disable Rapier's generic contact friction for this
      // collider and force the MIN combine rule: the default AVERAGE rule
      // would mix the zero value with the room floor friction and can still
      // statically lock a heavy CAD body even while drive force is applied.
      // Rolling/lateral resistance remains in stepGroundVehicleController.
      if (settings.cadGroundVehicleEnabled) {
        cadCollider.setFriction(0);
        cadCollider.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
      }
      cadColliderHandle.current = cadCollider.handle;
      if (settings.cadBodyMode === "dynamic" && settings.cadHinge) {
        const pivot = {
          x: settings.cadStartX,
          y: settings.cadStartHeight + cadShape.size[1] / 2,
          z: settings.cadStartZ,
        };
        const hinge = w.createImpulseJoint(
          RAPIER.JointData.revolute(
            pivot,
            { x: 0, y: cadShape.size[1] / 2, z: 0 },
            { x: 0, y: 0, z: 1 },
          ),
          fixed,
          c,
          true,
        ) as RAPIER.RevoluteImpulseJoint;
        hinge.setLimits(-Math.PI * 0.75, Math.PI * 0.75);
        hinge.setContactsEnabled(true);
        cadHinge.current = hinge;
      } else if (settings.cadBodyMode === "dynamic" && settings.cadSlider) {
        const rail = w.createImpulseJoint(
          RAPIER.JointData.prismatic(
            {
              x: settings.cadStartX,
              y: settings.cadStartHeight,
              z: settings.cadStartZ,
            },
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 0, z: 0 },
          ),
          fixed,
          c,
          true,
        ) as RAPIER.PrismaticImpulseJoint;
        rail.setLimits(-2.5, 2.5);
        rail.setContactsEnabled(true);
        cadSlider.current = rail;
        cadHinge.current = null;
      } else {
        cadHinge.current = null;
        cadSlider.current = null;
      }
      const labels = new Map<number, string>([
        [ballCollider.handle, "測試球"],
        [cadCollider.handle, "CAD 物件"],
      ]);
      // Sibling CAD bodies are fixed fixtures: their local vertices are already
      // expressed relative to the active body's CAD centre, so they retain the
      // design's relative layout while the active body can fall into them.
      parkedShapes.forEach((shape) => {
        const parkedBody = w.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(
            settings.cadStartX,
            settings.cadStartHeight,
            settings.cadStartZ,
          ),
        );
        const hull = RAPIER.ColliderDesc.convexHull(shape.positions);
        const collider = w.createCollider(
          material(
            hull ??
              RAPIER.ColliderDesc.cuboid(
                shape.size[0] / 2,
                shape.size[1] / 2,
                shape.size[2] / 2,
              ),
          ).setDensity(cadShape.densityKgM3),
          parkedBody,
        );
        labels.set(collider.handle, `CAD 固定實體：${shape.name}`);
      });
      const extras: RAPIER.RigidBody[] = [];
      for (let i = 0; i < settings.extraBalls; i++) {
        const x = -3.2 + (i % 4) * 1.05,
          z = i < 4 ? -1.15 : 1.15;
        const extra = w.createRigidBody(
          RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(
              x,
              settings.startHeight + 1.1 + Math.floor(i / 4) * 0.7,
              z,
            )
            .setLinvel(settings.startVx * 0.35, 0, 0),
        );
        const collider = w.createCollider(
          material(RAPIER.ColliderDesc.ball(0.28).setDensity(2700)),
          extra,
        );
        labels.set(collider.handle, `測試球 ${i + 2}`);
        extras.push(extra);
      }
      if (settings.rampEnabled) {
        const radians = (settings.rampAngle * Math.PI) / 180;
        const rampBody = w.createRigidBody(
          RAPIER.RigidBodyDesc.fixed()
            .setTranslation(0, 0.56, 0)
            .setRotation({
              x: 0,
              y: 0,
              z: Math.sin(radians / 2),
              w: Math.cos(radians / 2),
            }),
        );
        const ramp = w.createCollider(
          material(RAPIER.ColliderDesc.cuboid(2.5, 0.12, 1.3)),
          rampBody,
        );
        labels.set(ramp.handle, "斜坡障礙");
      }
      for (let i = 0; i < settings.obstacleCount; i++) {
        const height = 0.35 + (i % 3) * 0.28,
          x = -4.1 + (i % 5) * 1.55,
          z = 2.25 + Math.floor(i / 5) * 1.15;
        const obstacleBody = w.createRigidBody(
          RAPIER.RigidBodyDesc.fixed().setTranslation(x, height / 2, z),
        );
        const obstacle = w.createCollider(
          material(RAPIER.ColliderDesc.cuboid(0.42, height / 2, 0.42)),
          obstacleBody,
        );
        labels.set(obstacle.handle, `障礙方塊 ${i + 1}`);
      }
      if (settings.unevenTerrainEnabled) {
        const cells = 9;
        const tileX = Math.max(0.35, (settings.roomWidth - 0.8) / cells);
        const tileZ = Math.max(0.35, (settings.roomDepth - 0.8) / cells);
        for (let row = 0; row < cells; row++) {
          for (let column = 0; column < cells; column++) {
            const height = terrainTileHeightM(row, column, settings.terrainRoughnessM);
            const terrain = w.createCollider(
              material(
                RAPIER.ColliderDesc.cuboid(tileX * 0.49, Math.max(0.01, height / 2), tileZ * 0.49)
                  .setTranslation(
                    -settings.roomWidth / 2 + 0.4 + tileX * (column + 0.5),
                    Math.max(0.01, height / 2),
                    -settings.roomDepth / 2 + 0.4 + tileZ * (row + 0.5),
                  ),
              ),
              fixed,
            );
            labels.set(terrain.handle, `不平地形 ${row + 1}-${column + 1}`);
          }
        }
      }
      const imported: RAPIER.RigidBody[] = [];
      const importedById = new Map<string, RAPIER.RigidBody>();
      // Rebuilds may turn imported components off. Clear controllers before
      // conditional creation so they can never reference bodies from an old
      // Rapier world after a settings change.
      componentMotors.current = [];
      jointActuatorTelemetry.current = [];
      robotStability.current = { fallenDurationS: 0, maxTiltDeg: 0, fallCount: 0, wasFallen: false };
      customConstraints.current = [];
      if (settings.componentBodies)
        componentShapes.forEach((shape) => {
          // Keep the assembly's relative layout and occurrence rotation.  The layout is
          // normalized only when it would not fit inside this bounded lab room.
          const [x, oy, z] = shape.spawnOffset;
          const q = shape.spawnRotation;
          const desc =
            shape.id === groundedComponent
              ? RAPIER.RigidBodyDesc.fixed()
              : RAPIER.RigidBodyDesc.dynamic();
          const body = w.createRigidBody(
            desc
              .setTranslation(x, settings.startHeight + 1.4 + oy, z)
              .setRotation({ x: q[0], y: q[1], z: q[2], w: q[3] }),
          );
          const hull = RAPIER.ColliderDesc.convexHull(shape.positions);
          const collider = w.createCollider(
            material(
              hull ??
                RAPIER.ColliderDesc.cuboid(
                  shape.size[0] / 2,
                  shape.size[1] / 2,
                  shape.size[2] / 2,
                ),
            ).setDensity(shape.densityKgM3),
            body,
          );
          labels.set(collider.handle, `元件：${shape.name}`);
          imported.push(body);
          importedById.set(shape.id, body);
        });
      if (settings.componentBodies && componentShapes.length) {
        const layout = componentShapes[0];
        const toLabPoint = (p: Vec3): RAPIER.Vector3 => ({
          x: ((p[0] - layout.layoutOrigin[0]) / 1000) * layout.layoutScale,
          y:
            settings.startHeight +
            1.4 +
            ((p[1] - layout.layoutOrigin[1]) / 1000) * layout.layoutScale,
          z: ((p[2] - layout.layoutOrigin[2]) / 1000) * layout.layoutScale,
        });
        const rotateInverse = (
          body: RAPIER.RigidBody,
          v: RAPIER.Vector3,
        ): RAPIER.Vector3 => {
          const q = body.rotation(),
            ix = -q.x,
            iy = -q.y,
            iz = -q.z,
            iw = q.w;
          const rx = iw * v.x + iy * v.z - iz * v.y,
            ry = iw * v.y + iz * v.x - ix * v.z,
            rz = iw * v.z + ix * v.y - iy * v.x,
            rw2 = -ix * v.x - iy * v.y - iz * v.z;
          return {
            x: rx * iw + rw2 * -ix + ry * -iz - rz * -iy,
            y: ry * iw + rw2 * -iy + rz * -ix - rx * -iz,
            z: rz * iw + rw2 * -iz + rx * -iy - ry * -ix,
          };
        };
        const local = (body: RAPIER.RigidBody, p: RAPIER.Vector3) => {
          const t = body.translation();
          return rotateInverse(body, {
            x: p.x - t.x,
            y: p.y - t.y,
            z: p.z - t.z,
          });
        };
        for (const joint of componentJoints) {
          if (
            joint.type !== "revolute" &&
            joint.type !== "slider" &&
            joint.type !== "ball" &&
            joint.type !== "rigid" &&
            joint.type !== "cylindrical" &&
            joint.type !== "planar" &&
            joint.type !== "screw" &&
            joint.type !== "pinslot"
          )
            continue;
          // Four-bar / fixture assemblies use the conventional virtual GND parent.
          // Map it to the lab's fixed room body instead of silently dropping the joint.
          const parent =
              joint.parent === "GND" ? fixed : importedById.get(joint.parent),
            child = importedById.get(joint.child);
          if (!parent || !child) continue;
          const anchor = toLabPoint(joint.anchor);
          const worldAxis = unit({
            x: joint.axis[0],
            y: joint.axis[1],
            z: joint.axis[2],
          });
          const worldSlotAxis = unit(
            joint.type === "pinslot" && joint.axis2
              ? { x: joint.axis2[0], y: joint.axis2[1], z: joint.axis2[2] }
              : worldAxis,
          );
          const axis = rotateInverse(parent, {
              x: worldSlotAxis.x,
              y: worldSlotAxis.y,
              z: worldSlotAxis.z,
            }),
            pinAxis = rotateInverse(parent, {
              x: joint.axis[0],
              y: joint.axis[1],
              z: joint.axis[2],
            });
          const inverseFrame = (body: RAPIER.RigidBody) => {
            const q = body.rotation();
            return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
          };
          const genericMask =
            joint.type === "cylindrical"
              ? RAPIER.JointAxesMask.LinY |
                RAPIER.JointAxesMask.LinZ |
                RAPIER.JointAxesMask.AngY |
                RAPIER.JointAxesMask.AngZ
              : RAPIER.JointAxesMask.LinX |
                RAPIER.JointAxesMask.AngY |
                RAPIER.JointAxesMask.AngZ;
          const data =
            joint.type === "rigid"
              ? RAPIER.JointData.fixed(
                  local(parent, anchor),
                  inverseFrame(parent),
                  local(child, anchor),
                  inverseFrame(child),
                )
              : joint.type === "ball"
                ? RAPIER.JointData.spherical(
                    local(parent, anchor),
                    local(child, anchor),
                  )
                  : joint.type === "screw"
                    ? RAPIER.JointData.generic(
                        local(parent, anchor),
                        local(child, anchor),
                        pinAxis,
                        RAPIER.JointAxesMask.LinY |
                          RAPIER.JointAxesMask.LinZ |
                          RAPIER.JointAxesMask.AngY |
                          RAPIER.JointAxesMask.AngZ,
                      )
                    : joint.type === "pinslot"
                      ? RAPIER.JointData.generic(
                          local(parent, anchor),
                          local(child, anchor),
                          axis,
                          RAPIER.JointAxesMask.LinY |
                            RAPIER.JointAxesMask.LinZ,
                        )
                      : joint.type === "cylindrical" || joint.type === "planar"
                  ? RAPIER.JointData.generic(
                      local(parent, anchor),
                      local(child, anchor),
                      axis,
                      genericMask,
                    )
                  : joint.type === "revolute"
                    ? RAPIER.JointData.revolute(
                        local(parent, anchor),
                        local(child, anchor),
                        axis,
                      )
                    : RAPIER.JointData.prismatic(
                        local(parent, anchor),
                        local(child, anchor),
                        axis,
                      );
          const rapierJoint = w.createImpulseJoint(data, parent, child, true);
          rapierJoint.setContactsEnabled(true);
          if (joint.type === "screw") {
            customConstraints.current.push({
              type: "screw",
              parent,
              child,
              parentAnchor: local(parent, anchor),
              childAnchor: local(child, anchor),
              parentAxis: pinAxis,
              childAxis: rotateInverse(child, worldAxis),
              pitchPerRad: ((joint.lead ?? 0) / 1000) * layout.layoutScale / (2 * Math.PI),
              angleRad: 0,
            });
          }
          if (joint.type === "pinslot") {
            customConstraints.current.push({
              type: "pinslot",
              parent,
              child,
              parentPinAxis: pinAxis,
              childPinAxis: rotateInverse(child, worldAxis),
            });
          }
          if (joint.type === "revolute") {
            const motor = rapierJoint as RAPIER.RevoluteImpulseJoint;
            componentMotors.current.push({
              type: "revolute", id: joint.id, name: joint.name, joint: motor,
              parent, child, axisParent: axis,
              min: joint.aMin == null ? null : joint.aMin * Math.PI / 180,
              max: joint.aMax == null ? null : joint.aMax * Math.PI / 180,
              position: joint.angle * Math.PI / 180,
            });
            if (joint.aMin != null || joint.aMax != null)
              motor.setLimits(
                ((joint.aMin ?? -360) * Math.PI) / 180,
                ((joint.aMax ?? 360) * Math.PI) / 180,
              );
          }
          if (joint.type === "slider") {
            const motor = rapierJoint as RAPIER.PrismaticImpulseJoint;
            componentMotors.current.push({
              type: "slider", id: joint.id, name: joint.name, joint: motor,
              parent, child, axisParent: axis,
              min: joint.sMin == null ? null : joint.sMin / 1000 * layout.layoutScale,
              max: joint.sMax == null ? null : joint.sMax / 1000 * layout.layoutScale,
              position: joint.slide / 1000 * layout.layoutScale,
            });
            if (joint.sMin != null || joint.sMax != null)
              motor.setLimits(
                ((joint.sMin ?? -5000) / 1000) * layout.layoutScale,
                ((joint.sMax ?? 5000) / 1000) * layout.layoutScale,
              );
          }
        }
      }
      const links: RAPIER.RigidBody[] = [];
      if (settings.demoArm) {
        const base = { x: -3.5, y: 5.45, z: -2.4 },
          linkLength = 1.1;
        let parent: RAPIER.RigidBody = fixed;
        for (let i = 0; i < 3; i++) {
          const link = w.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic().setTranslation(
              base.x,
              base.y - linkLength * (i + 0.5),
              base.z,
            ),
          );
          const linkCollider = w.createCollider(
            material(
              RAPIER.ColliderDesc.cuboid(0.13, linkLength / 2, 0.13).setDensity(
                2700,
              ),
            ),
            link,
          );
          labels.set(linkCollider.handle, `機械臂連桿 ${i + 1}`);
          const anchor1 = i === 0 ? base : { x: 0, y: -linkLength / 2, z: 0 };
          const joint = w.createImpulseJoint(
            RAPIER.JointData.revolute(
              anchor1,
              { x: 0, y: linkLength / 2, z: 0 },
              { x: 0, y: 0, z: 1 },
            ),
            parent,
            link,
            true,
          ) as RAPIER.RevoluteImpulseJoint;
          joint.setLimits(-Math.PI * 0.9, Math.PI * 0.9);
          joint.setContactsEnabled(true);
          if (i === 0) armMotor.current = joint;
          parent = link;
          links.push(link);
        }
      } else armMotor.current = null;
      room.forEach((x, i) =>
        labels.set(
          x.handle,
          i === 0
            ? "實驗室地面"
            : i === room.length - 1
              ? "實驗室天花"
              : "實驗室牆",
        ),
      );
      roomColliderHandles.current = new Set(room.map((x) => x.handle));
      colliderLabels.current = labels;
      floorContacts.current.clear();
      lastForceReport.current.clear();
      eventQueue.current?.free();
      eventQueue.current = new RAPIER.EventQueue(true);
      elapsed.current = 0;
      lastCadTelemetrySampleAt.current = 0;
      waypointRouteIndex.current = 0;
      waypointDetour.current = null;
      replanCount.current = 0;
      lastReplanAt.current = -Infinity;
      transientMaterial.current = initialTransientMaterialState();
      groundTelemetry.current = {
        ...groundTelemetry.current,
        atS: 0,
        forceWorldN: [0, 0, 0],
        torqueWorldNm: [0, 0, 0],
        forwardSpeedMps: 0,
        lateralSpeedMps: 0,
        speedErrorMps: settings.cadGroundTargetSpeedMps,
        headingErrorDeg: 0,
        driveForceN: 0,
        lateralForceN: 0,
        steeringTorqueNm: 0,
        mechanicalPowerW: 0,
        grounded: false,
        targetSpeedMps: settings.cadGroundTargetSpeedMps,
        waypointEnabled: settings.cadWaypointEnabled,
        waypointDistanceM: 0,
        waypointIndex: 0,
        waypointCount: settings.cadWaypointRoute.length || 1,
        waypointCompleted: false,
        obstacleAvoidanceEnabled: false,
        raycastAvoidanceEnabled: false,
        nearestColliderDistanceM: null,
        detourActive: false,
        replanCount: 0,
        plannedTarget: null,
      };
      fractured.current = false;
      fractureBodies.current = [];
      targetReachedSent.current = false;
      jointActuatorTelemetry.current = [];
      robotStability.current = { fallenDurationS: 0, maxTiltDeg: 0, fallCount: 0, wasFallen: false };
      world.current = w;
      ball.current = b;
      cad.current = c;
      if (cadMesh.current) cadMesh.current.visible = true;
      extraBodies.current = extras;
      armBodies.current = links;
      componentBodies.current = imported;
      onWorldReady(true, worldKey);
    });
    return () => {
      alive = false;
      onWorldReady(false, worldKey);
      world.current?.free();
      world.current = null;
      eventQueue.current?.free();
      eventQueue.current = null;
      colliderLabels.current.clear();
      roomColliderHandles.current.clear();
      floorContacts.current.clear();
      lastForceReport.current.clear();
      cadColliderHandle.current = null;
      waypointRouteIndex.current = 0;
      waypointDetour.current = null;
      replanCount.current = 0;
      lastReplanAt.current = -Infinity;
      transientMaterial.current = initialTransientMaterialState();
      fractured.current = false;
      fractureBodies.current = [];
      targetReachedSent.current = false;
      accumulator.current = 0;
    };
  }, [
    worldKey,
    settings.reset,
    settings.extraBalls,
    settings.cadHinge,
    settings.cadSlider,
    settings.rampEnabled,
    settings.rampAngle,
    settings.obstacleCount,
    settings.unevenTerrainEnabled,
    settings.terrainRoughnessM,
    settings.demoArm,
    settings.componentBodies,
    settings.roomWidth,
    settings.roomDepth,
    settings.roomHeight,
    cadShape,
    parkedShapes,
    componentShapes,
    componentJoints,
    groundedComponent,
  ]);

  useFrame((_, delta) => {
    const w = world.current,
      b = ball.current,
      c = cad.current;
    if (!w || !b || !c) return;
    w.gravity = { x: 0, y: -settings.gravity, z: 0 };
    if (cadHinge.current)
      cadHinge.current.configureMotorVelocity(
        (settings.motorRpm * Math.PI) / 30,
        0.7,
      );
    if (cadSlider.current)
      cadSlider.current.configureMotorVelocity(settings.sliderSpeed, 0.7);
    if (armMotor.current)
      armMotor.current.configureMotorVelocity(
        (settings.armRpm * Math.PI) / 30,
        0.7,
      );
    const applyComponentActuators = (dt: number) => {
      const actuatorReadings: JointActuatorTelemetry[] = [];
      componentMotors.current.forEach((motor) => {
      const worldAxis = unit(rotate(motor.parent.rotation(), motor.axisParent));
      const parentVelocity = motor.type === "revolute" ? motor.parent.angvel() : motor.parent.linvel();
      const childVelocity = motor.type === "revolute" ? motor.child.angvel() : motor.child.linvel();
      const measuredVelocity =
        (childVelocity.x - parentVelocity.x) * worldAxis.x +
        (childVelocity.y - parentVelocity.y) * worldAxis.y +
        (childVelocity.z - parentVelocity.z) * worldAxis.z;
      const targetVelocity = motor.type === "revolute"
        ? (settings.componentJointRpm * Math.PI) / 30
        : settings.componentJointRpm / 60;
      motor.position += measuredVelocity * dt;
      const position = motor.position;
      const maxEffort = motor.type === "revolute"
        ? settings.componentJointMaxTorqueNm
        : settings.componentJointMaxForceN;
      const output = stepJointActuator({
        mode: motor.type,
        targetVelocity,
        measuredVelocity,
        position,
        minPosition: motor.min,
        maxPosition: motor.max,
        maxEffort,
        velocityGain: motor.type === "revolute" ? 35 : 800,
        efficiency: settings.componentJointEfficiency,
      });
      const signedEffort = Math.sign(output.velocityError) * output.estimatedEffort;
      const effortVector = {
        x: worldAxis.x * signedEffort,
        y: worldAxis.y * signedEffort,
        z: worldAxis.z * signedEffort,
      };
      if (motor.type === "revolute") {
        motor.child.addTorque(effortVector, true);
        if (!motor.parent.isFixed()) motor.parent.addTorque({ x: -effortVector.x, y: -effortVector.y, z: -effortVector.z }, true);
      } else {
        motor.child.addForce(effortVector, true);
        if (!motor.parent.isFixed()) motor.parent.addForce({ x: -effortVector.x, y: -effortVector.y, z: -effortVector.z }, true);
      }
      actuatorReadings.push({
        ...output,
        id: motor.id,
        name: motor.name,
        type: motor.type,
        position,
        measuredVelocity,
        maxEffort,
        effortUnit: motor.type === "revolute" ? "N·m" : "N",
      });
      });
      jointActuatorTelemetry.current = actuatorReadings;
    };
    if (settings.running && settings.wind && settings.airDensity > 0) {
      // Trend-grade aerodynamic drag: a selectable horizontal air velocity acts through
      // relative velocity² and an approximate projected area. This is not CFD:
      // there is no wake, lift, turbulence, or orientation-dependent mesh area.
      const rhoAir = settings.airDensity,
        dragCoefficient = 1.0;
      const windVector: Vec3 =
        settings.windDirection === "x+"
          ? [settings.wind, 0, 0]
          : settings.windDirection === "x-"
            ? [-settings.wind, 0, 0]
            : settings.windDirection === "z+"
              ? [0, 0, settings.wind]
              : [0, 0, -settings.wind];
      const push = (rb: RAPIER.RigidBody, areaM2: number) => {
        if (rb.isFixed()) return;
        const velocity = rb.linvel(),
          rx = windVector[0] - velocity.x,
          rz = windVector[2] - velocity.z;
        const relativeSpeed = Math.hypot(rx, rz);
        if (relativeSpeed < 1e-5) return;
        const dragN =
          0.5 *
          rhoAir *
          dragCoefficient *
          Math.max(0.01, areaM2) *
          relativeSpeed *
          relativeSpeed;
        rb.addForce(
          {
            x: (dragN * rx) / relativeSpeed,
            y: 0,
            z: (dragN * rz) / relativeSpeed,
          },
          true,
        );
      };
      push(b, Math.PI * 0.45 * 0.45);
      if (!settings.cadFlightEnabled)
        push(c, Math.max(0.08, cadShape.size[1] * cadShape.size[2]));
      extraBodies.current.forEach((rb) => push(rb, Math.PI * 0.28 * 0.28));
      componentBodies.current.forEach((rb, i) => {
        const s = componentShapes[i]?.size;
        push(rb, s ? Math.max(0.08, s[1] * s[2]) : 1);
      });
      armBodies.current.forEach((rb) => push(rb, 0.08));
    }
    flightTelemetry.current = {
      atS: elapsed.current,
      airspeedMps: 0,
      liftN: 0,
      dragN: 0,
      thrustN: settings.cadFlightEnabled ? settings.cadThrustN : 0,
    commandedThrustN: 0,
    altitudeHoldEnabled: settings.cadAutopilotEnabled,
    altitudeErrorM: 0,
      waypointEnabled: settings.cadWaypointEnabled,
      waypointDistanceM: 0,
      waypointIndex: 0,
      waypointCount: settings.cadWaypointRoute.length || 1,
      waypointCompleted: false,
    obstacleAvoidanceEnabled: settings.cadObstacleAvoidanceEnabled,
    nearestObstacleDistanceM: null,
      raycastAvoidanceEnabled: settings.cadRaycastAvoidanceEnabled,
      nearestColliderDistanceM: null,
      detourActive: false,
      replanCount: 0,
      plannedTarget: null,
    dynamicPressurePa: 0,
      forceWorldN: [0, 0, 0],
    };
    const applyCadFlightController = () => {
      if (!(settings.running && settings.cadFlightEnabled && !c.isFixed())) return;
      // Rapier clears neither the controller's intent nor its feedback for us.
      // Rebuild the active CAD force/torque command at every fixed 120 Hz
      // substep so accelerated batches follow the same closed-loop dynamics as
      // real-time playback instead of holding one stale render-frame command.
      c.resetForces(true);
      c.resetTorques(true);
      // Body +Y is thrust/up and +X is forward.  Lift is perpendicular to
      // relative airflow, therefore banking the imported CAD body changes the
      // flight path while gravity and collision remain Rapier-controlled.
      const windVector: Vec3 =
        settings.windDirection === "x+"
          ? [settings.wind, 0, 0]
          : settings.windDirection === "x-"
            ? [-settings.wind, 0, 0]
            : settings.windDirection === "z+"
              ? [0, 0, settings.wind]
              : [0, 0, -settings.wind];
      const q = c.rotation();
      const up = unit(rotate(q, { x: 0, y: 1, z: 0 }));
      const velocity = c.linvel();
      const relative = {
        x: velocity.x - windVector[0],
        y: velocity.y - windVector[1],
        z: velocity.z - windVector[2],
      };
      const rawAirspeed = Math.hypot(relative.x, relative.y, relative.z);
      const airspeed = Number.isFinite(rawAirspeed) ? rawAirspeed : 0;
      const dynamicPressure = 0.5 * settings.airDensity * airspeed ** 2;
      let liftN = 0;
      let dragN = 0;
      let aerodynamic = { x: 0, y: 0, z: 0 };
      if (settings.airDensity > 0 && airspeed > 1e-4) {
        const flow = {
          x: relative.x / airspeed,
          y: relative.y / airspeed,
          z: relative.z / airspeed,
        };
        const upDotFlow = up.x * flow.x + up.y * flow.y + up.z * flow.z;
        const liftDirection = unit({
          x: up.x - flow.x * upDotFlow,
          y: up.y - flow.y * upDotFlow,
          z: up.z - flow.z * upDotFlow,
        });
        liftN =
          dynamicPressure *
          settings.cadLiftCoefficient *
          settings.cadReferenceAreaM2;
        dragN =
          dynamicPressure *
          settings.cadDragCoefficient *
          settings.cadReferenceAreaM2;
        aerodynamic = {
          x: liftDirection.x * liftN - flow.x * dragN,
          y: liftDirection.y * liftN - flow.y * dragN,
          z: liftDirection.z * liftN - flow.z * dragN,
        };
      }
      const position = c.translation();
      const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
      const massRaw = c.mass();
      const massKg = Number.isFinite(massRaw) && massRaw > 0 ? Math.min(massRaw, 100) : 1;
      const altitude = finite(position.y, settings.cadTargetAltitudeM);
      const altitudeErrorM = settings.cadTargetAltitudeM - altitude;
      const waypointHoldEnabled = settings.cadWaypointEnabled;
      const obstacleAvoidanceEnabled = waypointHoldEnabled && settings.cadObstacleAvoidanceEnabled;
      const waypointRoute = settings.cadWaypointRoute.length
        ? settings.cadWaypointRoute
        : [{ x: settings.cadWaypointX, z: settings.cadWaypointZ }];
      let waypointIndex = Math.max(0, Math.min(waypointRoute.length - 1, waypointRouteIndex.current));
      const originalWaypointTarget = waypointRoute[waypointIndex];
      let waypointTarget = waypointDetour.current ?? originalWaypointTarget;
      let waypointDx = waypointTarget.x - finite(position.x, waypointTarget.x);
      let waypointDz = waypointTarget.z - finite(position.z, waypointTarget.z);
      let waypointDistanceM = Math.hypot(waypointDx, waypointDz);
      let waypointCompleted = false;
      if (waypointHoldEnabled && waypointDetour.current && waypointDistanceM <= 0.4) {
        waypointDetour.current = null;
        waypointTarget = originalWaypointTarget;
        waypointDx = waypointTarget.x - finite(position.x, waypointTarget.x);
        waypointDz = waypointTarget.z - finite(position.z, waypointTarget.z);
        waypointDistanceM = Math.hypot(waypointDx, waypointDz);
      } else if (waypointHoldEnabled && !waypointDetour.current && waypointDistanceM <= 0.35) {
        if (waypointIndex + 1 < waypointRoute.length) {
          waypointIndex += 1;
          waypointRouteIndex.current = waypointIndex;
          waypointTarget = waypointRoute[waypointIndex];
          waypointDx = waypointTarget.x - finite(position.x, waypointTarget.x);
          waypointDz = waypointTarget.z - finite(position.z, waypointTarget.z);
          waypointDistanceM = Math.hypot(waypointDx, waypointDz);
        } else if (settings.cadWaypointLoop && waypointRoute.length > 1) {
          waypointIndex = 0;
          waypointRouteIndex.current = 0;
          waypointTarget = waypointRoute[0];
          waypointDx = waypointTarget.x - finite(position.x, waypointTarget.x);
          waypointDz = waypointTarget.z - finite(position.z, waypointTarget.z);
          waypointDistanceM = Math.hypot(waypointDx, waypointDz);
        } else {
          waypointCompleted = true;
        }
      }
      let nearestObstacleDistanceM: number | null = null;
      let avoidX = 0;
      let avoidZ = 0;
      let requestedWorldTorque = { x: 0, y: 0, z: 0 };
      if (obstacleAvoidanceEnabled) {
        for (let i = 0; i < settings.obstacleCount; i++) {
          const ox = -4.1 + (i % 5) * 1.55;
          const oz = 2.25 + Math.floor(i / 5) * 1.15;
          const dx = finite(position.x, ox) - ox;
          const dz = finite(position.z, oz) - oz;
          const distance = Math.hypot(dx, dz);
          if (nearestObstacleDistanceM == null || distance < nearestObstacleDistanceM)
            nearestObstacleDistanceM = distance;
          // The fixed cubes are 0.84m wide. Start a smooth repulsion at 2m;
          // a zero-distance fallback still points away rather than dividing by 0.
          if (distance < 2) {
            const strength = ((2 - distance) / 2) ** 2 * 0.75;
            const invDistance = distance > 1e-5 ? 1 / distance : 1;
            avoidX += (distance > 1e-5 ? dx : 1) * invDistance * strength;
            avoidZ += (distance > 1e-5 ? dz : 0) * invDistance * strength;
          }
        }
      }
      const raycastAvoidanceEnabled = waypointHoldEnabled && settings.cadRaycastAvoidanceEnabled;
      let nearestColliderDistanceM: number | null = null;
      const fanClearance = new Map<number, number>([[0, 3], [-0.42, 3], [0.42, 3]]);
      if (raycastAvoidanceEnabled && waypointDistanceM > 0.15) {
        const intended = unit({ x: waypointDx, y: 0, z: waypointDz });
        // Centre + two fan rays: query all collision-enabled bodies except the
        // active CAD model and the fixed room shell, including imported CAD hulls.
        for (const fan of [0, -0.42, 0.42]) {
          const dir = unit({ x: intended.x + fan * -intended.z, y: 0, z: intended.z + fan * intended.x });
          const hit = w.castRayAndGetNormal(
            new RAPIER.Ray({ x: finite(position.x), y: finite(position.y), z: finite(position.z) }, dir),
            3,
            false,
            undefined,
            undefined,
            undefined,
            c,
            // The room's six colliders share `fixed`; otherwise a navigation
            // ray would mistake the enclosing room itself for an obstacle.
            // All other colliders, including parked/imported CAD, remain valid.
            (collider) => !roomColliderHandles.current.has(collider.handle),
          );
          if (!hit) continue;
          const distance = hit.timeOfImpact;
          if (!Number.isFinite(distance)) continue;
          if (fan !== 0) fanClearance.set(fan, distance);
          if (nearestColliderDistanceM == null || distance < nearestColliderDistanceM) nearestColliderDistanceM = distance;
          const strength = ((3 - Math.min(3, distance)) / 3) ** 2 * 0.9;
          avoidX += finite(hit.normal.x) * strength;
          avoidZ += finite(hit.normal.z) * strength;
        }
        if (
          settings.cadDynamicReplanEnabled &&
          !waypointDetour.current &&
          nearestColliderDistanceM != null &&
          nearestColliderDistanceM < 1.8 &&
          elapsed.current - lastReplanAt.current >= 0.75
        ) {
          const leftClearance = fanClearance.get(-0.42) ?? 3;
          const rightClearance = fanClearance.get(0.42) ?? 3;
          const chosenSide: "left" | "right" = leftClearance >= rightClearance ? "left" : "right";
          const sideSign = chosenSide === "left" ? 1 : -1;
          const intended = unit({ x: waypointDx, y: 0, z: waypointDz });
          const detourTarget = {
            x: Math.max(-settings.roomWidth / 2 + 0.45, Math.min(settings.roomWidth / 2 - 0.45, finite(position.x) - intended.z * sideSign * 1.8 + intended.x)),
            z: Math.max(-settings.roomDepth / 2 + 0.45, Math.min(settings.roomDepth / 2 - 0.45, finite(position.z) + intended.x * sideSign * 1.8 + intended.z)),
          };
          waypointDetour.current = detourTarget;
          lastReplanAt.current = elapsed.current;
          replanCount.current += 1;
          onReplanDecision({
            atS: elapsed.current,
            waypointIndex,
            originalTarget: waypointRoute[waypointIndex],
            detourTarget,
            obstacleDistanceM: nearestColliderDistanceM,
            chosenSide,
          });
        }
      }
      if (waypointHoldEnabled && waypointDistanceM > 0.15) {
        // Tilt the thrust axis towards the target through a real Rapier torque.
        // Horizontal tilt is capped so altitude compensation remains meaningful.
        const desiredUp = unit({
          x: Math.max(-0.55, Math.min(0.55,
            waypointDx * settings.cadNavigationPolicy.navigationGain +
            avoidX * settings.cadNavigationPolicy.avoidanceGain -
            velocity.x * settings.cadNavigationPolicy.dampingGain * 0.08)),
          y: 1,
          z: Math.max(-0.55, Math.min(0.55,
            waypointDz * settings.cadNavigationPolicy.navigationGain +
            avoidZ * settings.cadNavigationPolicy.avoidanceGain -
            velocity.z * settings.cadNavigationPolicy.dampingGain * 0.08)),
        });
        const alignAxis = {
          x: up.y * desiredUp.z - up.z * desiredUp.y,
          y: up.z * desiredUp.x - up.x * desiredUp.z,
          z: up.x * desiredUp.y - up.y * desiredUp.x,
        };
        const angular = c.angvel();
        const torque = (align: number, angularVelocity: number) => {
          const raw = massKg * (2.5 * finite(align) - 0.45 * finite(angularVelocity));
          return Math.max(-40, Math.min(40, finite(raw)));
        };
        requestedWorldTorque = {
          x: torque(alignAxis.x, angular.x),
          y: torque(alignAxis.y, angular.y),
          z: torque(alignAxis.z, angular.z),
        };
      }
      // Bounded PD altitude hold; this stays deterministic and inspectable,
      // rather than making an unsupported claim of trained AI control.
      const commandedThrustN = (settings.cadAutopilotEnabled || waypointHoldEnabled)
        ? Math.max(
            0,
            Math.min(
              5000,
              massKg * settings.gravity / Math.max(0.2, finite(up.y, 1)) +
                massKg * (1.6 * altitudeErrorM - 2.1 * finite(velocity.y)),
            ),
          )
        : settings.cadThrustN;
      const inverseQ = { x: -q.x, y: -q.y, z: -q.z, w: q.w };
      const requestedBodyTorque = rotate(inverseQ, requestedWorldTorque);
      const rotorArmM = Math.max(0.05, Math.min(cadShape.size[0], cadShape.size[2]) * 0.42);
      const allocation = allocateQuadrotor({
        collectiveThrustN: commandedThrustN,
        bodyTorqueNm: [requestedBodyTorque.x, requestedBodyTorque.y, requestedBodyTorque.z],
        armM: rotorArmM,
        yawTorquePerThrustM: Math.max(0.005, rotorArmM * 0.08),
        maxRotorThrustN: settings.cadMaxRotorThrustN,
      });
      const propulsion = stepElectricPropulsion({
        previous: electricPropulsion.current,
        targetRotorThrustN: allocation.rotorThrustN,
        dtS: 1 / 120,
        motorTimeConstantS: settings.cadMotorTimeConstantS,
        maxRotorThrustN: settings.cadMaxRotorThrustN,
        batteryCapacityWh: settings.cadBatteryCapacityWh,
        electricalEfficiency: settings.cadElectricalEfficiency,
        rotorDiskAreaM2: settings.cadRotorDiskAreaM2,
        airDensityKgM3: settings.airDensity,
        avionicsPowerW: settings.cadAvionicsPowerW,
      });
      electricPropulsion.current = {
        rotorThrustN: propulsion.rotorThrustN,
        remainingWh: propulsion.remainingWh,
      };
      const achievedWrench = quadrotorWrench(
        propulsion.rotorThrustN,
        rotorArmM,
        Math.max(0.005, rotorArmM * 0.08),
      );
      const achievedWorldTorque = rotate(q, {
        x: achievedWrench.bodyTorqueNm[0],
        y: achievedWrench.bodyTorqueNm[1],
        z: achievedWrench.bodyTorqueNm[2],
      });
      if (achievedWorldTorque.x || achievedWorldTorque.y || achievedWorldTorque.z)
        c.addTorque(achievedWorldTorque, true);
      const resultant = {
        x: aerodynamic.x + up.x * achievedWrench.collectiveThrustN,
        y: aerodynamic.y + up.y * achievedWrench.collectiveThrustN,
        z: aerodynamic.z + up.z * achievedWrench.collectiveThrustN,
      };
      if (resultant.x || resultant.y || resultant.z) c.addForce(resultant, true);
      flightTelemetry.current = {
        atS: elapsed.current,
        airspeedMps: airspeed,
        liftN,
        dragN,
        thrustN: settings.cadThrustN,
        commandedThrustN,
        altitudeHoldEnabled: settings.cadAutopilotEnabled || waypointHoldEnabled,
        altitudeErrorM,
        waypointEnabled: waypointHoldEnabled,
        waypointDistanceM,
        waypointIndex,
        waypointCount: waypointRoute.length,
        waypointCompleted,
        obstacleAvoidanceEnabled,
        nearestObstacleDistanceM,
        raycastAvoidanceEnabled,
        nearestColliderDistanceM,
        detourActive: waypointDetour.current != null,
        replanCount: replanCount.current,
        plannedTarget: waypointDetour.current ?? waypointRoute[waypointIndex],
        dynamicPressurePa: dynamicPressure,
        forceWorldN: [resultant.x, resultant.y, resultant.z],
        rotorThrustN: propulsion.rotorThrustN,
        bodyTorqueNm: achievedWrench.bodyTorqueNm,
        motorSaturated: allocation.saturated,
        electricalPowerW: propulsion.electricalPowerW,
        batteryRemainingWh: propulsion.remainingWh,
        batteryStateOfCharge: propulsion.stateOfCharge,
        estimatedEnduranceS: propulsion.estimatedEnduranceS,
        batteryDepleted: propulsion.depleted,
      };
    };
    const applyCadGroundVehicleController = () => {
      if (
        !settings.running ||
        !settings.cadGroundVehicleEnabled ||
        settings.cadFlightEnabled ||
        c.isFixed()
      ) return;
      c.resetForces(true);
      c.resetTorques(true);
      const q = c.rotation();
      const forward = rotate(q, { x: 1, y: 0, z: 0 });
      const position = c.translation();
      const velocity = c.linvel();
      const angular = c.angvel();
      const route = settings.cadWaypointRoute.length
        ? settings.cadWaypointRoute
        : [{ x: settings.cadWaypointX, z: settings.cadWaypointZ }];
      let waypointIndex = Math.max(0, Math.min(route.length - 1, waypointRouteIndex.current));
      let target = waypointDetour.current ?? route[waypointIndex];
      let dx = target.x - position.x;
      let dz = target.z - position.z;
      let distance = Math.hypot(dx, dz);
      let waypointCompleted = false;
      if (settings.cadWaypointEnabled && waypointDetour.current && distance <= 0.4) {
        waypointDetour.current = null;
        target = route[waypointIndex];
        dx = target.x - position.x;
        dz = target.z - position.z;
        distance = Math.hypot(dx, dz);
      } else if (settings.cadWaypointEnabled && !waypointDetour.current && distance <= 0.35) {
        if (waypointIndex + 1 < route.length) {
          waypointIndex += 1;
          waypointRouteIndex.current = waypointIndex;
        } else if (settings.cadWaypointLoop && route.length > 1) {
          waypointIndex = 0;
          waypointRouteIndex.current = 0;
        } else {
          waypointCompleted = true;
        }
        target = route[waypointIndex];
        dx = target.x - position.x;
        dz = target.z - position.z;
        distance = Math.hypot(dx, dz);
      }
      const obstacleAvoidanceEnabled =
        settings.cadWaypointEnabled && settings.cadObstacleAvoidanceEnabled;
      const raycastAvoidanceEnabled =
        settings.cadWaypointEnabled && settings.cadRaycastAvoidanceEnabled;
      let nearestColliderDistanceM: number | null = null;
      let avoidX = 0;
      let avoidZ = 0;
      if (obstacleAvoidanceEnabled) {
        for (let i = 0; i < settings.obstacleCount; i++) {
          const ox = -4.1 + (i % 5) * 1.55;
          const oz = 2.25 + Math.floor(i / 5) * 1.15;
          const obstacleDx = position.x - ox;
          const obstacleDz = position.z - oz;
          const obstacleDistance = Math.hypot(obstacleDx, obstacleDz);
          if (obstacleDistance < 2) {
            const strength = ((2 - obstacleDistance) / 2) ** 2;
            const inverse = obstacleDistance > 1e-5 ? 1 / obstacleDistance : 1;
            avoidX += (obstacleDistance > 1e-5 ? obstacleDx : 1) * inverse * strength;
            avoidZ += (obstacleDistance > 1e-5 ? obstacleDz : 0) * inverse * strength;
          }
        }
      }
      const fanClearance = new Map<number, number>([[-0.42, 3], [0.42, 3]]);
      if (raycastAvoidanceEnabled && distance > 0.15) {
        const intended = unit({ x: dx, y: 0, z: dz });
        for (const fan of [0, -0.42, 0.42]) {
          const direction = unit({
            x: intended.x + fan * -intended.z,
            y: 0,
            z: intended.z + fan * intended.x,
          });
          const hit = w.castRayAndGetNormal(
            new RAPIER.Ray({ x: position.x, y: position.y, z: position.z }, direction),
            3,
            false,
            undefined,
            undefined,
            undefined,
            c,
            (collider) => !roomColliderHandles.current.has(collider.handle),
          );
          if (!hit || !Number.isFinite(hit.timeOfImpact)) continue;
          fanClearance.set(fan, hit.timeOfImpact);
          nearestColliderDistanceM = nearestColliderDistanceM == null
            ? hit.timeOfImpact
            : Math.min(nearestColliderDistanceM, hit.timeOfImpact);
          const strength = ((3 - Math.min(3, hit.timeOfImpact)) / 3) ** 2;
          avoidX += hit.normal.x * strength;
          avoidZ += hit.normal.z * strength;
        }
        if (
          settings.cadDynamicReplanEnabled &&
          !waypointDetour.current &&
          nearestColliderDistanceM != null &&
          nearestColliderDistanceM < 1.8 &&
          elapsed.current - lastReplanAt.current >= 0.75
        ) {
          const leftClearance = fanClearance.get(-0.42) ?? 3;
          const rightClearance = fanClearance.get(0.42) ?? 3;
          const chosenSide: "left" | "right" = leftClearance >= rightClearance ? "left" : "right";
          const sideSign = chosenSide === "left" ? 1 : -1;
          const detourTarget = {
            x: Math.max(-settings.roomWidth / 2 + 0.45, Math.min(settings.roomWidth / 2 - 0.45, position.x - intended.z * sideSign * 1.8 + intended.x)),
            z: Math.max(-settings.roomDepth / 2 + 0.45, Math.min(settings.roomDepth / 2 - 0.45, position.z + intended.x * sideSign * 1.8 + intended.z)),
          };
          waypointDetour.current = detourTarget;
          lastReplanAt.current = elapsed.current;
          replanCount.current += 1;
          onReplanDecision({
            atS: elapsed.current,
            waypointIndex,
            originalTarget: route[waypointIndex],
            detourTarget,
            obstacleDistanceM: nearestColliderDistanceM,
            chosenSide,
          });
          target = detourTarget;
          dx = target.x - position.x;
          dz = target.z - position.z;
          distance = Math.hypot(dx, dz);
        }
      }
      const desiredDx = dx + avoidX * settings.cadNavigationPolicy.avoidanceGain;
      const desiredDz = dz + avoidZ * settings.cadNavigationPolicy.avoidanceGain;
      const rlActive = settings.cadRlNavigationEnabled
        && settings.cadRlNavigationPolicy != null
        && settings.cadWaypointEnabled
        && distance > 0.15;
      const desiredAngle = Math.atan2(dz, dx);
      const forwardAngle = Math.atan2(forward.z, forward.x);
      let headingErrorRad = desiredAngle - forwardAngle;
      while (headingErrorRad > Math.PI) headingErrorRad -= Math.PI * 2;
      while (headingErrorRad < -Math.PI) headingErrorRad += Math.PI * 2;
      const rlControl = rlActive
        ? rlActionControl(chooseRlAction(settings.cadRlNavigationPolicy!, {
            headingErrorRad,
            blockedLeft: (fanClearance.get(-0.42) ?? 3) < 1.8,
            blockedCenter: (fanClearance.get(0) ?? 3) < 1.8,
            blockedRight: (fanClearance.get(0.42) ?? 3) < 1.8,
          }))
        : null;
      const grounded =
        floorContacts.current.has("CAD 實體") ||
        position.y <= Math.max(0.06, cadShape.size[1] / 2) + 0.04;
      const output = stepGroundVehicleController({
        massKg: c.mass(),
        gravityMps2: settings.gravity,
        friction: settings.friction,
        velocityMps: [velocity.x, velocity.y, velocity.z],
        forwardWorld: [forward.x, forward.y, forward.z],
        yawRateRadS: angular.y,
        targetSpeedMps: settings.cadGroundTargetSpeedMps * (rlControl?.speedScale ?? 1),
        maxDriveForceN: settings.cadGroundMaxDriveForceN,
        maxBrakeForceN: settings.cadGroundMaxBrakeForceN,
        maxSteeringTorqueNm: settings.cadGroundMaxSteeringTorqueNm,
        steeringDeg: rlControl?.steeringDeg ?? settings.cadGroundSteeringDeg,
        targetDirectionWorld:
          !rlActive && settings.cadWaypointEnabled && distance > 0.15 ? [desiredDx, 0, desiredDz] : null,
        grounded,
      });
      if (output.forceWorldN.some((value) => value !== 0)) {
        c.addForce(
          { x: output.forceWorldN[0], y: 0, z: output.forceWorldN[2] },
          true,
        );
      }
      if (output.steeringTorqueNm !== 0) {
        c.addTorque(
          {
            x: output.torqueWorldNm[0],
            y: output.torqueWorldNm[1],
            z: output.torqueWorldNm[2],
          },
          true,
        );
      }
      groundTelemetry.current = {
        ...output,
        atS: elapsed.current,
        targetSpeedMps: settings.cadGroundTargetSpeedMps,
        waypointEnabled: settings.cadWaypointEnabled,
        waypointDistanceM: distance,
        waypointIndex,
        waypointCount: route.length,
        waypointCompleted,
        obstacleAvoidanceEnabled,
        raycastAvoidanceEnabled,
        nearestColliderDistanceM,
        detourActive: waypointDetour.current != null,
        replanCount: replanCount.current,
        plannedTarget: waypointDetour.current ?? route[waypointIndex],
      };
    };
    if (settings.running) {
      const frameStepBudget = settings.fastForwardEnabled
        ? Math.max(1, Math.round(settings.fastForwardStepsPerFrame))
        : Number.POSITIVE_INFINITY;
      accumulator.current += settings.fastForwardEnabled
        ? frameStepBudget / 120
        : Math.min(delta, 0.1) * settings.timeScale;
      let stepsThisFrame = 0;
      while (
        accumulator.current >= 1 / 120 &&
        stepsThisFrame < frameStepBudget &&
        (!settings.fastForwardEnabled || elapsed.current < settings.stopAtSimulationS)
      ) {
        w.timestep = 1 / 120;
        // Native generic joints keep the unconstrained coordinates free. These
        // impulses bind the remaining CAD semantics at the same fixed 120 Hz
        // step, so a loaded assembly remains collision-enabled and reacts to
        // gravity instead of becoming a transform animation.
        const dt = 1 / 120;
        applyComponentActuators(dt);
        applyCadFlightController();
        applyCadGroundVehicleController();
        customConstraints.current.forEach((constraint) => {
          const parentQ = constraint.parent.rotation();
          const childQ = constraint.child.rotation();
          const parentAxisLocal =
            constraint.type === "screw"
              ? constraint.parentAxis
              : constraint.parentPinAxis;
          const childAxisLocal =
            constraint.type === "screw"
              ? constraint.childAxis
              : constraint.childPinAxis;
          const parentAxis = unit(rotate(parentQ, parentAxisLocal));
          const childAxis = unit(
            rotate(childQ, childAxisLocal),
          );
          const pv = constraint.parent.linvel();
          const cv = constraint.child.linvel();
          const pw = constraint.parent.angvel();
          const cw = constraint.child.angvel();
          const relAngular =
            (cw.x - pw.x) * parentAxis.x +
            (cw.y - pw.y) * parentAxis.y +
            (cw.z - pw.z) * parentAxis.z;
          const motorTarget = (settings.componentJointRpm * Math.PI) / 30;
          if (constraint.type === "screw") {
            constraint.angleRad += relAngular * dt;
            const pt = constraint.parent.translation();
            const ct = constraint.child.translation();
            const pa = rotate(parentQ, constraint.parentAnchor);
            const ca = rotate(childQ, constraint.childAnchor);
            const slide =
              (ct.x + ca.x - pt.x - pa.x) * parentAxis.x +
              (ct.y + ca.y - pt.y - pa.y) * parentAxis.y +
              (ct.z + ca.z - pt.z - pa.z) * parentAxis.z;
            const relLinear =
              (cv.x - pv.x) * parentAxis.x +
              (cv.y - pv.y) * parentAxis.y +
              (cv.z - pv.z) * parentAxis.z;
            const error = slide - constraint.pitchPerRad * constraint.angleRad;
            const errorVelocity =
              relLinear - constraint.pitchPerRad * relAngular;
            // Sequential-impulse style PD correction. Values are capped to
            // remain stable for light imported parts and high time scales.
            const force = Math.max(
              -1200,
              Math.min(1200, -520 * error - 58 * errorVelocity),
            );
            const drive = Math.max(
              -0.35,
              Math.min(0.35, (motorTarget - relAngular) * 0.18),
            );
            applyPair(
              constraint.parent,
              constraint.child,
              {
                x: parentAxis.x * force * dt,
                y: parentAxis.y * force * dt,
                z: parentAxis.z * force * dt,
              },
              {
                x: parentAxis.x * drive,
                y: parentAxis.y * drive,
                z: parentAxis.z * drive,
              },
            );
          } else {
            // Pin-slot: the generic joint permits motion along slot axis;
            // this torque locks the two angular axes perpendicular to the
            // actual pin axis while leaving rotation around that pin free.
            const ex = childAxis.y * parentAxis.z - childAxis.z * parentAxis.y;
            const ey = childAxis.z * parentAxis.x - childAxis.x * parentAxis.z;
            const ez = childAxis.x * parentAxis.y - childAxis.y * parentAxis.x;
            const parallel = relAngular;
            const unwanted = {
              x: cw.x - pw.x - parentAxis.x * parallel,
              y: cw.y - pw.y - parentAxis.y * parallel,
              z: cw.z - pw.z - parentAxis.z * parallel,
            };
            const drive = Math.max(
              -0.35,
              Math.min(0.35, (motorTarget - parallel) * 0.18),
            );
            applyPair(
              constraint.parent,
              constraint.child,
              { x: 0, y: 0, z: 0 },
              {
                x: (34 * ex - 4.5 * unwanted.x) * dt + parentAxis.x * drive,
                y: (34 * ey - 4.5 * unwanted.y) * dt + parentAxis.y * drive,
                z: (34 * ez - 4.5 * unwanted.z) * dt + parentAxis.z * drive,
              },
            );
          }
        });
        w.step(eventQueue.current ?? undefined);
        if (settings.cadGroundVehicleEnabled) {
          const position = c.translation();
          const velocity = c.linvel();
          const stability = stepRobotStability({
            previous: robotStability.current,
            rotation: c.rotation(),
            centerHeightM: position.y,
            velocityMps: [velocity.x, velocity.y, velocity.z],
            minimumCenterHeightM: Math.max(0.03, cadShape.size[1] * 0.18),
            fallTiltDeg: settings.robotFallTiltDeg,
            dtS: dt,
          });
          robotStability.current = stability;
          robotTerrainTelemetry.current = {
            ...stability,
            terrainEnabled: settings.unevenTerrainEnabled,
            roughnessM: settings.terrainRoughnessM,
            distanceFromStartM: Math.hypot(position.x - settings.cadStartX, position.z - settings.cadStartZ),
          };
        }
        accumulator.current -= 1 / 120;
        elapsed.current += 1 / 120;
        stepsThisFrame += 1;
        // Actual contact stream from Rapier: this covers CAD-to-terrain,
        // CAD-to-CAD and room-wall contacts instead of only estimating floor hits.
        eventQueue.current?.drainCollisionEvents((first, second, started) => {
          if (!started) return;
          const a = colliderLabels.current.get(first),
            b2 = colliderLabels.current.get(second);
          if (a && b2)
            onCollision({ at: elapsed.current, label: `${a} ↔ ${b2}` });
        });
        let cadContactForceN = 0;
        let cadContactDirectionWorld: [number, number, number] = [0, 1, 0];
        let hasCadContactDirection = false;
        eventQueue.current?.drainContactForceEvents((event) => {
          const first = event.collider1();
          const second = event.collider2();
          const a = colliderLabels.current.get(first);
          const b2 = colliderLabels.current.get(second);
          if (!a || !b2) return;
          const forceN = event.totalForceMagnitude();
          const cadHandle = cadColliderHandle.current;
          if (cadHandle === first || cadHandle === second) {
            // Rapier reports maxForceDirection relative to collider1. Reverse
            // it for collider2 so this vector always acts on active CAD.
            const direction = event.maxForceDirection();
            const sign = cadHandle === first ? 1 : -1;
            const magnitudeN = event.maxForceMagnitude();
            if (Number.isFinite(magnitudeN) && magnitudeN > cadContactForceN) {
              cadContactForceN = magnitudeN;
              cadContactDirectionWorld = [
                direction.x * sign,
                direction.y * sign,
                direction.z * sign,
              ];
              hasCadContactDirection = true;
            }
            if (Number.isFinite(magnitudeN) && magnitudeN > 0)
              onCadImpact({
                atS: elapsed.current,
                magnitudeN,
                forceWorldN: [
                  direction.x * magnitudeN * sign,
                  direction.y * magnitudeN * sign,
                  direction.z * magnitudeN * sign,
                ],
                counterparty: cadHandle === first ? b2 : a,
                source: "rapier-max-contact",
              });
          }
          const key = [a, b2].sort().join(" ↔ ");
          // Contact forces are emitted every 120 Hz while objects rest. Keep
          // a readable sampled record without discarding the physics result.
          if ((lastForceReport.current.get(key) ?? -Infinity) + 0.15 > elapsed.current)
            return;
          lastForceReport.current.set(key, elapsed.current);
          onCollision({ at: elapsed.current, label: key, forceN });
        });
        if (settings.cadTransientEnabled && !c.isFixed()) {
          // Rapier gives the force in world space. Rotate it back into the CAD
          // body frame so geometry stiffness and the visual strain use the
          // actual impacted axis instead of always compressing world Y.
          let localDirection: [number, number, number] = transientMaterial.current.loadDirectionLocal;
          if (hasCadContactDirection) {
            localDirection = worldDirectionToLocal(cadContactDirectionWorld, c.rotation());
          }
          const absolute = localDirection.map(Math.abs);
          const axis = absolute[0] >= absolute[1] && absolute[0] >= absolute[2]
            ? 0
            : absolute[1] >= absolute[2] ? 1 : 2;
          const transverse = [0, 1, 2].filter((value) => value !== axis);
          const lengthM = Math.max(0.01, cadShape.size[axis]);
          transientMaterial.current = stepTransientMaterial(
            transientMaterial.current,
            cadContactForceN,
            1 / 120,
            {
              lengthM,
              areaM2: Math.max(1e-5, cadShape.size[transverse[0]] * cadShape.size[transverse[1]]),
              effectiveMassKg: Math.max(0.01, c.mass() * 0.25),
            },
            REDUCED_MATERIALS[settings.cadTransientMaterial],
            localDirection,
          );
          const strengthUtilization = Math.max(
            transientMaterial.current.damage,
            transientMaterial.current.maxStressPa / REDUCED_MATERIALS[settings.cadTransientMaterial].yieldPa,
          );
          if (
            settings.cadFractureEnabled &&
            !fractured.current &&
            strengthUtilization > 0 &&
            strengthUtilization >= settings.cadFractureDamageThreshold
          ) {
            fractured.current = true;
            const origin = c.translation();
            const rotation = c.rotation();
            const baseVelocity = c.linvel();
            const halfX = Math.max(0.025, cadShape.size[0] / 4);
            const halfY = Math.max(0.025, cadShape.size[1] / 2);
            const halfZ = Math.max(0.025, cadShape.size[2] / 4);
            const fragments: RAPIER.RigidBody[] = [];
            for (const [index, [sx, sz]] of ([[ -1, -1 ], [ 1, -1 ], [ -1, 1 ], [ 1, 1 ]] as const).entries()) {
              const radialX = sx * Math.max(0.3, Math.min(2.5, cadContactForceN / Math.max(1, c.mass()) * 0.0006));
              const radialZ = sz * Math.max(0.3, Math.min(2.5, cadContactForceN / Math.max(1, c.mass()) * 0.0006));
              const body = w.createRigidBody(
                RAPIER.RigidBodyDesc.dynamic()
                  .setTranslation(origin.x + sx * halfX, origin.y, origin.z + sz * halfZ)
                  .setRotation(rotation)
                  .setLinvel(baseVelocity.x + radialX, baseVelocity.y + 0.25, baseVelocity.z + radialZ),
              );
              const fragmentDesc = RAPIER.ColliderDesc.cuboid(halfX, halfY, halfZ)
                .setDensity(cadShape.densityKgM3)
                .setFriction(settings.friction)
                .setRestitution(settings.restitution)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
                .setContactForceEventThreshold(0.05);
              const collider = w.createCollider(
                fragmentDesc,
                body,
              );
              colliderLabels.current.set(collider.handle, `CAD 碎片 ${index + 1}`);
              fragments.push(body);
            }
            fractureBodies.current = fragments;
            c.setEnabled(false);
            if (cadMesh.current) cadMesh.current.visible = false;
            onFracture({
              atS: elapsed.current,
              damage: transientMaterial.current.damage,
              plasticStrain: transientMaterial.current.plasticStrain,
              strengthUtilization,
              fragmentCount: fragments.length,
              source: "reduced-order-damage-threshold",
            });
          }
        }
        // Record floor contact after stepping. This avoids passing a Rapier EventQueue
        // through React's render loop, which triggers a WASM borrow error in Chromium.
        const recordFloorContact = (
          rb: RAPIER.RigidBody,
          label: string,
          radius: number,
        ) => {
          const touching = rb.translation().y <= radius + 0.025;
          if (touching && !floorContacts.current.has(label)) {
            floorContacts.current.add(label);
            onCollision({
              at: elapsed.current,
              label: `${label} ↔ 實驗室地面`,
            });
          }
          if (!touching) floorContacts.current.delete(label);
        };
        recordFloorContact(b, "測試球", 0.45);
        recordFloorContact(c, "CAD 實體", Math.max(0.06, cadShape.size[1] / 2));
        extraBodies.current.forEach((rb, i) =>
          recordFloorContact(rb, `額外測試球 ${i + 2}`, 0.28),
        );
        componentBodies.current.forEach((rb, i) =>
          recordFloorContact(
            rb,
            componentShapes[i]?.name || `CAD 元件 ${i + 1}`,
            Math.max(0.06, (componentShapes[i]?.size[1] ?? 0.12) / 2),
          ),
        );
        if (elapsed.current - lastCadTelemetrySampleAt.current >= 0.1 - 1e-9) {
          lastCadTelemetrySampleAt.current = elapsed.current;
          const cadPosition = c.translation();
          const cadVelocity = c.linvel();
          onCadTelemetrySample({
            atS: elapsed.current,
            positionM: [cadPosition.x, cadPosition.y, cadPosition.z],
            velocityMps: [cadVelocity.x, cadVelocity.y, cadVelocity.z],
            flight: {
              ...flightTelemetry.current,
              forceWorldN: [...flightTelemetry.current.forceWorldN] as Vec3,
            },
            ground: {
              ...groundTelemetry.current,
              forceWorldN: [...groundTelemetry.current.forceWorldN] as Vec3,
              torqueWorldNm: [...groundTelemetry.current.torqueWorldNm] as Vec3,
            },
          });
        }
      }
      if (
        settings.fastForwardEnabled &&
        elapsed.current >= settings.stopAtSimulationS &&
        !targetReachedSent.current
      ) {
        targetReachedSent.current = true;
        onSimulationTargetReached(elapsed.current);
      }
    }
    for (const [rb, mesh] of [
      [b, ballMesh.current],
      [c, cadMesh.current],
    ] as const) {
      if (mesh) {
        const t = rb.translation(),
          q = rb.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(q.x, q.y, q.z, q.w);
        if (rb === c) {
          const state = transientMaterial.current;
          const axisIndex = state.loadAxis === "x" ? 0 : state.loadAxis === "y" ? 1 : 2;
          const strain = settings.cadTransientEnabled
            ? Math.min(0.35, Math.abs(state.displacementM) / Math.max(0.01, cadShape.size[axisIndex]))
            : 0;
          const scale: [number, number, number] = [1 + strain * 0.15, 1 + strain * 0.15, 1 + strain * 0.15];
          scale[axisIndex] = 1 - strain;
          mesh.scale.set(scale[0], scale[1], scale[2]);
        }
      }
    }
    extraBodies.current.forEach((rb, i) => {
      const mesh = extraMeshes.current[i];
      if (mesh) {
        const t = rb.translation(),
          q = rb.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
    });
    fractureBodies.current.forEach((rb, i) => {
      const mesh = fractureMeshes.current[i];
      if (!mesh) return;
      const t = rb.translation(), q = rb.rotation();
      mesh.visible = true;
      mesh.position.set(t.x, t.y, t.z);
      mesh.quaternion.set(q.x, q.y, q.z, q.w);
    });
    armBodies.current.forEach((rb, i) => {
      const mesh = armMeshes.current[i];
      if (mesh) {
        const t = rb.translation(),
          q = rb.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
    });
    componentBodies.current.forEach((rb, i) => {
      const mesh = componentMeshes.current[i];
      if (mesh) {
        const t = rb.translation(),
          q = rb.rotation();
        mesh.position.set(t.x, t.y, t.z);
        mesh.quaternion.set(q.x, q.y, q.z, q.w);
      }
    });
    reportClock.current += delta;
    if (reportClock.current >= 0.08) {
      reportClock.current = 0;
      const t = b.translation(),
        q = b.rotation(),
        v = b.linvel();
      const s: BodyState = {
        p: [t.x, t.y, t.z],
        r: [q.x, q.y, q.z, q.w],
        v: [v.x, v.y, v.z],
      };
      onState(s);
      const cadPosition = c.translation(),
        cadRotation = c.rotation(),
        cadVelocity = c.linvel();
      const cadState: BodyState = {
        p: [cadPosition.x, cadPosition.y, cadPosition.z],
        r: [cadRotation.x, cadRotation.y, cadRotation.z, cadRotation.w],
        v: [cadVelocity.x, cadVelocity.y, cadVelocity.z],
      };
      onCadState(cadState);
      onFlightTelemetry(flightTelemetry.current);
      onGroundTelemetry(groundTelemetry.current);
      onJointActuatorTelemetry(jointActuatorTelemetry.current.map((entry) => ({ ...entry })));
      onRobotTerrainTelemetry({ ...robotTerrainTelemetry.current });
      onTransientMaterialState({ ...transientMaterial.current });
      onComponentStates(
        componentBodies.current.flatMap((rb, i) => {
          const shape = componentShapes[i];
          if (!shape) return [];
          const p = rb.translation(),
            r = rb.rotation(),
            velocity = rb.linvel();
          return [
            {
              id: shape.id,
              name: shape.name,
              p: [p.x, p.y, p.z] as Vec3,
              r: [r.x, r.y, r.z, r.w] as [number, number, number, number],
              v: [velocity.x, velocity.y, velocity.z] as Vec3,
            },
          ];
        }),
      );
      onTime(elapsed.current);
      if (settings.running) {
        onTrace(s.p);
        onCadTrace(cadState.p);
      }
    }
  });
  return (
    <>
      <ambientLight intensity={1.4} />
      <directionalLight position={[5, 8, 5]} intensity={2.1} castShadow />
      <Grid
        args={[settings.roomWidth, settings.roomDepth]}
        cellSize={0.5}
        sectionSize={2}
        fadeDistance={Math.max(settings.roomWidth, settings.roomDepth) * 1.5}
        position={[0, 0.002, 0]}
      />
      <mesh position={[0, -0.05, 0]} receiveShadow>
        <boxGeometry args={[settings.roomWidth, 0.1, settings.roomDepth]} />
        <meshStandardMaterial color="#33404b" roughness={0.86} />
      </mesh>
      {settings.unevenTerrainEnabled && Array.from({ length: 81 }, (_, index) => {
        const cells = 9;
        const row = Math.floor(index / cells);
        const column = index % cells;
        const tileX = Math.max(0.35, (settings.roomWidth - 0.8) / cells);
        const tileZ = Math.max(0.35, (settings.roomDepth - 0.8) / cells);
        const height = terrainTileHeightM(row, column, settings.terrainRoughnessM);
        const visualHeight = Math.max(0.02, height);
        return (
          <mesh
            key={`terrain-${row}-${column}`}
            name={`uneven-terrain-${row + 1}-${column + 1}`}
            position={[
              -settings.roomWidth / 2 + 0.4 + tileX * (column + 0.5),
              visualHeight / 2,
              -settings.roomDepth / 2 + 0.4 + tileZ * (row + 0.5),
            ]}
            receiveShadow
          >
            <boxGeometry args={[tileX * 0.98, visualHeight, tileZ * 0.98]} />
            <meshStandardMaterial
              color={(row + column) % 2 ? "#64748b" : "#526170"}
              roughness={0.9}
            />
          </mesh>
        );
      })}
      {/* The room is deliberately visible: its six collision faces define the bounded lab volume. */}
      <group name="physics-lab-room" renderOrder={-1}>
        <mesh position={[-settings.roomWidth / 2, settings.roomHeight / 2, 0]}>
          <boxGeometry args={[0.04, settings.roomHeight, settings.roomDepth]} />
          <meshBasicMaterial
            color="#5bc0eb"
            transparent
            opacity={0.08}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[settings.roomWidth / 2, settings.roomHeight / 2, 0]}>
          <boxGeometry args={[0.04, settings.roomHeight, settings.roomDepth]} />
          <meshBasicMaterial
            color="#5bc0eb"
            transparent
            opacity={0.08}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, settings.roomHeight / 2, -settings.roomDepth / 2]}>
          <boxGeometry args={[settings.roomWidth, settings.roomHeight, 0.04]} />
          <meshBasicMaterial
            color="#5bc0eb"
            transparent
            opacity={0.08}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, settings.roomHeight / 2, settings.roomDepth / 2]}>
          <boxGeometry args={[settings.roomWidth, settings.roomHeight, 0.04]} />
          <meshBasicMaterial
            color="#5bc0eb"
            transparent
            opacity={0.08}
            depthWrite={false}
          />
        </mesh>
        <mesh position={[0, settings.roomHeight + 0.1, 0]}>
          <boxGeometry args={[settings.roomWidth, 0.04, settings.roomDepth]} />
          <meshBasicMaterial
            color="#5bc0eb"
            transparent
            opacity={0.055}
            depthWrite={false}
          />
        </mesh>
      </group>
      <mesh ref={ballMesh} castShadow>
        <sphereGeometry args={[0.45, 32, 20]} />
        <meshStandardMaterial
          color={BALL_MATERIALS[settings.ballMaterial].color}
          metalness={BALL_MATERIALS[settings.ballMaterial].metalness}
          roughness={BALL_MATERIALS[settings.ballMaterial].roughness}
        />
      </mesh>
      {Array.from({ length: settings.extraBalls }, (_, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            extraMeshes.current[i] = mesh;
          }}
          castShadow
        >
          <sphereGeometry args={[0.28, 24, 16]} />
          <meshStandardMaterial
            color="#e9c46a"
            metalness={0.22}
            roughness={0.38}
          />
        </mesh>
      ))}
      {settings.cadHinge && (
        <mesh
          position={[
            settings.cadStartX,
            settings.cadStartHeight + cadShape.size[1] / 2,
            settings.cadStartZ,
          ]}
        >
          <sphereGeometry args={[0.12, 18, 12]} />
          <meshStandardMaterial color="#e76f51" emissive="#642218" />
        </mesh>
      )}
      {settings.cadSlider && (
        <mesh
          position={[
            settings.cadStartX,
            settings.cadStartHeight,
            settings.cadStartZ,
          ]}
        >
          <boxGeometry args={[5, 0.09, 0.16]} />
          <meshStandardMaterial color="#e76f51" emissive="#642218" />
        </mesh>
      )}
      {settings.rampEnabled && (
        <mesh
          position={[0, 0.56, 0]}
          rotation={[0, 0, (settings.rampAngle * Math.PI) / 180]}
          receiveShadow
          castShadow
        >
          <boxGeometry args={[5, 0.24, 2.6]} />
          <meshStandardMaterial color="#5b7483" roughness={0.7} />
        </mesh>
      )}
      {Array.from({ length: settings.obstacleCount }, (_, i) => {
        const height = 0.35 + (i % 3) * 0.28,
          x = -4.1 + (i % 5) * 1.55,
          z = 2.25 + Math.floor(i / 5) * 1.15;
        return (
          <mesh
            key={`obstacle-${i}`}
            position={[x, height / 2, z]}
            receiveShadow
            castShadow
          >
            <boxGeometry args={[0.84, height, 0.84]} />
            <meshStandardMaterial color="#8a6f52" roughness={0.82} />
          </mesh>
        );
      })}
      {settings.demoArm && (
        <>
          <mesh position={[-3.5, 5.45, -2.4]}>
            <sphereGeometry args={[0.17, 18, 12]} />
            <meshStandardMaterial color="#dc4d5f" />
          </mesh>
          {Array.from({ length: 3 }, (_, i) => (
            <mesh
              key={`arm-${i}`}
              ref={(mesh) => {
                armMeshes.current[i] = mesh;
              }}
              castShadow
            >
              <boxGeometry args={[0.26, 1.1, 0.26]} />
              <meshStandardMaterial
                color="#ef8354"
                metalness={0.25}
                roughness={0.38}
              />
            </mesh>
          ))}
        </>
      )}
      {settings.componentBodies &&
        componentShapes.map((shape, i) => (
          <ComponentVisual
            key={shape.id}
            shape={shape}
            index={i}
            meshRefs={componentMeshes}
          />
        ))}
      {Array.from({ length: 4 }, (_, i) => (
        <mesh
          key={`fracture-${i}`}
          ref={(mesh) => { fractureMeshes.current[i] = mesh; }}
          visible={false}
          castShadow
        >
          <boxGeometry args={[
            Math.max(0.05, cadShape.size[0] / 2),
            Math.max(0.05, cadShape.size[1]),
            Math.max(0.05, cadShape.size[2] / 2),
          ]} />
          <meshStandardMaterial color="#ef6c42" metalness={0.15} roughness={0.62} />
        </mesh>
      ))}
      <CadVisual shape={cadShape} bodyRef={cadMesh} />
      <OrbitControls makeDefault target={new Vector3(0, 2, 0)} />
    </>
  );
}

function fmt(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : "—";
}

export default function PhysicsLab() {
  const close = useApp((s) => s.setPhysicsLabOpen);
  const body = useApp((s) => s.bodyMesh);
  const bodyDensity = useApp((s) => s.bodyDensity);
  const components = useApp((s) => s.components);
  const joints = useApp((s) => s.joints);
  const groundedComponent = useApp((s) => s.grounded);
  const feaFixed = useApp((s) => s.feaFixed);
  const feaLoad = useApp((s) => s.feaLoad);
  const feaResult = useApp((s) => s.feaResult);
  const feaBusy = useApp((s) => s.feaBusy);
  const setFeaOpt = useApp((s) => s.setFeaOpt);
  const autoFeaCantilever = useApp((s) => s.autoFeaCantilever);
  const runFeaSolve = useApp((s) => s.runFeaSolve);
  const windResult = useApp((s) => s.windResult);
  const [gravity, setGravity] = useState(9.81),
    [environmentPreset, setEnvironmentPreset] =
      useState<EnvironmentPreset>("earth"),
    [restitution, setRestitution] = useState(0.62),
    [friction, setFriction] = useState(0.55),
    [airDensity, setAirDensity] = useState(1.225),
    [wind, setWind] = useState(0),
    [windDirection, setWindDirection] = useState<WindDirection>("x+"),
    [ballMaterial, setBallMaterial] = useState<BallMaterial>("steel"),
    [roomWidth, setRoomWidth] = useState(14),
    [roomDepth, setRoomDepth] = useState(14),
    [roomHeight, setRoomHeight] = useState(6);
  const [startX, setStartX] = useState(-1.1),
    [startHeight, setStartHeight] = useState(4.5),
    [startZ, setStartZ] = useState(0),
    [startVx, setStartVx] = useState(0),
    [startVz, setStartVz] = useState(0),
    [cadStartX, setCadStartX] = useState(1.2),
    [cadStartHeight, setCadStartHeight] = useState(5.3),
    [cadStartZ, setCadStartZ] = useState(0),
    [cadStartVx, setCadStartVx] = useState(0),
    [cadStartVz, setCadStartVz] = useState(0),
    [cadBodyMode, setCadBodyMode] = useState<CadBodyMode>("dynamic"),
    [extraBalls, setExtraBalls] = useState(0),
    [cadHinge, setCadHinge] = useState(false),
    [motorRpm, setMotorRpm] = useState(0),
    [cadSlider, setCadSlider] = useState(false),
    [sliderSpeed, setSliderSpeed] = useState(0),
    [rampEnabled, setRampEnabled] = useState(false),
    [rampAngle, setRampAngle] = useState(12),
    [obstacleCount, setObstacleCount] = useState(0),
    [unevenTerrainEnabled, setUnevenTerrainEnabled] = useState(false),
    [terrainRoughnessM, setTerrainRoughnessM] = useState(0.18),
    [robotFallTiltDeg, setRobotFallTiltDeg] = useState(60),
    [timeScale, setTimeScale] = useState(1),
    [fastForwardEnabled, setFastForwardEnabled] = useState(false),
    [fastForwardStepsPerFrame, setFastForwardStepsPerFrame] = useState(240),
    [stopAtSimulationS, setStopAtSimulationS] = useState(60),
    [demoArm, setDemoArm] = useState(false),
    [armRpm, setArmRpm] = useState(0),
    [componentBodiesEnabled, setComponentBodiesEnabled] = useState(false),
    [componentJointRpm, setComponentJointRpm] = useState(0),
    [componentJointMaxTorqueNm, setComponentJointMaxTorqueNm] = useState(120),
    [componentJointMaxForceN, setComponentJointMaxForceN] = useState(1500),
    [componentJointEfficiency, setComponentJointEfficiency] = useState(0.8),
    [cadFlightEnabled, setCadFlightEnabled] = useState(false),
    [cadGroundVehicleEnabled, setCadGroundVehicleEnabled] = useState(false),
    [cadGroundTargetSpeedMps, setCadGroundTargetSpeedMps] = useState(4),
    [cadGroundMaxDriveForceN, setCadGroundMaxDriveForceN] = useState(500),
    [cadGroundMaxBrakeForceN, setCadGroundMaxBrakeForceN] = useState(800),
     [cadGroundSteeringDeg, setCadGroundSteeringDeg] = useState(0),
     [cadGroundMaxSteeringTorqueNm, setCadGroundMaxSteeringTorqueNm] = useState(250),
    [cadRlNavigationEnabled, setCadRlNavigationEnabled] = useState(false),
    [cadRlNavigationPolicy, setCadRlNavigationPolicy] = useState<TabularNavigationPolicy | null>(null),
    [cadThrustN, setCadThrustN] = useState(0),
    [cadBatteryCapacityWh, setCadBatteryCapacityWh] = useState(500),
    [cadMotorTimeConstantS, setCadMotorTimeConstantS] = useState(0.08),
    [cadMaxRotorThrustN, setCadMaxRotorThrustN] = useState(1250),
    [cadElectricalEfficiency, setCadElectricalEfficiency] = useState(0.82),
    [cadRotorDiskAreaM2, setCadRotorDiskAreaM2] = useState(0.05),
    [cadAvionicsPowerW, setCadAvionicsPowerW] = useState(12),
    [cadAutopilotEnabled, setCadAutopilotEnabled] = useState(false),
    [cadTargetAltitudeM, setCadTargetAltitudeM] = useState(3),
    [cadWaypointEnabled, setCadWaypointEnabled] = useState(false),
    [cadWaypointX, setCadWaypointX] = useState(0),
    [cadWaypointZ, setCadWaypointZ] = useState(0),
    [cadWaypointRoute, setCadWaypointRoute] = useState<Waypoint[]>([]),
    [cadWaypointLoop, setCadWaypointLoop] = useState(false),
    [cadObstacleAvoidanceEnabled, setCadObstacleAvoidanceEnabled] = useState(false),
    [cadRaycastAvoidanceEnabled, setCadRaycastAvoidanceEnabled] = useState(false),
    [cadDynamicReplanEnabled, setCadDynamicReplanEnabled] = useState(false),
    [cadNavigationPolicy, setCadNavigationPolicy] = useState<NavigationPolicy>(() => defaultNavigationPolicy()),
    [cadNavigationTraining, setCadNavigationTraining] = useState<NavigationTrainingResult | null>(null),
    [cadTransientEnabled, setCadTransientEnabled] = useState(false),
    [cadTransientMaterial, setCadTransientMaterial] = useState<ReducedMaterialId>("steel"),
    [cadFractureEnabled, setCadFractureEnabled] = useState(false),
    [cadFractureDamageThreshold, setCadFractureDamageThreshold] = useState(1),
    [cadLiftCoefficient, setCadLiftCoefficient] = useState(0.8),
    [cadDragCoefficient, setCadDragCoefficient] = useState(0.08),
    [cadReferenceAreaM2, setCadReferenceAreaM2] = useState(0.25),
    [running, setRunning] = useState(false),
    [reset, setReset] = useState(0);
  const [state, setState] = useState<BodyState>({
      p: [-1.1, 4.5, 0],
      r: [0, 0, 0, 1],
      v: [0, 0, 0],
    }),
    [cadState, setCadState] = useState<BodyState>({
      p: [1.1, 4.5, 0],
      r: [0, 0, 0, 1],
      v: [0, 0, 0],
    }),
    [componentStates, setComponentStates] = useState<ComponentState[]>([]),
    [jointActuators, setJointActuators] = useState<JointActuatorTelemetry[]>([]),
    [robotTerrain, setRobotTerrain] = useState<RobotTerrainTelemetry>({
      fallenDurationS: 0, maxTiltDeg: 0, fallCount: 0, wasFallen: false,
      uprightDot: 1, tiltDeg: 0, fallen: false, centerHeightM: 0,
      horizontalSpeedMps: 0, terrainEnabled: false, roughnessM: 0,
      distanceFromStartM: 0,
    }),
    [flight, setFlight] = useState<FlightTelemetry>({
      atS: 0,
      airspeedMps: 0,
      liftN: 0,
      dragN: 0,
      thrustN: 0,
      commandedThrustN: 0,
      altitudeHoldEnabled: false,
      altitudeErrorM: 0,
      waypointEnabled: false,
      waypointDistanceM: 0,
      waypointIndex: 0,
      waypointCount: 0,
      waypointCompleted: false,
      obstacleAvoidanceEnabled: false,
      nearestObstacleDistanceM: null,
      raycastAvoidanceEnabled: false,
      nearestColliderDistanceM: null,
      detourActive: false,
      replanCount: 0,
      plannedTarget: null,
      dynamicPressurePa: 0,
      forceWorldN: [0, 0, 0],
    }),
    [ground, setGround] = useState<GroundTelemetry>({
      atS: 0,
      forceWorldN: [0, 0, 0],
      torqueWorldNm: [0, 0, 0],
      forwardSpeedMps: 0,
      lateralSpeedMps: 0,
      speedErrorMps: 0,
      headingErrorDeg: 0,
      driveForceN: 0,
      lateralForceN: 0,
      steeringTorqueNm: 0,
      mechanicalPowerW: 0,
      grounded: false,
      targetSpeedMps: 4,
      waypointEnabled: false,
      waypointDistanceM: 0,
      waypointIndex: 0,
      waypointCount: 1,
      waypointCompleted: false,
      obstacleAvoidanceEnabled: false,
      raycastAvoidanceEnabled: false,
      nearestColliderDistanceM: null,
      detourActive: false,
      replanCount: 0,
      plannedTarget: null,
    }),
    [simTime, setSimTime] = useState(0);
  const [trace, setTrace] = useState<Vec3[]>([]);
  const [cadTrace, setCadTrace] = useState<Vec3[]>([]);
  const [cadTelemetryTrace, setCadTelemetryTrace] = useState<CadTelemetrySample[]>([]);
  const [replanDecisions, setReplanDecisions] = useState<ReplanDecision[]>([]);
  const [cadTransientState, setCadTransientState] = useState<TransientMaterialState>(() => initialTransientMaterialState());
  const [fractureEvents, setFractureEvents] = useState<FractureEvent[]>([]);
  const [collisions, setCollisions] = useState<CollisionEvent[]>([]);
  const [peakFlightLoad, setPeakFlightLoad] = useState<FlightTelemetry | null>(null);
  const [peakImpactLoad, setPeakImpactLoad] = useState<ImpactLoad | null>(null);
  const [feaTransferNote, setFeaTransferNote] = useState("");
  const [cadAeroCalibration, setCadAeroCalibration] = useState<{
    source: "webcad-lbm-wind-tunnel";
    cd: number;
    frontalAreaM2: number;
    densityKgM3: number;
    speedMps: number;
    reynolds: number;
    converged: boolean;
    resolution: number;
    warnings: string[];
  } | null>(null);
  const [readyWorldKey, setReadyWorldKey] = useState<string | null>(null);
  const [rosBridgeUrl, setRosBridgeUrl] = useState("ws://127.0.0.1:9090");
  const [rosStatus, setRosStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [rosLastCommand, setRosLastCommand] = useState<{ linearMps: number; angularRadS: number } | null>(null);
  const [rosPublishedCount, setRosPublishedCount] = useState(0);
  useEffect(() => {
    setRunning(false);
    setReset((value) => value + 1);
  }, [
    cadBatteryCapacityWh,
    cadMotorTimeConstantS,
    cadMaxRotorThrustN,
    cadElectricalEfficiency,
    cadRotorDiskAreaM2,
    cadAvionicsPowerW,
  ]);
  const rosSocketRef = useRef<WebSocket | null>(null);
  const rosLastPublishMs = useRef(0);
  const handleWorldReady = useCallback((ready: boolean, key: string) => {
    setReadyWorldKey((current) => ready ? key : current === key ? null : current);
    if (!ready) setRunning(false);
  }, []);
  const cadShape = useMemo<CadShape>(() => {
    const src = body?.vertices;
    if (!src?.length) {
      const p = new Float32Array([
        -0.55, -0.4, -0.7, 0.55, -0.4, -0.7, 0.55, 0.4, -0.7, -0.55, -0.4, -0.7,
        0.55, 0.4, -0.7, -0.55, 0.4, -0.7, -0.55, -0.4, 0.7, 0.55, 0.4, 0.7,
        0.55, -0.4, 0.7, -0.55, -0.4, 0.7, -0.55, 0.4, 0.7, 0.55, 0.4, 0.7,
      ]);
      return {
        positions: p,
        size: [1.1, 0.8, 1.4],
        source: "fallback",
        densityKgM3: bodyDensity * 1000,
        centerCad: [0, 0, 0],
        scale: 1,
      };
    }
    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity,
      maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;
    for (let i = 0; i + 2 < src.length; i += 3) {
      minX = Math.min(minX, src[i]);
      maxX = Math.max(maxX, src[i]);
      minY = Math.min(minY, src[i + 1]);
      maxY = Math.max(maxY, src[i + 1]);
      minZ = Math.min(minZ, src[i + 2]);
      maxZ = Math.max(maxZ, src[i + 2]);
    }
    const raw: Vec3 = [
      Math.max(0.12, (maxX - minX) / 1000),
      Math.max(0.12, (maxZ - minZ) / 1000),
      Math.max(0.12, (maxY - minY) / 1000),
    ];
    const scale = Math.min(3.2 / Math.max(...raw), 1),
      cx = (minX + maxX) / 2,
      cy = (minY + maxY) / 2,
      cz = (minZ + maxZ) / 2;
    const p = new Float32Array(src.length);
    for (let i = 0; i + 2 < src.length; i += 3) {
      p[i] = ((src[i] - cx) / 1000) * scale;
      p[i + 1] = ((src[i + 2] - cz) / 1000) * scale;
      p[i + 2] = (-(src[i + 1] - cy) / 1000) * scale;
    }
    return {
      positions: p,
      size: [raw[0] * scale, raw[1] * scale, raw[2] * scale],
      source: "cad",
      densityKgM3: bodyDensity * 1000,
      centerCad: [cx, cy, cz],
      scale,
    };
  }, [body, bodyDensity]);
  const parkedShapes = useMemo<ParkedShape[]>(() => {
    // New Body / Split Body keeps sibling solids in MeshData.parked.  Bring
    // them into the same lab coordinate frame as the active CAD solid so a
    // multi-body design remains a real collision scene instead of one body.
    if (!body?.parked?.length || cadShape.source !== "cad") return [];
    const [cx, cy, cz] = cadShape.centerCad;
    return body.parked.flatMap((parked, index) => {
      const src = parked.vertices;
      if (src.length < 12) return [];
      const positions = new Float32Array(src.length);
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;
      for (let i = 0; i + 2 < src.length; i += 3) {
        const x = ((src[i] - cx) / 1000) * cadShape.scale;
        const y = ((src[i + 2] - cz) / 1000) * cadShape.scale;
        const z = (-(src[i + 1] - cy) / 1000) * cadShape.scale;
        positions[i] = x;
        positions[i + 1] = y;
        positions[i + 2] = z;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        minZ = Math.min(minZ, z);
        maxZ = Math.max(maxZ, z);
      }
      return [{
        id: `parked-${index}`,
        name: parked.name || `其他 CAD 實體 ${index + 1}`,
        positions,
        size: [
          Math.max(0.04, maxX - minX),
          Math.max(0.04, maxY - minY),
          Math.max(0.04, maxZ - minZ),
        ],
      }];
    });
  }, [body, cadShape]);
  const componentShapes = useMemo<ComponentShape[]>(() => {
    // Every visible assembly occurrence must be eligible for the lab.  Silently
    // truncating to six made a valid CAD assembly look complete while leaving
    // later parts out of both the render and collision world.
    const visible = components.filter(
      (c) => !c.hidden && c.mesh?.vertices?.length,
    );
    if (!visible.length) return [];
    // Component positions are Three-world millimetres. Keep the whole assembly's
    // relative layout and only scale it down when it exceeds the bounded room.
    const origin: Vec3 = [
      visible.reduce((sum, c) => sum + c.pos[0], 0) / visible.length,
      visible.reduce((sum, c) => sum + c.pos[1], 0) / visible.length,
      visible.reduce((sum, c) => sum + c.pos[2], 0) / visible.length,
    ];
    const largestOffset = Math.max(
      0.001,
      ...visible.map(
        (c) =>
          Math.max(
            Math.abs(c.pos[0] - origin[0]),
            Math.abs(c.pos[1] - origin[1]),
            Math.abs(c.pos[2] - origin[2]),
          ) / 1000,
      ),
    );
    const layoutScale = Math.min(
      1,
      (Math.min(roomWidth, roomDepth) * 0.32) / largestOffset,
    );
    return visible.map((c, index) => {
      const src = c.mesh.vertices;
      let minX = Infinity,
        minY = Infinity,
        minZ = Infinity,
        maxX = -Infinity,
        maxY = -Infinity,
        maxZ = -Infinity;
      for (let i = 0; i + 2 < src.length; i += 3) {
        minX = Math.min(minX, src[i]);
        maxX = Math.max(maxX, src[i]);
        minY = Math.min(minY, src[i + 1]);
        maxY = Math.max(maxY, src[i + 1]);
        minZ = Math.min(minZ, src[i + 2]);
        maxZ = Math.max(maxZ, src[i + 2]);
      }
      const raw: Vec3 = [
        Math.max(0.12, (maxX - minX) / 1000),
        Math.max(0.12, (maxZ - minZ) / 1000),
        Math.max(0.12, (maxY - minY) / 1000),
      ];
      const scale = Math.min(2.4 / Math.max(...raw), 1),
        cx = (minX + maxX) / 2,
        cy = (minY + maxY) / 2,
        cz = (minZ + maxZ) / 2;
      // `layoutScale` is a room-wide scale, not merely a translation scale.
      // Apply it to each mesh/collider too, otherwise a large assembly has
      // compressed joint anchors but full-sized parts that no longer meet.
      const labScale = scale * layoutScale;
      const positions = new Float32Array(src.length);
      for (let i = 0; i + 2 < src.length; i += 3) {
        positions[i] = ((src[i] - cx) / 1000) * labScale;
        positions[i + 1] = ((src[i + 2] - cz) / 1000) * labScale;
        positions[i + 2] = (-(src[i + 1] - cy) / 1000) * labScale;
      }
      const [rx, ry, rz] = c.rot ?? [0, 0, 0];
      const ex = (rx * Math.PI) / 360,
        ey = (ry * Math.PI) / 360,
        ez = (rz * Math.PI) / 360;
      const sx = Math.sin(ex),
        cxq = Math.cos(ex),
        sy = Math.sin(ey),
        cyq = Math.cos(ey),
        sz = Math.sin(ez),
        czq = Math.cos(ez);
      const rotation: [number, number, number, number] = [
        sx * cyq * czq + cxq * sy * sz,
        cxq * sy * czq - sx * cyq * sz,
        cxq * cyq * sz + sx * sy * czq,
        cxq * cyq * czq - sx * sy * sz,
      ];
      const spawnOffset: Vec3 = [
        ((c.pos[0] - origin[0]) / 1000) * layoutScale,
        ((c.pos[1] - origin[1]) / 1000) * layoutScale,
        ((c.pos[2] - origin[2]) / 1000) * layoutScale,
      ];
      const materialName = c.material || "塑料",
        densityKgM3 = (MATERIALS[materialName]?.density ?? 1.2) * 1000;
      return {
        id: c.id,
        name: c.name || `元件 ${index + 1}`,
        positions,
        size: [raw[0] * labScale, raw[1] * labScale, raw[2] * labScale],
        color: c.color || "#18a6d5",
        material: materialName,
        densityKgM3,
        spawnOffset,
        spawnRotation: rotation,
        layoutOrigin: origin,
        layoutScale,
      };
    });
  }, [components, roomWidth, roomDepth]);
  const importedJointSummary = useMemo(() => {
    const ids = new Set(componentShapes.map((c) => c.id));
    const relevant = joints.filter(
      (j) => ids.has(j.child) && (j.parent === "GND" || ids.has(j.parent)),
    );
    const supported = relevant.filter(
      (j) =>
        j.type === "revolute" ||
        j.type === "slider" ||
        j.type === "ball" ||
        j.type === "rigid" ||
        j.type === "cylindrical" ||
        j.type === "planar" ||
        j.type === "screw" ||
        j.type === "pinslot",
    );
    return {
      supported,
      unsupported: relevant.filter(
        (j) =>
          j.type !== "revolute" &&
          j.type !== "slider" &&
          j.type !== "ball" &&
          j.type !== "rigid" &&
          j.type !== "cylindrical" &&
          j.type !== "planar" &&
          j.type !== "screw" &&
          j.type !== "pinslot",
      ),
    };
  }, [componentShapes, joints]);
  const settings: Settings = {
    gravity,
    environmentPreset,
    restitution,
    friction,
    airDensity,
    wind,
    windDirection,
    ballMaterial,
    running,
    reset,
    startX,
    startHeight,
    startZ,
    startVx,
    startVz,
    cadStartX,
    cadStartHeight,
    cadStartZ,
    cadStartVx,
    cadStartVz,
    cadBodyMode,
    extraBalls,
    cadHinge,
    motorRpm,
    cadSlider,
    sliderSpeed,
    rampEnabled,
    rampAngle,
    obstacleCount,
    unevenTerrainEnabled,
    terrainRoughnessM,
    robotFallTiltDeg,
    timeScale,
    fastForwardEnabled,
    fastForwardStepsPerFrame,
    stopAtSimulationS,
    demoArm,
    armRpm,
    componentBodies: componentBodiesEnabled,
    componentJointRpm,
    componentJointMaxTorqueNm,
    componentJointMaxForceN,
    componentJointEfficiency,
    cadFlightEnabled,
    cadGroundVehicleEnabled,
    cadGroundTargetSpeedMps,
    cadGroundMaxDriveForceN,
    cadGroundMaxBrakeForceN,
    cadGroundSteeringDeg,
    cadGroundMaxSteeringTorqueNm,
    cadRlNavigationEnabled,
    cadRlNavigationPolicy,
    cadThrustN,
    cadBatteryCapacityWh,
    cadMotorTimeConstantS,
    cadMaxRotorThrustN,
    cadElectricalEfficiency,
    cadRotorDiskAreaM2,
    cadAvionicsPowerW,
    cadAutopilotEnabled,
    cadTargetAltitudeM,
    cadWaypointEnabled,
    cadWaypointX,
    cadWaypointZ,
    cadWaypointRoute,
    cadWaypointLoop,
    cadObstacleAvoidanceEnabled,
    cadRaycastAvoidanceEnabled,
    cadDynamicReplanEnabled,
    cadNavigationPolicy,
    cadTransientEnabled,
    cadTransientMaterial,
    cadFractureEnabled,
    cadFractureDamageThreshold,
    cadLiftCoefficient,
    cadDragCoefficient,
    cadReferenceAreaM2,
    roomWidth,
    roomDepth,
    roomHeight,
  };
  const worldKey = JSON.stringify({
    gravity,
    restitution,
    friction,
    ballMaterial,
    reset,
    start: [startX, startHeight, startZ, startVx, startVz],
    cadStart: [cadStartX, cadStartHeight, cadStartZ, cadStartVx, cadStartVz],
    cad: [cadBodyMode, cadHinge, cadSlider, cadGroundVehicleEnabled, bodyDensity, ...cadShape.size],
    room: [roomWidth, roomDepth, roomHeight],
    scene: [extraBalls, rampEnabled, rampAngle, obstacleCount, demoArm, componentBodiesEnabled],
    assembly: [componentShapes.length, joints.length],
  });
  const worldReady = readyWorldKey === worldKey;
  const resetLab = () => {
    setRunning(false);
    setTrace([]);
    setCadTrace([]);
    setCadTelemetryTrace([]);
    setReplanDecisions([]);
    setCadTransientState(initialTransientMaterialState());
    setFractureEvents([]);
    setCollisions([]);
    setComponentStates([]);
    setPeakFlightLoad(null);
    setGround((current) => ({
      ...current,
      atS: 0,
      forceWorldN: [0, 0, 0],
      torqueWorldNm: [0, 0, 0],
      forwardSpeedMps: 0,
      lateralSpeedMps: 0,
      speedErrorMps: cadGroundTargetSpeedMps,
      headingErrorDeg: 0,
      driveForceN: 0,
      lateralForceN: 0,
      steeringTorqueNm: 0,
      mechanicalPowerW: 0,
      grounded: false,
      targetSpeedMps: cadGroundTargetSpeedMps,
      waypointEnabled: cadWaypointEnabled,
      waypointDistanceM: 0,
      waypointIndex: 0,
      waypointCount: cadWaypointRoute.length || 1,
      waypointCompleted: false,
    }));
    setPeakImpactLoad(null);
    setFeaTransferNote("");
    setSimTime(0);
    setState({
      p: [startX, startHeight, startZ],
      r: [0, 0, 0, 1],
      v: [startVx, 0, startVz],
    });
    setCadState({
      p: [cadStartX, cadStartHeight, cadStartZ],
      r: [0, 0, 0, 1],
      v: [cadStartVx, 0, cadStartVz],
    });
    setReset((v) => v + 1);
  };
  const loadScenario = (scenario: Scenario) => {
    setGravity(scenario.gravity);
    setEnvironmentPreset(
      scenario.environmentPreset === "earth" ||
        scenario.environmentPreset === "moon" ||
        scenario.environmentPreset === "mars" ||
        scenario.environmentPreset === "zero-g"
        ? scenario.environmentPreset
        : "custom",
    );
    setRestitution(scenario.restitution);
    setFriction(scenario.friction);
    setAirDensity(Math.max(0, Math.min(2.5, scenario.airDensity ?? 1.225)));
    setWind(Math.abs(scenario.wind));
    setWindDirection(
      scenario.windDirection ?? (scenario.wind < 0 ? "x-" : "x+"),
    );
    setBallMaterial(
      scenario.ballMaterial === "aluminum" || scenario.ballMaterial === "rubber"
        ? scenario.ballMaterial
        : "steel",
    );
    const x = scenario.startX ?? -1.1,
      z = scenario.startZ ?? 0,
      vz = scenario.startVz ?? 0;
    const cadX = scenario.cadStartX ?? 1.2,
      cadZ = scenario.cadStartZ ?? 0,
      cadVx = scenario.cadStartVx ?? 0,
      cadVz = scenario.cadStartVz ?? 0,
      cadMode: CadBodyMode = scenario.cadBodyMode === "fixed" ? "fixed" : "dynamic";
    // A saved preset can use a shorter room than the default.  Keep every
    // spawned body below its ceiling instead of restoring an impossible state.
    const nextRoomWidth = scenario.roomWidth ?? 14;
    const nextRoomDepth = scenario.roomDepth ?? 14;
    const nextRoomHeight = scenario.roomHeight ?? 6;
    const height = Math.min(scenario.startHeight, nextRoomHeight - 0.2),
      cadHeight = Math.min(
        scenario.cadStartHeight ?? 5.3,
        nextRoomHeight - 0.2,
      );
    setStartX(x);
    setStartHeight(height);
    setStartZ(z);
    setStartVx(scenario.startVx);
    setStartVz(vz);
    setCadStartX(cadX);
    setCadStartHeight(cadHeight);
    setCadStartZ(cadZ);
    setCadStartVx(cadVx);
    setCadStartVz(cadVz);
    setCadBodyMode(cadMode);
    setExtraBalls(scenario.extraBalls ?? 0);
    setCadHinge(cadMode === "dynamic" && (scenario.cadHinge ?? false));
    setMotorRpm(scenario.motorRpm ?? 0);
    setCadSlider(cadMode === "dynamic" && (scenario.cadSlider ?? false));
    setSliderSpeed(scenario.sliderSpeed ?? 0);
    setRampEnabled(scenario.rampEnabled ?? false);
    setRampAngle(scenario.rampAngle ?? 12);
    setObstacleCount(scenario.obstacleCount ?? 0);
    setUnevenTerrainEnabled(scenario.unevenTerrainEnabled === true);
    setTerrainRoughnessM(Math.max(0.01, Math.min(1.5, scenario.terrainRoughnessM ?? 0.18)));
    setRobotFallTiltDeg(Math.max(20, Math.min(89, scenario.robotFallTiltDeg ?? 60)));
    setTimeScale(scenario.timeScale ?? 1);
    setFastForwardEnabled(scenario.fastForwardEnabled === true);
    setFastForwardStepsPerFrame(Math.max(30, Math.min(1200, Math.round(scenario.fastForwardStepsPerFrame ?? 240))));
    setStopAtSimulationS(Math.max(1, Math.min(86400, scenario.stopAtSimulationS ?? 60)));
    setDemoArm(scenario.demoArm ?? false);
    setArmRpm(scenario.armRpm ?? 0);
    setComponentBodiesEnabled(scenario.componentBodies ?? false);
    setComponentJointRpm(scenario.componentJointRpm ?? 0);
    setComponentJointMaxTorqueNm(Math.max(0, Math.min(100000, scenario.componentJointMaxTorqueNm ?? 120)));
    setComponentJointMaxForceN(Math.max(0, Math.min(1000000, scenario.componentJointMaxForceN ?? 1500)));
    setComponentJointEfficiency(Math.max(0.05, Math.min(1, scenario.componentJointEfficiency ?? 0.8)));
    const nextFlightEnabled = cadMode === "dynamic" && (scenario.cadFlightEnabled ?? false);
    setCadFlightEnabled(nextFlightEnabled);
    setCadGroundVehicleEnabled(
      cadMode === "dynamic" && !nextFlightEnabled && (scenario.cadGroundVehicleEnabled ?? false),
    );
    setCadGroundTargetSpeedMps(Math.max(-30, Math.min(60, scenario.cadGroundTargetSpeedMps ?? 4)));
    setCadGroundMaxDriveForceN(Math.max(0, Math.min(20000, scenario.cadGroundMaxDriveForceN ?? 500)));
    setCadGroundMaxBrakeForceN(Math.max(0, Math.min(30000, scenario.cadGroundMaxBrakeForceN ?? 800)));
    setCadGroundSteeringDeg(Math.max(-60, Math.min(60, scenario.cadGroundSteeringDeg ?? 0)));
    setCadGroundMaxSteeringTorqueNm(Math.max(0, Math.min(10000, scenario.cadGroundMaxSteeringTorqueNm ?? 250)));
    const nextRlPolicy = scenario.cadRlNavigationPolicy;
    const validRlPolicy = nextRlPolicy?.algorithm === "tabular-q-learning"
      && Array.isArray(nextRlPolicy.q) && nextRlPolicy.q.length === 96
      && nextRlPolicy.q.every(Number.isFinite);
    setCadRlNavigationPolicy(validRlPolicy ? nextRlPolicy : null);
    setCadRlNavigationEnabled(cadMode === "dynamic" && !nextFlightEnabled && validRlPolicy && scenario.cadRlNavigationEnabled === true);
    setCadThrustN(Math.max(0, Math.min(5000, scenario.cadThrustN ?? 0)));
    setCadBatteryCapacityWh(Math.max(1, Math.min(100000, scenario.cadBatteryCapacityWh ?? 500)));
    setCadMotorTimeConstantS(Math.max(0.005, Math.min(5, scenario.cadMotorTimeConstantS ?? 0.08)));
    setCadMaxRotorThrustN(Math.max(1, Math.min(25000, scenario.cadMaxRotorThrustN ?? 1250)));
    setCadElectricalEfficiency(Math.max(0.05, Math.min(1, scenario.cadElectricalEfficiency ?? 0.82)));
    setCadRotorDiskAreaM2(Math.max(0.001, Math.min(20, scenario.cadRotorDiskAreaM2 ?? 0.05)));
    setCadAvionicsPowerW(Math.max(0, Math.min(10000, scenario.cadAvionicsPowerW ?? 12)));
    setCadAutopilotEnabled(cadMode === "dynamic" && (scenario.cadAutopilotEnabled ?? false));
    setCadTargetAltitudeM(Math.max(0.3, Math.min(nextRoomHeight - 0.2, scenario.cadTargetAltitudeM ?? 3)));
    setCadWaypointEnabled(cadMode === "dynamic" && (scenario.cadWaypointEnabled ?? false));
    setCadWaypointX(Math.max(-nextRoomWidth / 2 + 0.3, Math.min(nextRoomWidth / 2 - 0.3, scenario.cadWaypointX ?? 0)));
    setCadWaypointZ(Math.max(-nextRoomDepth / 2 + 0.3, Math.min(nextRoomDepth / 2 - 0.3, scenario.cadWaypointZ ?? 0)));
    setCadWaypointRoute(
      (Array.isArray(scenario.cadWaypointRoute) ? scenario.cadWaypointRoute : [])
        .filter((point) => Number.isFinite(point?.x) && Number.isFinite(point?.z))
        .slice(0, 64)
        .map((point) => ({
          x: Math.max(-nextRoomWidth / 2 + 0.3, Math.min(nextRoomWidth / 2 - 0.3, point.x)),
          z: Math.max(-nextRoomDepth / 2 + 0.3, Math.min(nextRoomDepth / 2 - 0.3, point.z)),
        })),
    );
    setCadWaypointLoop(scenario.cadWaypointLoop === true);
    setCadObstacleAvoidanceEnabled(cadMode === "dynamic" && (scenario.cadObstacleAvoidanceEnabled ?? false));
    setCadRaycastAvoidanceEnabled(cadMode === "dynamic" && (scenario.cadRaycastAvoidanceEnabled ?? false));
    setCadDynamicReplanEnabled(cadMode === "dynamic" && (scenario.cadDynamicReplanEnabled ?? false));
    const nextPolicy = scenario.cadNavigationPolicy;
    setCadNavigationPolicy(
      nextPolicy && Number.isFinite(nextPolicy.navigationGain) && Number.isFinite(nextPolicy.avoidanceGain) && Number.isFinite(nextPolicy.dampingGain)
        ? {
            navigationGain: Math.max(0.03, Math.min(0.7, nextPolicy.navigationGain)),
            avoidanceGain: Math.max(0.15, Math.min(5, nextPolicy.avoidanceGain)),
            dampingGain: Math.max(0.08, Math.min(2, nextPolicy.dampingGain)),
          }
        : defaultNavigationPolicy(),
    );
    setCadNavigationTraining(null);
    setCadTransientEnabled(cadMode === "dynamic" && (scenario.cadTransientEnabled ?? false));
    setCadTransientMaterial(
      scenario.cadTransientMaterial === "aluminum" || scenario.cadTransientMaterial === "abs"
        ? scenario.cadTransientMaterial
        : "steel",
    );
    setCadFractureEnabled(cadMode === "dynamic" && (scenario.cadFractureEnabled ?? false));
    setCadFractureDamageThreshold(Math.max(0, Math.min(1, scenario.cadFractureDamageThreshold ?? 1)));
    setCadLiftCoefficient(Math.max(-2, Math.min(4, scenario.cadLiftCoefficient ?? 0.8)));
    setCadDragCoefficient(Math.max(0, Math.min(3, scenario.cadDragCoefficient ?? 0.08)));
    setCadReferenceAreaM2(Math.max(0.01, Math.min(20, scenario.cadReferenceAreaM2 ?? 0.25)));
    setRoomWidth(scenario.roomWidth ?? 14);
    setRoomDepth(scenario.roomDepth ?? 14);
    setRoomHeight(nextRoomHeight);
    setRunning(false);
    setTrace([]);
    setCadTrace([]);
    setCadTelemetryTrace([]);
    setReplanDecisions([]);
    setCadTransientState(initialTransientMaterialState());
    setFractureEvents([]);
    setCollisions([]);
    setPeakFlightLoad(null);
    setPeakImpactLoad(null);
    setFeaTransferNote("");
    setSimTime(0);
    setState({
      p: [x, height, z],
      r: [0, 0, 0, 1],
      v: [scenario.startVx, 0, vz],
    });
    setCadState({
      p: [cadX, cadHeight, cadZ],
      r: [0, 0, 0, 1],
      v: [cadVx, 0, cadVz],
    });
    setReset((v) => v + 1);
  };
  const currentScenario = (): Scenario => ({
    gravity,
    environmentPreset,
    restitution,
    friction,
    airDensity,
    wind,
    windDirection,
    ballMaterial,
    startX,
    startHeight,
    startZ,
    startVx,
    startVz,
    cadStartX,
    cadStartHeight,
    cadStartZ,
    cadStartVx,
    cadStartVz,
    cadBodyMode,
    extraBalls,
    cadHinge,
    motorRpm,
    cadSlider,
    sliderSpeed,
    rampEnabled,
    rampAngle,
    obstacleCount,
    unevenTerrainEnabled,
    terrainRoughnessM,
    robotFallTiltDeg,
    timeScale,
    fastForwardEnabled,
    fastForwardStepsPerFrame,
    stopAtSimulationS,
    demoArm,
    armRpm,
    componentBodies: componentBodiesEnabled,
    componentJointRpm,
    componentJointMaxTorqueNm,
    componentJointMaxForceN,
    componentJointEfficiency,
    cadFlightEnabled,
    cadGroundVehicleEnabled,
    cadGroundTargetSpeedMps,
    cadGroundMaxDriveForceN,
    cadGroundMaxBrakeForceN,
    cadGroundSteeringDeg,
    cadGroundMaxSteeringTorqueNm,
    cadRlNavigationEnabled,
    cadRlNavigationPolicy,
    cadThrustN,
    cadBatteryCapacityWh,
    cadMotorTimeConstantS,
    cadMaxRotorThrustN,
    cadElectricalEfficiency,
    cadRotorDiskAreaM2,
    cadAvionicsPowerW,
    cadAutopilotEnabled,
    cadTargetAltitudeM,
    cadWaypointEnabled,
    cadWaypointX,
    cadWaypointZ,
    cadWaypointRoute,
    cadWaypointLoop,
    cadObstacleAvoidanceEnabled,
    cadRaycastAvoidanceEnabled,
    cadDynamicReplanEnabled,
    cadNavigationPolicy,
    cadTransientEnabled,
    cadTransientMaterial,
    cadFractureEnabled,
    cadFractureDamageThreshold,
    cadLiftCoefficient,
    cadDragCoefficient,
    cadReferenceAreaM2,
    roomWidth,
    roomDepth,
    roomHeight,
  });
  const saveScenario = () =>
    localStorage.setItem(
      "webcad.physics-lab.scenario/v1",
      JSON.stringify(currentScenario()),
    );
  const restoreScenario = () => {
    try {
      const value = JSON.parse(
        localStorage.getItem("webcad.physics-lab.scenario/v1") ?? "null",
      );
      if (
        !value ||
        ![
          "gravity",
          "restitution",
          "friction",
          "wind",
          "startHeight",
          "startVx",
        ].every((key) => Number.isFinite(value[key]))
      )
        return;
      loadScenario({
        gravity: Math.max(0, Math.min(25, value.gravity)),
        environmentPreset:
          value.environmentPreset === "earth" ||
          value.environmentPreset === "moon" ||
          value.environmentPreset === "mars" ||
          value.environmentPreset === "zero-g"
            ? value.environmentPreset
            : "custom",
        restitution: Math.max(0, Math.min(1, value.restitution)),
        friction: Math.max(0, Math.min(1.5, value.friction)),
        airDensity: Math.max(
          0,
          Math.min(
            2.5,
            Number.isFinite(value.airDensity) ? value.airDensity : 1.225,
          ),
        ),
        wind: Math.abs(Math.max(-30, Math.min(30, value.wind))),
        windDirection:
          value.windDirection === "x-" ||
          value.windDirection === "z+" ||
          value.windDirection === "z-"
            ? value.windDirection
            : value.wind < 0
              ? "x-"
              : "x+",
        ballMaterial:
          value.ballMaterial === "aluminum" || value.ballMaterial === "rubber"
            ? value.ballMaterial
            : "steel",
        startX: Math.max(
          -6,
          Math.min(6, Number.isFinite(value.startX) ? value.startX : -1.1),
        ),
        startHeight: Math.max(0.5, Math.min(5.8, value.startHeight)),
        startZ: Math.max(
          -6,
          Math.min(6, Number.isFinite(value.startZ) ? value.startZ : 0),
        ),
        startVx: Math.max(-12, Math.min(12, value.startVx)),
        startVz: Math.max(
          -12,
          Math.min(12, Number.isFinite(value.startVz) ? value.startVz : 0),
        ),
        cadStartX: Math.max(
          -6,
          Math.min(6, Number.isFinite(value.cadStartX) ? value.cadStartX : 1.2),
        ),
        cadStartHeight: Math.max(
          0.3,
          Math.min(
            15.8,
            Number.isFinite(value.cadStartHeight) ? value.cadStartHeight : 5.3,
          ),
        ),
        cadStartZ: Math.max(
          -6,
          Math.min(6, Number.isFinite(value.cadStartZ) ? value.cadStartZ : 0),
        ),
        cadStartVx: Math.max(
          -12,
          Math.min(
            12,
            Number.isFinite(value.cadStartVx) ? value.cadStartVx : 0,
          ),
        ),
        cadStartVz: Math.max(
          -12,
          Math.min(
            12,
            Number.isFinite(value.cadStartVz) ? value.cadStartVz : 0,
          ),
        ),
        cadBodyMode: value.cadBodyMode === "fixed" ? "fixed" : "dynamic",
        extraBalls: Math.max(
          0,
          Math.min(8, Math.round(Number(value.extraBalls) || 0)),
        ),
        cadHinge: value.cadHinge === true,
        motorRpm: Math.max(-120, Math.min(120, Number(value.motorRpm) || 0)),
        cadSlider: value.cadSlider === true,
        sliderSpeed: Math.max(-3, Math.min(3, Number(value.sliderSpeed) || 0)),
        rampEnabled: value.rampEnabled === true,
        rampAngle: Math.max(-25, Math.min(25, Number(value.rampAngle) || 12)),
        obstacleCount: Math.max(
          0,
          Math.min(10, Math.round(Number(value.obstacleCount) || 0)),
        ),
        unevenTerrainEnabled: value.unevenTerrainEnabled === true,
        terrainRoughnessM: Math.max(0.01, Math.min(1.5, Number(value.terrainRoughnessM) || 0.18)),
        robotFallTiltDeg: Math.max(20, Math.min(89, Number(value.robotFallTiltDeg) || 60)),
        timeScale: Math.max(0.25, Math.min(4, Number(value.timeScale) || 1)),
        fastForwardEnabled: value.fastForwardEnabled === true,
        fastForwardStepsPerFrame: Math.max(30, Math.min(1200, Math.round(Number(value.fastForwardStepsPerFrame) || 240))),
        stopAtSimulationS: Math.max(1, Math.min(86400, Number(value.stopAtSimulationS) || 60)),
        demoArm: value.demoArm === true,
        armRpm: Math.max(-90, Math.min(90, Number(value.armRpm) || 0)),
        componentBodies: value.componentBodies === true,
        componentJointRpm: Math.max(
          -120,
          Math.min(120, Number(value.componentJointRpm) || 0),
        ),
        componentJointMaxTorqueNm: Math.max(0, Math.min(100000, Number(value.componentJointMaxTorqueNm) || 120)),
        componentJointMaxForceN: Math.max(0, Math.min(1000000, Number(value.componentJointMaxForceN) || 1500)),
        componentJointEfficiency: Math.max(0.05, Math.min(1, Number(value.componentJointEfficiency) || 0.8)),
        cadFlightEnabled: value.cadFlightEnabled === true,
        cadGroundVehicleEnabled: value.cadGroundVehicleEnabled === true,
        cadGroundTargetSpeedMps: Math.max(-30, Math.min(60, Number(value.cadGroundTargetSpeedMps) || 0)),
        cadGroundMaxDriveForceN: Math.max(0, Math.min(20000, Number(value.cadGroundMaxDriveForceN) || 500)),
        cadGroundMaxBrakeForceN: Math.max(0, Math.min(30000, Number(value.cadGroundMaxBrakeForceN) || 800)),
        cadGroundSteeringDeg: Math.max(-60, Math.min(60, Number(value.cadGroundSteeringDeg) || 0)),
        cadGroundMaxSteeringTorqueNm: Math.max(0, Math.min(10000, Number(value.cadGroundMaxSteeringTorqueNm) || 250)),
        cadRlNavigationEnabled: value.cadRlNavigationEnabled === true,
        cadRlNavigationPolicy: value.cadRlNavigationPolicy,
        cadThrustN: Math.max(0, Math.min(5000, Number(value.cadThrustN) || 0)),
        cadBatteryCapacityWh: Math.max(1, Math.min(100000, Number(value.cadBatteryCapacityWh) || 500)),
        cadMotorTimeConstantS: Math.max(0.005, Math.min(5, Number(value.cadMotorTimeConstantS) || 0.08)),
        cadMaxRotorThrustN: Math.max(1, Math.min(25000, Number(value.cadMaxRotorThrustN) || 1250)),
        cadElectricalEfficiency: Math.max(0.05, Math.min(1, Number(value.cadElectricalEfficiency) || 0.82)),
        cadRotorDiskAreaM2: Math.max(0.001, Math.min(20, Number(value.cadRotorDiskAreaM2) || 0.05)),
        cadAvionicsPowerW: Math.max(0, Math.min(10000, Number.isFinite(value.cadAvionicsPowerW) ? value.cadAvionicsPowerW : 12)),
        cadAutopilotEnabled: value.cadAutopilotEnabled === true,
        cadTargetAltitudeM: Math.max(0.3, Math.min(15.8, Number(value.cadTargetAltitudeM) || 3)),
        cadWaypointEnabled: value.cadWaypointEnabled === true,
        cadWaypointX: Math.max(-14.7, Math.min(14.7, Number(value.cadWaypointX) || 0)),
        cadWaypointZ: Math.max(-14.7, Math.min(14.7, Number(value.cadWaypointZ) || 0)),
        cadWaypointRoute: Array.isArray(value.cadWaypointRoute) ? value.cadWaypointRoute : [],
        cadWaypointLoop: value.cadWaypointLoop === true,
        cadObstacleAvoidanceEnabled: value.cadObstacleAvoidanceEnabled === true,
        cadRaycastAvoidanceEnabled: value.cadRaycastAvoidanceEnabled === true,
        cadDynamicReplanEnabled: value.cadDynamicReplanEnabled === true,
        cadNavigationPolicy: value.cadNavigationPolicy,
        cadTransientEnabled: value.cadTransientEnabled === true,
        cadTransientMaterial:
          value.cadTransientMaterial === "aluminum" || value.cadTransientMaterial === "abs"
            ? value.cadTransientMaterial
            : "steel",
        cadFractureEnabled: value.cadFractureEnabled === true,
        cadFractureDamageThreshold: Math.max(0, Math.min(1, Number.isFinite(value.cadFractureDamageThreshold) ? value.cadFractureDamageThreshold : 1)),
        cadLiftCoefficient: Math.max(
          -2,
          Math.min(4, Number.isFinite(value.cadLiftCoefficient) ? value.cadLiftCoefficient : 0.8),
        ),
        cadDragCoefficient: Math.max(
          0,
          Math.min(3, Number.isFinite(value.cadDragCoefficient) ? value.cadDragCoefficient : 0.08),
        ),
        cadReferenceAreaM2: Math.max(
          0.01,
          Math.min(20, Number.isFinite(value.cadReferenceAreaM2) ? value.cadReferenceAreaM2 : 0.25),
        ),
        roomWidth: Math.max(8, Math.min(30, Number(value.roomWidth) || 14)),
        roomDepth: Math.max(8, Math.min(30, Number(value.roomDepth) || 14)),
        roomHeight: Math.max(4, Math.min(16, Number(value.roomHeight) || 6)),
      });
    } catch {
      /* invalid local scenario is ignored rather than changing the live simulation */
    }
  };
  // The FEA engine is a static, linear-elastic solve.  A sampled collision or
  // flight peak is deliberately treated as an equivalent static load, never as
  // a claim that this browser preview predicts transient damage or fracture.
  const linkedPeakLoadFea = feaResult
    ? (() => {
        const safetyFactor = feaResult.vmMax > 1e-9 ? feaResult.sy / feaResult.vmMax : null;
        const verdict = safetyFactor == null
          ? "No measurable stress"
          : safetyFactor >= 2
            ? "Elastic / safety factor at least 2"
            : safetyFactor >= 1
              ? "Near yield / safety factor between 1 and 2"
              : "Yield risk / safety factor below 1";
        return {
          analysis: "static-equivalent-peak-load-linear-elastic-fea",
          material: feaResult.matName,
          maxVonMisesMPa: feaResult.vmMax,
          yieldStrengthMPa: feaResult.sy,
          safetyFactor,
          maxDisplacementMm: feaResult.dispMax,
          converged: feaResult.converged,
          residual: feaResult.residual,
          warnings: feaResult.warnings,
          verdict,
        };
      })()
    : null;
  const disconnectRosBridge = useCallback(() => {
    const socket = rosSocketRef.current;
    rosSocketRef.current = null;
    if (socket && socket.readyState < 2) socket.close(1000, "WebCAD user disconnect");
    setRosStatus("disconnected");
  }, []);

  const connectRosBridge = useCallback(() => {
    disconnectRosBridge();
    let parsed: URL;
    try { parsed = new URL(rosBridgeUrl); } catch {
      setRosStatus("error");
      return;
    }
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      setRosStatus("error");
      return;
    }
    setRosStatus("connecting");
    try {
      const socket = new WebSocket(parsed.toString());
      rosSocketRef.current = socket;
      socket.addEventListener("open", () => {
        if (rosSocketRef.current !== socket) return;
        socket.send(JSON.stringify(rosSubscribe()));
        socket.send(JSON.stringify(rosAdvertise()));
        setRosStatus("connected");
      });
      socket.addEventListener("message", (event) => {
        const command = parseRosTwist(event.data);
        if (!command) return;
        setRosLastCommand(command);
        setCadGroundTargetSpeedMps(command.linearMps);
        // Kinematic-bicycle conversion: cmd_vel yaw rate -> equivalent steer.
        const wheelbaseM = Math.max(0.1, cadShape.size[0]);
        const steerRad = Math.atan2(wheelbaseM * command.angularRadS, Math.max(0.1, Math.abs(command.linearMps)));
        setCadGroundSteeringDeg(Math.max(-60, Math.min(60, steerRad * 180 / Math.PI)));
      });
      socket.addEventListener("error", () => {
        if (rosSocketRef.current === socket) setRosStatus("error");
      });
      socket.addEventListener("close", () => {
        if (rosSocketRef.current === socket) {
          rosSocketRef.current = null;
          setRosStatus("disconnected");
        }
      });
    } catch {
      setRosStatus("error");
    }
  }, [cadShape.size, disconnectRosBridge, rosBridgeUrl]);

  useEffect(() => disconnectRosBridge, [disconnectRosBridge]);

  useEffect(() => {
    const socket = rosSocketRef.current;
    if (!socket || socket.readyState !== 1 || rosStatus !== "connected") return;
    const now = performance.now();
    if (now - rosLastPublishMs.current < 100) return;
    rosLastPublishMs.current = now;
    const message = rosPublishSimulationState({
      simulationTimeS: simTime,
      positionM: cadState.p,
      velocityMps: cadState.v,
      targetSpeedMps: cadGroundTargetSpeedMps,
      forwardSpeedMps: ground.forwardSpeedMps,
      steeringDeg: cadGroundSteeringDeg,
      grounded: ground.grounded,
    });
    try {
      socket.send(JSON.stringify(message));
      setRosPublishedCount((count) => count + 1);
    } catch {
      setRosStatus("error");
    }
  }, [cadGroundSteeringDeg, cadGroundTargetSpeedMps, cadState, ground, rosStatus, simTime]);

  const runPeakLoadFea = () => {
    if (!feaFixed || !feaLoad) {
      setFeaTransferNote("請先選擇 FEA 固定面與受力面，或者先按「自動懸臂支撐後載入」建立可檢查的假設。");
      return;
    }
    void runFeaSolve();
  };
  const exportReport = () => {
    const report = {
      schema: "webcad.physics-lab-report/v1",
      generatedAt: new Date().toISOString(),
      limits:
        "互動級剛體模擬；不適用於安全、飛行或工程認證。CAD 凹形體目前使用保守凸包碰撞。",
      settings: {
        gravity,
        environmentPreset,
        restitution,
        friction,
        roomM: { width: roomWidth, depth: roomDepth, height: roomHeight },
        airDensityKgM3: airDensity,
        windSpeedMps: wind,
        windDirection,
        testBall: {
          material: BALL_MATERIALS[ballMaterial].label,
          densityKgM3: BALL_MATERIALS[ballMaterial].densityKgM3,
          radiusM: ballRadiusM,
          volumeM3: ballVolumeM3,
          massKg: ballMassKg,
        },
        startPositionM: [startX, startHeight, startZ],
        startVelocityMps: [startVx, 0, startVz],
        activeCadStartPositionM: [cadStartX, cadStartHeight, cadStartZ],
        activeCadStartVelocityMps: [cadStartVx, 0, cadStartVz],
        activeCadBodyMode: cadBodyMode,
        activeCadGroundVehicle: {
          enabled: cadGroundVehicleEnabled,
          model: "bounded-longitudinal-traction-lateral-slip-yaw-reduced-order",
          targetSpeedMps: cadGroundTargetSpeedMps,
          maxDriveForceN: cadGroundMaxDriveForceN,
          maxBrakeForceN: cadGroundMaxBrakeForceN,
          steeringDeg: cadGroundSteeringDeg,
          maxSteeringTorqueNm: cadGroundMaxSteeringTorqueNm,
          bodyForwardAxis: "+X",
          tyreForceRequiresGroundContact: true,
          rosBridge: {
            protocol: "rosbridge-v2-json",
            connectedAtExport: rosStatus === "connected",
            commandTopic: "/webcad/cmd_vel",
            commandType: "geometry_msgs/msg/Twist",
            telemetryTopic: "/webcad/simulation_state",
            telemetryType: "std_msgs/msg/String",
            lastCommand: rosLastCommand,
            publishedMessages: rosPublishedCount,
          },
          reinforcementLearning: cadRlNavigationPolicy ? {
            enabled: cadRlNavigationEnabled,
            appliedTo: "rapier-ground-vehicle-runtime-steering-and-speed",
            policy: cadRlNavigationPolicy,
          } : null,
          terrainTest: {
            enabled: unevenTerrainEnabled,
            deterministicTiles: unevenTerrainEnabled ? 81 : 0,
            roughnessM: terrainRoughnessM,
            fallTiltDeg: robotFallTiltDeg,
            model: "deterministic-height-tile-collision-terrain-with-rigid-body-stability-monitor",
          },
        },
        activeCadFlight: {
          enabled: cadFlightEnabled,
          propulsionModel: "four-rotor-bounded-wrench-allocation-body-plus-y-thrust",
          rotorOrder: ["front-right", "front-left", "rear-left", "rear-right"],
          maxRotorThrustN: cadMaxRotorThrustN,
          motorTimeConstantS: cadMotorTimeConstantS,
          batteryCapacityWh: cadBatteryCapacityWh,
          electricalEfficiency: cadElectricalEfficiency,
          rotorDiskAreaM2: cadRotorDiskAreaM2,
          avionicsPowerW: cadAvionicsPowerW,
          energyModel: "first-order-motor-plus-momentum-theory-induced-power",
          thrustN: cadThrustN,
          altitudeHold: { enabled: cadAutopilotEnabled, targetAltitudeM: cadTargetAltitudeM },
          waypoint: {
            enabled: cadWaypointEnabled,
            targetX: cadWaypointX,
            targetZ: cadWaypointZ,
            route: cadWaypointRoute,
            loop: cadWaypointLoop,
            activeIndex: cadGroundVehicleEnabled ? ground.waypointIndex : flight.waypointIndex,
            completed: cadGroundVehicleEnabled ? ground.waypointCompleted : flight.waypointCompleted,
          },
          obstacleAvoidance: { enabled: cadObstacleAvoidanceEnabled, scope: "procedural-fixed-cubes-only" },
          raycastAvoidance: { enabled: cadRaycastAvoidanceEnabled, scope: "all-collision-enabled-bodies-except-active-and-room" },
          dynamicReplanning: {
            enabled: cadDynamicReplanEnabled,
            strategy: "three-ray-clearer-side-temporary-detour",
            triggerDistanceM: 1.8,
            cooldownS: 0.75,
          },
          learnedNavigationPolicy: {
            policy: cadNavigationPolicy,
            training: cadNavigationTraining,
            method: "deterministic-evolutionary-search-on-2d-surrogate",
            appliedTo: cadGroundVehicleEnabled
              ? "rapier-ground-vehicle-xz-waypoint-and-avoidance-controller"
              : "rapier-3d-flight-waypoint-and-avoidance-controller",
            supportedModes: ["ground-vehicle", "flight"],
          },
          transientMaterial: {
            enabled: cadTransientEnabled,
            materialId: cadTransientMaterial,
            material: REDUCED_MATERIALS[cadTransientMaterial],
            model: "cad-local-signed-kelvin-voigt-bilinear-elastoplastic-cumulative-damage-reduced-order",
            scope: "equivalent-transient-response-not-full-nonlinear-fea",
            fracture: {
              enabled: cadFractureEnabled,
              damageThreshold: cadFractureDamageThreshold,
              fragments: 4,
              model: "bounding-box-four-rigid-fragment-reduced-order",
            },
          },
          liftCoefficient: cadLiftCoefficient,
          dragCoefficient: cadDragCoefficient,
          referenceAreaM2: cadReferenceAreaM2,
          windTunnelCalibration: cadAeroCalibration,
          bodyAxes: { forward: "+X", thrustUp: "+Y" },
        },
        extraBalls,
        timeScale,
        acceleratedBatch: {
          enabled: fastForwardEnabled,
          fixedStepsPerFrame: fastForwardStepsPerFrame,
          targetSimulationSeconds: stopAtSimulationS,
          physicsTimestepHz: 120,
        },
        componentBodies: componentBodiesEnabled,
        componentJointMotorRpm: componentJointRpm,
        componentJointActuator: {
          maxRevoluteTorqueNm: componentJointMaxTorqueNm,
          maxSliderForceN: componentJointMaxForceN,
          electricalEfficiency: componentJointEfficiency,
          model: "bounded-velocity-servo-with-limit-and-stall-telemetry",
        },
        fixedStepHz: 120,
        activeBodyDensityKgM3: cadShape.densityKgM3,
      },
      activeCadBody: {
        source: cadShape.source,
        bodyMode: cadBodyMode,
        collider: "convex-hull",
        meshVertexCount: cadShape.positions.length / 3,
        sizeM: cadShape.size,
        densityKgM3: cadShape.densityKgM3,
        finalStateM: {
          positionM: cadState.p,
          rotation: cadState.r,
          velocityMps: cadState.v,
        },
      },
      parkedCadBodies: parkedShapes.map((shape) => ({
        id: shape.id,
        name: shape.name,
        collider: "convex-hull",
        bodyMode: "fixed",
        meshVertexCount: shape.positions.length / 3,
        sizeM: shape.size,
      })),
      elapsedSimulationS: simTime,
      activeCadFlightTelemetry: flight,
      activeCadGroundTelemetry: ground,
      activeCadRobotTerrainTelemetry: robotTerrain,
      activeCadPeakFlightLoad: peakFlightLoad,
      activeCadPeakImpactLoad: peakImpactLoad,
      linkedStaticPeakLoadFea: linkedPeakLoadFea,
      importedComponents: componentBodiesEnabled
        ? componentShapes.map((c) => ({
            id: c.id,
            name: c.name,
            material: c.material,
            densityKgM3: c.densityKgM3,
          }))
        : [],
      importedJoints: componentBodiesEnabled
        ? importedJointSummary.supported.map((j) => ({
            id: j.id,
            name: j.name,
            type: j.type,
          }))
        : [],
      importedJointActuatorTelemetry: jointActuators,
      unsupportedJoints: componentBodiesEnabled
        ? importedJointSummary.unsupported.map((j) => ({
            id: j.id,
            name: j.name,
            type: j.type,
          }))
        : [],
      primaryBody: { positionM: state.p, velocityMps: state.v, kineticEnergyJ },
      componentStatesM: componentStates.map((c) => ({
        id: c.id,
        name: c.name,
        positionM: c.p,
        velocityMps: c.v,
      })),
      traceM: trace,
      activeCadTraceM: cadTrace,
      activeCadTelemetryTrace: cadTelemetryTrace,
      activeCadReplanDecisions: replanDecisions,
      activeCadTransientMaterialState: cadTransientState,
      activeCadFractureEvents: fractureEvents,
      collisionEvents: collisions,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `webcad-physics-lab-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const addTrace = (p: Vec3) =>
    setTrace((old) =>
      old.length >= 400 ? [...old.slice(-399), p] : [...old, p],
    );
  const addCadTrace = (p: Vec3) =>
    setCadTrace((old) =>
      old.length >= 400 ? [...old.slice(-399), p] : [...old, p],
    );
  const addCadTelemetrySample = (sample: CadTelemetrySample) =>
    setCadTelemetryTrace((old) =>
      old.length >= 1200 ? [...old.slice(-1199), sample] : [...old, sample],
    );
  const addReplanDecision = (decision: ReplanDecision) =>
    setReplanDecisions((old) =>
      old.length >= 256 ? [...old.slice(-255), decision] : [...old, decision],
    );
  const addFractureEvent = (event: FractureEvent) =>
    setFractureEvents((old) => [...old, event].slice(-32));
  const trainCadNavigationPolicy = () => {
    const route = cadWaypointRoute.length
      ? cadWaypointRoute
      : [{ x: cadWaypointX, z: cadWaypointZ }];
    const obstacles = Array.from({ length: obstacleCount }, (_, i) => ({
      x: -4.1 + (i % 5) * 1.55,
      z: 2.25 + Math.floor(i / 5) * 1.15,
      radius: 0.62,
    }));
    const relativeRoute = route.map((point) => ({
      x: point.x - cadStartX,
      z: point.z - cadStartZ,
    }));
    const relativeObstacles = obstacles.map((obstacle) => ({
      ...obstacle,
      x: obstacle.x - cadStartX,
      z: obstacle.z - cadStartZ,
    }));
    const result = trainNavigationPolicy(relativeRoute, relativeObstacles);
    setCadNavigationPolicy(result.policy);
    setCadNavigationTraining(result);
  };
  const trainCadRlNavigationPolicy = () => {
    // Fixed seed makes browser/VPS training reproducible and is covered by the
    // held-out evaluation acceptance in reinforcement-navigation.test.mjs.
    const policy = trainTabularNavigationPolicy({ episodes: 1200, seed: 42 });
    setCadRlNavigationPolicy(policy);
    setCadRlNavigationEnabled(true);
  };
  const applyWindTunnelCalibration = () => {
    if (!windResult) return;
    const cd = Math.max(0, windResult.cdCorr ?? windResult.cd);
    const frontalAreaM2 = Math.max(0.01, windResult.frontalAreaMM2 / 1_000_000);
    setCadDragCoefficient(cd);
    setCadReferenceAreaM2(frontalAreaM2);
    setAirDensity(Math.max(0, windResult.rho));
    setWind(Math.max(0, windResult.speed));
    setEnvironmentPreset("custom");
    setCadAeroCalibration({
      source: "webcad-lbm-wind-tunnel",
      cd,
      frontalAreaM2,
      densityKgM3: windResult.rho,
      speedMps: windResult.speed,
      reynolds: windResult.re,
      converged: windResult.converged,
      resolution: windResult.res,
      warnings: [...windResult.warnings],
    });
  };
  const captureFlightTelemetry = (telemetry: FlightTelemetry) => {
    setFlight(telemetry);
    const magnitude = Math.hypot(...telemetry.forceWorldN);
    if (!(magnitude > 0) || !Number.isFinite(magnitude)) return;
    setPeakFlightLoad((current) =>
      magnitude > Math.hypot(...(current?.forceWorldN ?? [0, 0, 0]))
        ? telemetry
        : current,
    );
  };
  const captureCadImpact = (impact: ImpactLoad) => {
    if (!Number.isFinite(impact.magnitudeN) || impact.magnitudeN <= 0) return;
    setPeakImpactLoad((current) =>
      impact.magnitudeN > (current?.magnitudeN ?? 0) ? impact : current,
    );
  };
  const transferPeakFlightLoadToFea = () => {
    if (!peakFlightLoad) {
      setFeaTransferNote("尚未量到有效飛行載荷：啟用飛行力學並播放模擬後再試。");
      return;
    }
    if (!feaFixed || !feaLoad) {
      setFeaTransferNote("請先在 FEA 選好固定面及受力面；系統不會猜測結構支撐或受力位置。");
      return;
    }
    // Physics Lab axes are [CAD X, CAD Z, −CAD Y]. Convert the world resultant
    // back to the active CAD/FEA coordinate system before writing the custom load.
    const [wx, wy, wz] = peakFlightLoad.forceWorldN;
    const cadForce: Vec3 = [wx, -wz, wy];
    const forceN = Math.hypot(...cadForce);
    if (!(forceN > 1e-6) || !Number.isFinite(forceN)) {
      setFeaTransferNote("峰值載荷並非有限向量，已拒絕轉入 FEA。");
      return;
    }
    setFeaOpt({
      feaLoadMode: "force",
      feaForceN: forceN,
      feaDir: "custom",
      feaCustomDir: [cadForce[0] / forceN, cadForce[1] / forceN, cadForce[2] / forceN],
    });
    setFeaTransferNote(
      `已把 t=${peakFlightLoad.atS.toFixed(2)}s 的峰值 ${forceN.toFixed(2)}N 載入已選 FEA 受力面；關閉本實驗室後在 FEA 面板按「運行」。`,
    );
  };
  const transferPeakFlightLoadWithAutoSupport = () => {
    if (!peakFlightLoad) {
      setFeaTransferNote("尚未量到有效飛行載荷：啟用飛行力學並播放模擬後再試。");
      return;
    }
    // This is an explicit operator choice: derive a cantilever support/load
    // pair from the active body's longest axis, rather than pretending the
    // automatically inferred support is the user's real fixture.
    autoFeaCantilever();
    const [wx, wy, wz] = peakFlightLoad.forceWorldN;
    const cadForce: Vec3 = [wx, -wz, wy];
    const forceN = Math.hypot(...cadForce);
    if (!(forceN > 1e-6) || !Number.isFinite(forceN)) {
      setFeaTransferNote("峰值載荷並非有限向量，已拒絕轉入 FEA。");
      return;
    }
    setFeaOpt({
      feaLoadMode: "force",
      feaForceN: forceN,
      feaDir: "custom",
      feaCustomDir: [cadForce[0] / forceN, cadForce[1] / forceN, cadForce[2] / forceN],
    });
    setFeaTransferNote(
      `已用「自動懸臂」建立假設支撐／受力面，並載入峰值 ${forceN.toFixed(2)}N；關閉本實驗室後在 FEA 面板核對兩面及按「運行」。`,
    );
  };
  const transferPeakImpactLoadToFea = (autoSupport = false) => {
    if (!peakImpactLoad) {
      setFeaTransferNote("尚未量到活動 CAD 的有效衝擊峰值。");
      return;
    }
    if (!autoSupport && (!feaFixed || !feaLoad)) {
      setFeaTransferNote("請先在 FEA 選好固定面及受力面；系統不會猜測衝擊受力位置。");
      return;
    }
    if (autoSupport) autoFeaCantilever();
    const [wx, wy, wz] = peakImpactLoad.forceWorldN;
    const cadForce: Vec3 = [wx, -wz, wy];
    const forceN = Math.hypot(...cadForce);
    if (!(forceN > 1e-6) || !Number.isFinite(forceN)) {
      setFeaTransferNote("衝擊峰值方向無效，已拒絕轉入 FEA。");
      return;
    }
    setFeaOpt({
      feaLoadMode: "force",
      feaForceN: forceN,
      feaDir: "custom",
      feaCustomDir: [cadForce[0] / forceN, cadForce[1] / forceN, cadForce[2] / forceN],
    });
    setFeaTransferNote(
      `${autoSupport ? "已用自動懸臂假設" : "已使用已選 FEA 面"}載入 t=${peakImpactLoad.atS.toFixed(2)}s、對象「${peakImpactLoad.counterparty}」的 Rapier 單點衝擊峰值 ${forceN.toFixed(2)}N；請核對支撐及受力面後在 FEA 運行。`,
    );
  };
  const addCollision = (e: CollisionEvent) =>
    setCollisions((old) => [...old, e].slice(-8));
  const ballRadiusM = 0.45;
  const ballVolumeM3 = (4 / 3) * Math.PI * ballRadiusM ** 3;
  const ballMassKg = ballVolumeM3 * BALL_MATERIALS[ballMaterial].densityKgM3;
  const kineticEnergyJ =
    0.5 * ballMassKg * (state.v[0] ** 2 + state.v[1] ** 2 + state.v[2] ** 2);
  return (
    <div
      className="physics-lab-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="環境模擬實驗室"
    >
      <section className="physics-lab">
        <header>
          <div>
            <b>🧪 環境模擬實驗室</b>
            <small>互動級剛體模擬 · 重力、碰撞、摩擦、反彈、統一風</small>
          </div>
          <div className="physics-lab-header-actions">
            <button
              className="primary"
              disabled={!worldReady}
              onClick={() => setRunning((v) => !v)}
            >
              {!worldReady ? "建立物理世界…" : running ? "❚❚ 暫停" : "▶ 播放"}
            </button>
            <button onClick={resetLab}>↺ 重設</button>
            <button
              onClick={exportReport}
              disabled={
                simTime <= 0 &&
                !trace.length &&
                !cadTrace.length &&
                !cadTelemetryTrace.length &&
                !replanDecisions.length &&
                !collisions.length
              }
            >
              ⇩ 報告
            </button>
            <button
              className="close"
              onClick={() => close(false)}
              aria-label="關閉環境模擬實驗室"
            >
              ×
            </button>
          </div>
        </header>
        <main>
          <aside>
            <h3>實驗環境</h3>
            <label>
              重力 <output>{gravity.toFixed(2)} m/s²</output>
              <select
                data-testid="physics-environment-preset"
                value={environmentPreset}
                onChange={(e) => {
                  const next = e.target.value as EnvironmentPreset;
                  setEnvironmentPreset(next);
                  if (next !== "custom") {
                    const preset = ENVIRONMENT_PRESETS[next];
                    setGravity(preset.gravity);
                    setAirDensity(preset.airDensity);
                    setRunning(false);
                    setReset((v) => v + 1);
                  }
                }}
              >
                {Object.entries(ENVIRONMENT_PRESETS).map(([id, preset]) => (
                  <option key={id} value={id}>
                    {preset.label}
                  </option>
                ))}
                <option value="custom">自訂數值</option>
              </select>
              <input
                data-testid="physics-gravity"
                type="range"
                min="0"
                max="25"
                step=".01"
                value={gravity}
                onChange={(e) => {
                  setGravity(+e.target.value);
                  setEnvironmentPreset("custom");
                }}
              />
            </label>
            <label>
              反彈系數 <output>{restitution.toFixed(2)}</output>
              <input
                type="range"
                min="0"
                max="1"
                step=".01"
                value={restitution}
                onChange={(e) => setRestitution(+e.target.value)}
              />
            </label>
            <label>
              地面摩擦 <output>{friction.toFixed(2)}</output>
              <input
                type="range"
                min="0"
                max="1.5"
                step=".01"
                value={friction}
                onChange={(e) => setFriction(+e.target.value)}
              />
            </label>
            <label>
              空氣密度 <output>{airDensity.toFixed(3)} kg/m³</output>
              <input
                data-testid="physics-air-density"
                type="range"
                min="0"
                max="2.5"
                step=".005"
                value={airDensity}
                onChange={(e) => {
                  setAirDensity(+e.target.value);
                  setEnvironmentPreset("custom");
                }}
              />
            </label>
            <label>
              均勻風速 <output>{wind.toFixed(1)} m/s</output>
              <input
                data-testid="physics-wind-speed"
                type="range"
                min="0"
                max="30"
                step=".1"
                value={wind}
                onChange={(e) => setWind(+e.target.value)}
              />
            </label>
            <label>
              風向
              <select
                data-testid="physics-wind-direction"
                value={windDirection}
                onChange={(e) =>
                  setWindDirection(e.target.value as WindDirection)
                }
              >
                <option value="x+">＋X</option>
                <option value="x-">−X</option>
                <option value="z+">＋Z</option>
                <option value="z-">−Z</option>
              </select>
            </label>
            <label>
              模擬速度 <output>{timeScale.toFixed(2)}×</output>
              <input
                type="range"
                min=".25"
                max="4"
                step=".25"
                value={timeScale}
                onChange={(e) => setTimeScale(+e.target.value)}
              />
            </label>
            <label className="physics-lab-toggle">
              <span>加速批次模式（仍逐步計算 120 Hz）</span>
              <input
                data-testid="physics-fast-forward-enabled"
                type="checkbox"
                checked={fastForwardEnabled}
                onChange={(e) => setFastForwardEnabled(e.target.checked)}
              />
            </label>
            <label>
              每畫面物理步數 <output>{fastForwardStepsPerFrame}</output>
              <input
                data-testid="physics-fast-forward-steps"
                type="range"
                min="30"
                max="1200"
                step="30"
                disabled={!fastForwardEnabled}
                value={fastForwardStepsPerFrame}
                onChange={(e) => setFastForwardStepsPerFrame(+e.target.value)}
              />
            </label>
            <label>
              自動停止時間 <output>{stopAtSimulationS >= 3600 ? `${(stopAtSimulationS / 3600).toFixed(2)} h` : `${stopAtSimulationS.toFixed(0)} s`}</output>
              <input
                data-testid="physics-stop-at-seconds"
                type="range"
                min="1"
                max="86400"
                step="1"
                disabled={!fastForwardEnabled}
                value={stopAtSimulationS}
                onChange={(e) => setStopAtSimulationS(+e.target.value)}
              />
            </label>
            <p className="physics-lab-note" data-testid="physics-fast-forward-status">
              {fastForwardEnabled
                ? `每個畫面最多推進 ${(fastForwardStepsPerFrame / 120).toFixed(2)} 秒模擬時間；到達目標會自動暫停。`
                : "一般即時模式。"}
            </p>
            <h3>實驗室環境</h3>
            <label>
              房間闊度 <output>{roomWidth.toFixed(0)} m</output>
              <input
                data-testid="physics-room-width"
                type="range"
                min="8"
                max="30"
                step="1"
                value={roomWidth}
                onChange={(e) => {
                  setRoomWidth(+e.target.value);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              房間深度 <output>{roomDepth.toFixed(0)} m</output>
              <input
                data-testid="physics-room-depth"
                type="range"
                min="8"
                max="30"
                step="1"
                value={roomDepth}
                onChange={(e) => {
                  setRoomDepth(+e.target.value);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              房間高度 <output>{roomHeight.toFixed(0)} m</output>
              <input
                data-testid="physics-room-height"
                type="range"
                min="4"
                max="16"
                step="1"
                value={roomHeight}
                onChange={(e) => {
                  const next = +e.target.value;
                  setRoomHeight(next);
                  setStartHeight((current) => Math.min(current, next - 0.2));
                  setCadStartHeight((current) => Math.min(current, next - 0.2));
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <p className="physics-lab-note">
              房間六面都係剛性碰撞邊界；改尺寸會重設物理世界，並按同一比例重放已投入嘅
              CAD 裝配。
            </p>
            <h3>快速場景</h3>
            <div className="physics-lab-presets">
              <button
                onClick={() =>
                  loadScenario({
                    gravity: 9.81,
                    restitution: 0.62,
                    friction: 0.55,
                    airDensity: 1.225,
                    wind: 0,
                    startHeight: 4.5,
                    startVx: 0,
                  })
                }
              >
                地球掉落
              </button>
              <button
                onClick={() =>
                  loadScenario({
                    gravity: 1.62,
                    restitution: 0.72,
                    friction: 0.42,
                    airDensity: 0,
                    wind: 0,
                    startHeight: 4.5,
                    startVx: 0,
                  })
                }
              >
                月球低重力
              </button>
              <button
                onClick={() =>
                  loadScenario({
                    gravity: 0,
                    restitution: 0.45,
                    friction: 0.2,
                    airDensity: 1.225,
                    wind: 12,
                    windDirection: "x+",
                    startHeight: 3,
                    startVx: 0,
                  })
                }
              >
                零重力風洞
              </button>
              <button onClick={saveScenario}>儲存目前設定</button>
              <button onClick={restoreScenario}>回復儲存設定</button>
            </div>
            <h3>測試球初始條件</h3>
            <label>
              球材料
              <select
                data-testid="physics-ball-material"
                value={ballMaterial}
                onChange={(e) => {
                  setBallMaterial(e.target.value as BallMaterial);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              >
                <option value="steel">鋼 · 7800 kg/m³</option>
                <option value="aluminum">鋁 · 2700 kg/m³</option>
                <option value="rubber">橡膠 · 1100 kg/m³</option>
              </select>
            </label>
            <p className="physics-lab-note">
              密度會用於剛體質量及碰撞；同一重力場下自由落體加速度相同。
            </p>
            <label>
              X 起點 <output>{startX.toFixed(1)} m</output>
              <input
                data-testid="physics-start-x"
                type="range"
                min="-6"
                max="6"
                step=".1"
                value={startX}
                onChange={(e) => setStartX(+e.target.value)}
              />
            </label>
            <label>
              離地高度 <output>{startHeight.toFixed(1)} m</output>
              <input
                type="range"
                min=".5"
                max="5.8"
                step=".1"
                value={startHeight}
                onChange={(e) => setStartHeight(+e.target.value)}
              />
            </label>
            <label>
              Z 起點 <output>{startZ.toFixed(1)} m</output>
              <input
                data-testid="physics-start-z"
                type="range"
                min="-6"
                max="6"
                step=".1"
                value={startZ}
                onChange={(e) => setStartZ(+e.target.value)}
              />
            </label>
            <label>
              X 初速度 <output>{startVx.toFixed(1)} m/s</output>
              <input
                type="range"
                min="-12"
                max="12"
                step=".1"
                value={startVx}
                onChange={(e) => setStartVx(+e.target.value)}
              />
            </label>
            <label>
              Z 初速度 <output>{startVz.toFixed(1)} m/s</output>
              <input
                data-testid="physics-start-vz"
                type="range"
                min="-12"
                max="12"
                step=".1"
                value={startVz}
                onChange={(e) => setStartVz(+e.target.value)}
              />
            </label>
            <label>
              額外測試球 <output>{extraBalls} 個</output>
              <input
                type="range"
                min="0"
                max="8"
                step="1"
                value={extraBalls}
                onChange={(e) => {
                  setExtraBalls(+e.target.value);
                  setTrace([]);
                  setCadTrace([]);
                  setCollisions([]);
                  setRunning(false);
                }}
              />
            </label>
            <h3>活動 CAD 實體初始條件</h3>
            <p className="physics-lab-note">
              藍色 CAD
              實體可獨立設定投放位置及水平初速度；更改後會重設物理世界。
            </p>
            <label>
              CAD 剛體模式；X 起點 <output>{cadStartX.toFixed(1)} m</output>
              <select
                data-testid="physics-cad-body-mode"
                value={cadBodyMode}
                onChange={(e) => {
                  const mode = e.target.value === "fixed" ? "fixed" : "dynamic";
                  setCadBodyMode(mode);
                  if (mode === "fixed") {
                    setCadHinge(false);
                    setCadSlider(false);
                    setCadFlightEnabled(false);
                    setCadGroundVehicleEnabled(false);
                  }
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              >
                <option value="dynamic">動態剛體（受力／碰撞）</option>
                <option value="fixed">固定治具（地台／障礙物）</option>
              </select>
              <input
                data-testid="physics-cad-start-x"
                type="range"
                min="-6"
                max="6"
                step=".1"
                value={cadStartX}
                onChange={(e) => {
                  setCadStartX(+e.target.value);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              CAD 離地高度 <output>{cadStartHeight.toFixed(1)} m</output>
              <input
                data-testid="physics-cad-start-height"
                type="range"
                min=".3"
                max={Math.max(0.3, roomHeight - 0.2)}
                step=".1"
                value={cadStartHeight}
                onChange={(e) => {
                  setCadStartHeight(+e.target.value);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              CAD Z 起點 <output>{cadStartZ.toFixed(1)} m</output>
              <input
                data-testid="physics-cad-start-z"
                type="range"
                min="-6"
                max="6"
                step=".1"
                value={cadStartZ}
                onChange={(e) => {
                  setCadStartZ(+e.target.value);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              CAD X 初速度 <output>{cadStartVx.toFixed(1)} m/s</output>
              <input
                data-testid="physics-cad-start-vx"
                type="range"
                min="-12"
                max="12"
                step=".1"
                disabled={cadBodyMode === "fixed"}
                value={cadStartVx}
                onChange={(e) => {
                  setCadStartVx(+e.target.value);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              CAD Z 初速度 <output>{cadStartVz.toFixed(1)} m/s</output>
              <input
                data-testid="physics-cad-start-vz"
                type="range"
                min="-12"
                max="12"
                step=".1"
                disabled={cadBodyMode === "fixed"}
                value={cadStartVz}
                onChange={(e) => {
                  setCadStartVz(+e.target.value);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <h3>CAD 關節及驅動</h3>
            <label className="physics-lab-toggle">
              <span>將 CAD 物件固定到轉軸</span>
              <input
                type="checkbox"
                disabled={cadBodyMode === "fixed"}
                checked={cadHinge}
                onChange={(e) => {
                  setCadHinge(e.target.checked);
                  if (e.target.checked) setCadSlider(false);
                  setRunning(false);
                }}
              />
            </label>
            <label>
              轉軸馬達 <output>{motorRpm.toFixed(0)} rpm</output>
              <input
                type="range"
                min="-120"
                max="120"
                step="1"
                disabled={!cadHinge}
                value={motorRpm}
                onChange={(e) => setMotorRpm(+e.target.value)}
              />
            </label>
            <label className="physics-lab-toggle">
              <span>將 CAD 物件固定到線性滑軌</span>
              <input
                type="checkbox"
                disabled={cadBodyMode === "fixed"}
                checked={cadSlider}
                onChange={(e) => {
                  setCadSlider(e.target.checked);
                  if (e.target.checked) setCadHinge(false);
                  setRunning(false);
                }}
              />
            </label>
            <label>
              直線馬達 <output>{sliderSpeed.toFixed(2)} m/s</output>
              <input
                type="range"
                min="-3"
                max="3"
                step=".05"
                disabled={!cadSlider}
                value={sliderSpeed}
                onChange={(e) => setSliderSpeed(+e.target.value)}
              />
            </label>
            <h3>CAD 地面車／機械人</h3>
            <p className="physics-lab-note">
              本地 +X 為車頭；以真實剛體接觸為前提，計算有上限的驅動、煞車、側滑輪胎力與偏航力矩。這是降階車輛模型，不會虛構輪胎幾何。
            </p>
            <label className="physics-lab-toggle">
              <span>啟用地面驅動</span>
              <input
                data-testid="physics-cad-ground-enabled"
                type="checkbox"
                disabled={cadBodyMode === "fixed"}
                checked={cadGroundVehicleEnabled}
                onChange={(e) => {
                  setCadGroundVehicleEnabled(e.target.checked);
                  if (e.target.checked) setCadFlightEnabled(false);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              目標車速 <output>{cadGroundTargetSpeedMps.toFixed(1)} m/s</output>
              <input data-testid="physics-cad-ground-target-speed" type="range" min="-30" max="60" step=".1" disabled={!cadGroundVehicleEnabled || cadBodyMode === "fixed"} value={cadGroundTargetSpeedMps} onChange={(e) => setCadGroundTargetSpeedMps(+e.target.value)} />
            </label>
            <label>
              最大驅動力 <output>{cadGroundMaxDriveForceN.toFixed(0)} N</output>
              <input data-testid="physics-cad-ground-drive-force" type="range" min="0" max="20000" step="10" disabled={!cadGroundVehicleEnabled || cadBodyMode === "fixed"} value={cadGroundMaxDriveForceN} onChange={(e) => setCadGroundMaxDriveForceN(+e.target.value)} />
            </label>
            <label>
              最大煞車力 <output>{cadGroundMaxBrakeForceN.toFixed(0)} N</output>
              <input data-testid="physics-cad-ground-brake-force" type="range" min="0" max="30000" step="10" disabled={!cadGroundVehicleEnabled || cadBodyMode === "fixed"} value={cadGroundMaxBrakeForceN} onChange={(e) => setCadGroundMaxBrakeForceN(+e.target.value)} />
            </label>
            <label>
              手動轉向 <output>{cadGroundSteeringDeg.toFixed(1)}°</output>
              <input data-testid="physics-cad-ground-steering" type="range" min="-60" max="60" step=".5" disabled={!cadGroundVehicleEnabled || cadBodyMode === "fixed"} value={cadGroundSteeringDeg} onChange={(e) => setCadGroundSteeringDeg(+e.target.value)} />
            </label>
            <label>
              最大轉向力矩 <output>{cadGroundMaxSteeringTorqueNm.toFixed(0)} N·m</output>
              <input data-testid="physics-cad-ground-steering-torque" type="range" min="0" max="10000" step="10" disabled={!cadGroundVehicleEnabled || cadBodyMode === "fixed"} value={cadGroundMaxSteeringTorqueNm} onChange={(e) => setCadGroundMaxSteeringTorqueNm(+e.target.value)} />
            </label>
            <h3>ROS 2／rosbridge 控制</h3>
            <label>
              WebSocket URL
              <input
                data-testid="physics-rosbridge-url"
                type="url"
                spellCheck={false}
                disabled={rosStatus === "connecting" || rosStatus === "connected"}
                value={rosBridgeUrl}
                onChange={(event) => setRosBridgeUrl(event.target.value)}
              />
            </label>
            <div className="physics-lab-presets">
              <button
                type="button"
                data-testid="physics-rosbridge-connect"
                disabled={rosStatus === "connecting" || rosStatus === "connected"}
                onClick={connectRosBridge}
              >
                {rosStatus === "connecting" ? "連線中…" : "連線"}
              </button>
              <button
                type="button"
                data-testid="physics-rosbridge-disconnect"
                disabled={rosStatus === "disconnected"}
                onClick={disconnectRosBridge}
              >
                斷線
              </button>
            </div>
            <p className="physics-lab-note" data-testid="physics-rosbridge-status">
              狀態：{rosStatus} · 訂閱 <code>/webcad/cmd_vel</code>（Twist）· 發布 <code>/webcad/simulation_state</code>（String JSON，10 Hz）· 已發布 {rosPublishedCount}。
              {rosLastCommand ? ` 最近命令：v=${rosLastCommand.linearMps.toFixed(2)} m/s、ω=${rosLastCommand.angularRadS.toFixed(2)} rad/s。` : ""}
              {!cadGroundVehicleEnabled ? " 要實際驅動模型，請先啟用地面驅動。" : ""}
              {location.protocol === "https:" ? " 正式 HTTPS 頁面請使用 wss:// rosbridge。" : ""}
            </p>
            <h3>CAD 飛行力學</h3>
            <p className="physics-lab-note">
              推力沿模型本地 +Y；升力按相對氣流、模型姿態與參考面積計算。這是即時剛體航空力模型，不是 CFD。
            </p>
            <div className="physics-lab-presets">
              <button
                type="button"
                data-testid="physics-apply-wind-tunnel-calibration"
                disabled={!windResult}
                onClick={applyWindTunnelCalibration}
              >
                套用 WebCAD 風洞校準
              </button>
            </div>
            <p className="physics-lab-note" data-testid="physics-wind-tunnel-calibration-status">
              {cadAeroCalibration
                ? `已套用趨勢級 LBM：Cd ${cadAeroCalibration.cd.toFixed(3)} · 面積 ${(cadAeroCalibration.frontalAreaM2 * 1e4).toFixed(2)} cm² · ${cadAeroCalibration.speedMps.toFixed(1)} m/s · Re ${cadAeroCalibration.reynolds.toExponential(2)}${cadAeroCalibration.converged ? "" : " · 未完全收斂"}`
                : windResult
                  ? "已有同一 WebCAD 文件的風洞結果，可套用 Cd、迎風面積、流體密度及工況速度。"
                  : "尚未有風洞結果；先在 INSPECT／風洞完成一次趨勢級 LBM 分析。"}
            </p>
            <label className="physics-lab-toggle">
              <span>啟用已載入 CAD 的推力／升力／阻力</span>
              <input
                data-testid="physics-cad-flight-enabled"
                type="checkbox"
                disabled={cadBodyMode === "fixed"}
                checked={cadFlightEnabled}
                onChange={(e) => {
                  setCadFlightEnabled(e.target.checked);
                  if (e.target.checked) setCadGroundVehicleEnabled(false);
                  setRunning(false);
                  setReset((v) => v + 1);
                }}
              />
            </label>
            <label>
              推力 <output>{cadThrustN.toFixed(0)} N</output>
              <input data-testid="physics-cad-thrust-n" type="range" min="0" max="5000" step="1" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadThrustN} onChange={(e) => setCadThrustN(+e.target.value)} />
            </label>
            <label>
              電池容量 <output>{cadBatteryCapacityWh.toFixed(0)} Wh</output>
              <input data-testid="physics-cad-battery-capacity" type="number" min="1" max="100000" step="10" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadBatteryCapacityWh} onChange={(e) => setCadBatteryCapacityWh(Math.max(1, Math.min(100000, +e.target.value || 1)))} />
            </label>
            <label>
              單馬達最大推力 <output>{cadMaxRotorThrustN.toFixed(0)} N</output>
              <input data-testid="physics-cad-max-rotor-thrust" type="number" min="1" max="25000" step="10" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadMaxRotorThrustN} onChange={(e) => setCadMaxRotorThrustN(Math.max(1, Math.min(25000, +e.target.value || 1)))} />
            </label>
            <label>
              馬達響應時間 <output>{cadMotorTimeConstantS.toFixed(3)} s</output>
              <input data-testid="physics-cad-motor-time-constant" type="number" min="0.005" max="5" step="0.005" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadMotorTimeConstantS} onChange={(e) => setCadMotorTimeConstantS(Math.max(0.005, Math.min(5, +e.target.value || 0.005)))} />
            </label>
            <label>
              電效率 <output>{(cadElectricalEfficiency * 100).toFixed(0)}%</output>
              <input data-testid="physics-cad-electrical-efficiency" type="range" min="0.05" max="1" step="0.01" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadElectricalEfficiency} onChange={(e) => setCadElectricalEfficiency(+e.target.value)} />
            </label>
            <label>
              單 rotor disk 面積 <output>{cadRotorDiskAreaM2.toFixed(3)} m²</output>
              <input data-testid="physics-cad-rotor-disk-area" type="number" min="0.001" max="20" step="0.001" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadRotorDiskAreaM2} onChange={(e) => setCadRotorDiskAreaM2(Math.max(0.001, Math.min(20, +e.target.value || 0.001)))} />
            </label>
            <label>
              航電功耗 <output>{cadAvionicsPowerW.toFixed(0)} W</output>
              <input data-testid="physics-cad-avionics-power" type="number" min="0" max="10000" step="1" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadAvionicsPowerW} onChange={(e) => setCadAvionicsPowerW(Math.max(0, Math.min(10000, +e.target.value || 0)))} />
            </label>
            <label className="physics-lab-toggle">
              <span>高度保持（PD 控制，非 AI）</span>
              <input
                data-testid="physics-cad-altitude-hold-enabled"
                type="checkbox"
                disabled={!cadFlightEnabled || cadBodyMode === "fixed"}
                checked={cadAutopilotEnabled}
                onChange={(e) => setCadAutopilotEnabled(e.target.checked)}
              />
            </label>
            <label>
              目標高度 <output>{cadTargetAltitudeM.toFixed(1)} m</output>
              <input
                data-testid="physics-cad-target-altitude"
                type="range"
                min="0.3"
                max={Math.max(0.3, roomHeight - 0.2)}
                step="0.1"
                disabled={!cadFlightEnabled || !cadAutopilotEnabled || cadBodyMode === "fixed"}
                value={cadTargetAltitudeM}
                onChange={(e) => setCadTargetAltitudeM(+e.target.value)}
              />
            </label>
            <label className="physics-lab-toggle">
              <span>目標點導航（飛行／地面車規則控制，非 AI）</span>
              <input
                data-testid="physics-cad-waypoint-enabled"
                type="checkbox"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || cadBodyMode === "fixed"}
                checked={cadWaypointEnabled}
                onChange={(e) => {
                  setCadWaypointEnabled(e.target.checked);
                  if (e.target.checked && cadFlightEnabled) setCadAutopilotEnabled(true);
                }}
              />
            </label>
            <label>
              目標 X <output>{cadWaypointX.toFixed(1)} m</output>
              <input
                data-testid="physics-cad-waypoint-x"
                type="range"
                min={-roomWidth / 2 + 0.3}
                max={roomWidth / 2 - 0.3}
                step="0.1"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || !cadWaypointEnabled || cadBodyMode === "fixed"}
                value={cadWaypointX}
                onChange={(e) => setCadWaypointX(+e.target.value)}
              />
            </label>
            <label>
              目標 Z <output>{cadWaypointZ.toFixed(1)} m</output>
              <input
                data-testid="physics-cad-waypoint-z"
                type="range"
                min={-roomDepth / 2 + 0.3}
                max={roomDepth / 2 - 0.3}
                step="0.1"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || !cadWaypointEnabled || cadBodyMode === "fixed"}
                value={cadWaypointZ}
                onChange={(e) => setCadWaypointZ(+e.target.value)}
              />
            </label>
            <div className="physics-lab-presets" data-testid="physics-cad-waypoint-route-controls">
              <button
                type="button"
                data-testid="physics-cad-waypoint-add"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || cadBodyMode === "fixed" || cadWaypointRoute.length >= 64}
                onClick={() => setCadWaypointRoute((route) => [...route, { x: cadWaypointX, z: cadWaypointZ }])}
              >
                加入路點
              </button>
              <button
                type="button"
                data-testid="physics-cad-waypoint-remove-last"
                disabled={cadWaypointRoute.length === 0}
                onClick={() => setCadWaypointRoute((route) => route.slice(0, -1))}
              >
                移除最後
              </button>
              <button
                type="button"
                data-testid="physics-cad-waypoint-clear"
                disabled={cadWaypointRoute.length === 0}
                onClick={() => setCadWaypointRoute([])}
              >
                清除路線
              </button>
              <button
                type="button"
                data-testid="physics-cad-waypoint-replay"
                disabled={!cadWaypointEnabled || cadWaypointRoute.length === 0}
                onClick={resetLab}
              >
                由頭重播
              </button>
            </div>
            <label className="physics-lab-toggle">
              <span>循環路線（最後一點返回第一點）</span>
              <input
                data-testid="physics-cad-waypoint-loop"
                type="checkbox"
                disabled={cadWaypointRoute.length < 2}
                checked={cadWaypointLoop}
                onChange={(e) => setCadWaypointLoop(e.target.checked)}
              />
            </label>
            <p className="physics-lab-note" data-testid="physics-cad-waypoint-route-status">
              {cadWaypointRoute.length
                ? `路線 ${cadWaypointRoute.length} 點；目前 ${Math.min((cadGroundVehicleEnabled ? ground.waypointIndex : flight.waypointIndex) + 1, cadWaypointRoute.length)}/${cadWaypointRoute.length}${(cadGroundVehicleEnabled ? ground.waypointCompleted : flight.waypointCompleted) ? "；已完成" : ""}`
                : "未建立路線；導航會沿用上面單一目標點。"}
            </p>
            <label className="physics-lab-toggle">
              <span>避開實驗室方塊障礙（規則控制）</span>
              <input
                data-testid="physics-cad-obstacle-avoidance-enabled"
                type="checkbox"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || !cadWaypointEnabled || obstacleCount === 0 || cadBodyMode === "fixed"}
                checked={cadObstacleAvoidanceEnabled}
                onChange={(e) => setCadObstacleAvoidanceEnabled(e.target.checked)}
              />
            </label>
            <label className="physics-lab-toggle">
              <span>通用碰撞器射線避障（實驗性）</span>
              <input
                data-testid="physics-cad-raycast-avoidance-enabled"
                type="checkbox"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || !cadWaypointEnabled || cadBodyMode === "fixed"}
                checked={cadRaycastAvoidanceEnabled}
                onChange={(e) => setCadRaycastAvoidanceEnabled(e.target.checked)}
              />
            </label>
            <label className="physics-lab-toggle">
              <span>動態路線重規劃（較空一側臨時繞道）</span>
              <input
                data-testid="physics-cad-dynamic-replan-enabled"
                type="checkbox"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || !cadWaypointEnabled || !cadRaycastAvoidanceEnabled || cadBodyMode === "fixed"}
                checked={cadDynamicReplanEnabled}
                onChange={(e) => setCadDynamicReplanEnabled(e.target.checked)}
              />
            </label>
            <p className="physics-lab-note" data-testid="physics-cad-replan-status">
              {(cadGroundVehicleEnabled ? ground.detourActive : flight.detourActive)
                ? `正在繞道至 (${(cadGroundVehicleEnabled ? ground.plannedTarget : flight.plannedTarget)?.x.toFixed(2)}, ${(cadGroundVehicleEnabled ? ground.plannedTarget : flight.plannedTarget)?.z.toFixed(2)})；累計重規劃 ${cadGroundVehicleEnabled ? ground.replanCount : flight.replanCount} 次`
                : `主路線運行；累計重規劃 ${cadGroundVehicleEnabled ? ground.replanCount : flight.replanCount} 次`}
            </p>
            <div className="physics-lab-presets">
              <button
                type="button"
                data-testid="physics-cad-train-navigation-policy"
                disabled={!(cadFlightEnabled || cadGroundVehicleEnabled) || !cadWaypointEnabled || cadBodyMode === "fixed"}
                onClick={trainCadNavigationPolicy}
              >
                訓練導航策略
              </button>
              <button
                type="button"
                data-testid="physics-cad-reset-navigation-policy"
                onClick={() => {
                  setCadNavigationPolicy(defaultNavigationPolicy());
                  setCadNavigationTraining(null);
                }}
              >
                回復預設策略
              </button>
            </div>
            <p className="physics-lab-note" data-testid="physics-cad-navigation-policy-status">
              導航增益 {cadNavigationPolicy.navigationGain.toFixed(3)} · 避障增益 {cadNavigationPolicy.avoidanceGain.toFixed(3)} · 阻尼 {cadNavigationPolicy.dampingGain.toFixed(3)}
              {cadNavigationTraining
                ? `；演化搜尋 ${cadNavigationTraining.generations}×${cadNavigationTraining.candidates}，評分 ${cadNavigationTraining.baselineScore.toFixed(1)} → ${cadNavigationTraining.trainedScore.toFixed(1)}`
                : "；目前使用預設策略，尚未訓練。"}
            </p>
            <label className="physics-lab-toggle">
              <span>使用 episodic Q-learning 控制地面車</span>
              <input
                data-testid="physics-cad-rl-navigation-enabled"
                type="checkbox"
                disabled={!cadGroundVehicleEnabled || !cadWaypointEnabled || !cadRlNavigationPolicy || cadBodyMode === "fixed"}
                checked={cadRlNavigationEnabled}
                onChange={(event) => setCadRlNavigationEnabled(event.target.checked)}
              />
            </label>
            <div className="physics-lab-presets">
              <button
                type="button"
                data-testid="physics-cad-train-rl-navigation"
                disabled={!cadGroundVehicleEnabled || !cadWaypointEnabled || cadBodyMode === "fixed"}
                onClick={trainCadRlNavigationPolicy}
              >
                訓練 Q-learning（1200 episodes）
              </button>
              <button
                type="button"
                data-testid="physics-cad-reset-rl-navigation"
                disabled={!cadRlNavigationPolicy}
                onClick={() => { setCadRlNavigationEnabled(false); setCadRlNavigationPolicy(null); }}
              >
                清除 RL 策略
              </button>
            </div>
            <p className="physics-lab-note" data-testid="physics-cad-rl-navigation-status">
              {cadRlNavigationPolicy
                ? `真 Q-learning：${cadRlNavigationPolicy.episodes} episodes · 24 states × 4 actions · 評估成功率 ${(cadRlNavigationPolicy.evaluationSuccessRate * 100).toFixed(1)}% · 平均 reward ${cadRlNavigationPolicy.evaluationRewardMean.toFixed(2)}${cadRlNavigationEnabled ? " · 正在控制真 Rapier CAD 地面車" : " · 已訓練但未啟用"}`
                : "尚未訓練；訓練會以 epsilon-greedy episodic reward 更新 Q-table，唔係參數搜尋。"}
            </p>
            <label className="physics-lab-toggle">
              <span>瞬態彈塑性預覽（降階模型）</span>
              <input
                data-testid="physics-cad-transient-enabled"
                type="checkbox"
                disabled={cadBodyMode === "fixed"}
                checked={cadTransientEnabled}
                onChange={(e) => {
                  setCadTransientEnabled(e.target.checked);
                  setCadTransientState(initialTransientMaterialState());
                  setReset((value) => value + 1);
                }}
              />
            </label>
            <label>
              瞬態材料
              <select
                data-testid="physics-cad-transient-material"
                disabled={!cadTransientEnabled || cadBodyMode === "fixed"}
                value={cadTransientMaterial}
                onChange={(e) => {
                  setCadTransientMaterial(e.target.value as ReducedMaterialId);
                  setCadTransientState(initialTransientMaterialState());
                  setReset((value) => value + 1);
                }}
              >
                {Object.entries(REDUCED_MATERIALS).map(([id, material]) => (
                  <option key={id} value={id}>{material.name}</option>
                ))}
              </select>
            </label>
            <dl className="physics-lab-stats" data-testid="physics-cad-transient-readings">
              <dt>等效瞬態位移</dt><dd>{(cadTransientState.displacementM * 1000).toFixed(4)} mm</dd>
              <dt>永久塑性位移</dt><dd>{(cadTransientState.plasticDisplacementM * 1000).toFixed(4)} mm</dd>
              <dt>有符號軸向應力</dt><dd>{(cadTransientState.stressPa / 1e6).toFixed(2)} MPa</dd>
              <dt>塑性應變</dt><dd>{(cadTransientState.plasticStrain * 100).toFixed(3)}%</dd>
              <dt>累積等效塑性應變</dt><dd>{(cadTransientState.cumulativePlasticStrain * 100).toFixed(3)}%</dd>
              <dt>塑性耗散能</dt><dd>{cadTransientState.plasticWorkJ.toFixed(4)} J</dd>
              <dt>載荷反轉</dt><dd>{cadTransientState.loadReversals}</dd>
              <dt>峰值接觸力</dt><dd>{cadTransientState.peakForceN.toFixed(2)} N</dd>
              <dt>損傷</dt><dd>{(cadTransientState.damage * 100).toFixed(1)}%</dd>
              <dt>主要受壓軸</dt><dd>CAD-local {cadTransientState.loadAxis.toUpperCase()}</dd>
              <dt>局部載荷方向</dt><dd>{cadTransientState.loadDirectionLocal.map((value) => value.toFixed(3)).join(", ")}</dd>
              <dt>狀態</dt><dd>{cadTransientState.failed ? "失效" : cadTransientState.yielded ? "已屈服" : "彈性"}</dd>
            </dl>
            <label className="physics-lab-toggle">
              <span>失效後生成碰撞碎片（降階模型）</span>
              <input
                data-testid="physics-cad-fracture-enabled"
                type="checkbox"
                disabled={!cadTransientEnabled || cadBodyMode === "fixed"}
                checked={cadFractureEnabled}
                onChange={(e) => setCadFractureEnabled(e.target.checked)}
              />
            </label>
            <label>
              碎裂損傷／屈服利用率門檻 <output>{(cadFractureDamageThreshold * 100).toFixed(1)}%</output>
              <input
                data-testid="physics-cad-fracture-threshold"
                type="range"
                min="0"
                max="1"
                step="0.001"
                disabled={!cadFractureEnabled}
                value={cadFractureDamageThreshold}
                onChange={(e) => setCadFractureDamageThreshold(+e.target.value)}
              />
            </label>
            <p className="physics-lab-note" data-testid="physics-cad-fracture-status">
              {fractureEvents.length
                ? `已於 ${fractureEvents.at(-1)?.atS.toFixed(2)} s 碎裂成 ${fractureEvents.at(-1)?.fragmentCount} 個 Rapier 碰撞碎片。`
                : "未達碎裂門檻；原 CAD 剛體保持完整。"}
            </p>
            <p className="physics-lab-note">
              呢個係按 Rapier 接觸方向選擇 CAD-local 主軸嘅有符號 Kelvin–Voigt＋雙線性彈塑性模型，會累積反向塑性功及損傷；適合 120 Hz 即時趨勢預覽，唔等同完整非線性瞬態 FEA。
            </p>
            <label>
              升力係數 CL <output>{cadLiftCoefficient.toFixed(2)}</output>
              <input data-testid="physics-cad-lift-coefficient" type="range" min="-2" max="4" step=".01" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadLiftCoefficient} onChange={(e) => setCadLiftCoefficient(+e.target.value)} />
            </label>
            <label>
              阻力係數 CD <output>{cadDragCoefficient.toFixed(2)}</output>
              <input data-testid="physics-cad-drag-coefficient" type="range" min="0" max="3" step=".01" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadDragCoefficient} onChange={(e) => setCadDragCoefficient(+e.target.value)} />
            </label>
            <label>
              參考面積 <output>{cadReferenceAreaM2.toFixed(2)} m²</output>
              <input data-testid="physics-cad-reference-area" type="range" min=".01" max="20" step=".01" disabled={!cadFlightEnabled || cadBodyMode === "fixed"} value={cadReferenceAreaM2} onChange={(e) => setCadReferenceAreaM2(+e.target.value)} />
            </label>
            <h3>地形及障礙</h3>
            <label className="physics-lab-toggle">
              <span>程序化高低地形（81 個真實碰撞 tile）</span>
              <input data-testid="physics-uneven-terrain-enabled" type="checkbox" checked={unevenTerrainEnabled} onChange={(e) => { setUnevenTerrainEnabled(e.target.checked); setRunning(false); }} />
            </label>
            <label>
              地形最大高差 <output>{terrainRoughnessM.toFixed(2)} m</output>
              <input data-testid="physics-terrain-roughness" type="range" min="0.01" max="1.5" step="0.01" disabled={!unevenTerrainEnabled} value={terrainRoughnessM} onChange={(e) => { setTerrainRoughnessM(+e.target.value); setRunning(false); }} />
            </label>
            <label>
              跌倒傾角門檻 <output>{robotFallTiltDeg.toFixed(0)}°</output>
              <input data-testid="physics-robot-fall-tilt" type="range" min="20" max="89" step="1" disabled={!cadGroundVehicleEnabled} value={robotFallTiltDeg} onChange={(e) => setRobotFallTiltDeg(+e.target.value)} />
            </label>
            <label className="physics-lab-toggle">
              <span>加入固定斜坡</span>
              <input
                type="checkbox"
                checked={rampEnabled}
                onChange={(e) => {
                  setRampEnabled(e.target.checked);
                  setRunning(false);
                }}
              />
            </label>
            <label>
              斜坡角度 <output>{rampAngle.toFixed(0)}°</output>
              <input
                type="range"
                min="-25"
                max="25"
                step="1"
                disabled={!rampEnabled}
                value={rampAngle}
                onChange={(e) => setRampAngle(+e.target.value)}
              />
            </label>
            <label>
              障礙方塊 <output>{obstacleCount} 個</output>
              <input
                data-testid="physics-obstacle-count"
                type="range"
                min="0"
                max="10"
                step="1"
                value={obstacleCount}
                onChange={(e) => {
                  setObstacleCount(+e.target.value);
                  setRunning(false);
                }}
              />
            </label>
            <h3>多零件關節鏈</h3>
            <label className="physics-lab-toggle">
              <span>加入三節機械臂示例</span>
              <input
                type="checkbox"
                checked={demoArm}
                onChange={(e) => {
                  setDemoArm(e.target.checked);
                  setRunning(false);
                }}
              />
            </label>
            <label>
              基座馬達 <output>{armRpm.toFixed(0)} rpm</output>
              <input
                type="range"
                min="-90"
                max="90"
                step="1"
                disabled={!demoArm}
                value={armRpm}
                onChange={(e) => setArmRpm(+e.target.value)}
              />
            </label>
            <h3>現有 CAD 元件</h3>
            <label className="physics-lab-toggle">
              <span>將可見元件投入實驗（{componentShapes.length} 件）</span>
              <input
                type="checkbox"
                disabled={!componentShapes.length}
                checked={componentBodiesEnabled}
                onChange={(e) => {
                  setComponentBodiesEnabled(e.target.checked);
                  setRunning(false);
                }}
              />
            </label>
            <p className="physics-lab-note">
              投入後每個元件會成為獨立剛體；保留原有相對位置及旋轉（過大裝配會等比例收納），以凸包作碰撞。已轉換固定／轉動／滑動／球／圓柱／平面
              Joint；亦已轉換螺旋及 pin-slot 約束。
            </p>
            <p className="physics-lab-note">
              質量按 CAD 實體／元件所選物理材質密度計算；無材質元件暫以塑料 1.20
              g/cm³ 作預設。
            </p>
            {componentBodiesEnabled && (
              <>
                <p className="physics-lab-note">
                  物理 Joint：{importedJointSummary.supported.length}；未轉換：
                  {importedJointSummary.unsupported.length}
                </p>
                {importedJointSummary.supported.some(
                  (j) => j.type === "revolute" || j.type === "slider",
                ) && (
                  <>
                  <label>
                    CAD 關節馬達{" "}
                    <output>{componentJointRpm.toFixed(0)} rpm</output>
                    <input
                      data-testid="physics-component-joint-rpm"
                      type="range"
                      min="-120"
                      max="120"
                      step="1"
                      value={componentJointRpm}
                      onChange={(e) => setComponentJointRpm(+e.target.value)}
                    />
                  </label>
                  <label>
                    轉動 Joint 最大扭矩 <output>{componentJointMaxTorqueNm.toFixed(0)} N·m</output>
                    <input data-testid="physics-component-joint-max-torque" type="number" min="0" max="100000" step="1" value={componentJointMaxTorqueNm} onChange={(e) => setComponentJointMaxTorqueNm(Math.max(0, Math.min(100000, +e.target.value || 0)))} />
                  </label>
                  <label>
                    滑動 Joint 最大推力 <output>{componentJointMaxForceN.toFixed(0)} N</output>
                    <input data-testid="physics-component-joint-max-force" type="number" min="0" max="1000000" step="10" value={componentJointMaxForceN} onChange={(e) => setComponentJointMaxForceN(Math.max(0, Math.min(1000000, +e.target.value || 0)))} />
                  </label>
                  <label>
                    致動器效率 <output>{(componentJointEfficiency * 100).toFixed(0)}%</output>
                    <input data-testid="physics-component-joint-efficiency" type="range" min="0.05" max="1" step="0.01" value={componentJointEfficiency} onChange={(e) => setComponentJointEfficiency(+e.target.value)} />
                  </label>
                  </>
                )}
                {jointActuators.length > 0 && (
                  <dl className="physics-lab-stats" data-testid="physics-component-joint-actuators">
                    {jointActuators.map((actuator) => (
                      <div key={actuator.id}>
                        <dt>{actuator.name}</dt>
                        <dd>{actuator.measuredVelocity.toFixed(3)} {actuator.type === "revolute" ? "rad/s" : "m/s"} · {actuator.estimatedEffort.toFixed(2)} {actuator.effortUnit} · {actuator.electricalPowerW.toFixed(1)} W{actuator.stalled ? " · 失速" : actuator.atLowerLimit || actuator.atUpperLimit ? " · 限位" : ""}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                <p className="physics-lab-note">
                  此控制同時驅動已匯入的轉動 Joint；滑動 Joint
                  使用同一數值換算為 m/s。固定、球、圓柱及平面 Joint
                  只作被動約束。
                </p>
              </>
            )}
            <h3>投入物件</h3>
            <p>橙色：主測試球（鋼，剛體）</p>
            <p>黃色：額外測試球（鋁，剛體）</p>
            <p>
              藍色：
              {cadShape.source === "cad"
                ? "現有 CAD 實體＋凸包碰撞體"
                : "預設 CAD 測試件"}
            </p>
            <p>紅色：CAD 轉軸錨點／線性滑軌</p>
            <p>橘紅：三節機械臂示例</p>
            <p>灰藍：固定斜坡障礙</p>
            <p>棕色：固定障礙方塊</p>
            <p className="physics-lab-note">
              凹形 CAD 暫以保守凸包碰撞；目前支援降階瞬態彈塑性與四碎片剛體破裂；連續軟體變形及即時 CFD 尚未支援。
            </p>
          </aside>
          <div className="physics-lab-canvas">
            <Canvas shadows camera={{ position: [10, 8, 12], fov: 45 }}>
              <LabWorld
                settings={settings}
                cadShape={cadShape}
                parkedShapes={parkedShapes}
                componentShapes={componentShapes}
                componentJoints={joints}
                groundedComponent={groundedComponent}
                onState={setState}
                onCadState={setCadState}
                onComponentStates={setComponentStates}
                onTrace={addTrace}
                onCadTrace={addCadTrace}
                onCadTelemetrySample={addCadTelemetrySample}
                onReplanDecision={addReplanDecision}
                onTransientMaterialState={setCadTransientState}
                onFracture={addFractureEvent}
                onSimulationTargetReached={(seconds) => {
                  setSimTime(seconds);
                  setRunning(false);
                }}
                onWorldReady={handleWorldReady}
                worldKey={worldKey}
                onCollision={addCollision}
                onTime={setSimTime}
                onFlightTelemetry={captureFlightTelemetry}
                onGroundTelemetry={setGround}
                onJointActuatorTelemetry={setJointActuators}
                onRobotTerrainTelemetry={setRobotTerrain}
                onCadImpact={captureCadImpact}
              />
              {parkedShapes.map((shape) => (
                <ParkedCadVisual
                  key={shape.id}
                  shape={shape}
                  anchor={[cadStartX, cadStartHeight, cadStartZ]}
                />
              ))}
              {trace.length > 1 && (
                <Line points={trace} color="#f59e0b" lineWidth={2} />
              )}
              {cadTrace.length > 1 && (
                <Line points={cadTrace} color="#18a6d5" lineWidth={2} />
              )}
            </Canvas>
          </div>
          <aside className="physics-lab-readout">
            <h3>測試球即時讀數</h3>
            <dl>
              <dt>材料</dt>
              <dd>{BALL_MATERIALS[ballMaterial].label}</dd>
              <dt>體積 (m³)</dt>
              <dd>{ballVolumeM3.toFixed(4)}</dd>
              <dt>質量 (kg)</dt>
              <dd>{ballMassKg.toFixed(2)}</dd>
              <dt>動能 (J)</dt>
              <dd>{kineticEnergyJ.toFixed(2)}</dd>
              <dt>模擬時間</dt>
              <dd data-testid="physics-simulation-time">{simTime.toFixed(2)} s</dd>
              <dt>位置 (m)</dt>
              <dd>{state.p.map(fmt).join(", ")}</dd>
              <dt>速度 (m/s)</dt>
              <dd>{state.v.map(fmt).join(", ")}</dd>
              <dt>速率 (m/s)</dt>
              <dd>{fmt(Math.hypot(...state.v))}</dd>
              <dt>軌跡取樣</dt>
              <dd>{trace.length} 點</dd>
              <dt>狀態</dt>
              <dd>{running ? "模擬中" : "已暫停"}</dd>
            </dl>
            <h3>活動 CAD 實體讀數</h3>
            <dl className="physics-lab-stats" data-testid="physics-active-cad-readings">
              <dt>位置 (m)</dt>
              <dd>{cadState.p.map(fmt).join(", ")}</dd>
              <dt>速度 (m/s)</dt>
              <dd>{cadState.v.map(fmt).join(", ")}</dd>
              <dt>速率 (m/s)</dt>
              <dd>{fmt(Math.hypot(...cadState.v))}</dd>
              <dt>軌跡取樣</dt>
              <dd>{cadTrace.length} 點</dd>
            </dl>
            <p className="physics-lab-note" data-testid="physics-cad-telemetry-trace">
              時間遙測：{cadTelemetryTrace.length} 點（位置、速度、氣動／控制輸出）
            </p>
            {peakImpactLoad && (
              <>
                <h3>CAD 衝擊峰值</h3>
                <dl className="physics-lab-stats" data-testid="physics-cad-impact-readings">
                  <dt>接觸對象</dt><dd>{peakImpactLoad.counterparty}</dd>
                  <dt>時間</dt><dd>{peakImpactLoad.atS.toFixed(2)} s</dd>
                  <dt>最大單點力</dt><dd>{peakImpactLoad.magnitudeN.toFixed(2)} N</dd>
                </dl>
                <button data-testid="physics-transfer-impact-load-to-fea" onClick={() => transferPeakImpactLoadToFea()}>
                  將衝擊峰值載入已選 FEA 面
                </button>
                <button data-testid="physics-transfer-impact-load-auto-cantilever" onClick={() => transferPeakImpactLoadToFea(true)}>
                  自動懸臂支撐後載入衝擊峰值
                </button>
                {feaTransferNote && <p className="physics-lab-note">{feaTransferNote}</p>}
              </>
            )}
            {cadGroundVehicleEnabled && (
              <>
                <h3>CAD 地面車遙測</h3>
                <dl className="physics-lab-stats" data-testid="physics-cad-ground-readings">
                  <dt>接地</dt><dd>{ground.grounded ? "是" : "否（輪胎力停用）"}</dd>
                  <dt>前向速度</dt><dd>{ground.forwardSpeedMps.toFixed(2)} m/s</dd>
                  <dt>目標速度</dt><dd>{ground.targetSpeedMps.toFixed(2)} m/s</dd>
                  <dt>側滑速度</dt><dd>{ground.lateralSpeedMps.toFixed(2)} m/s</dd>
                  <dt>驅動／煞車力</dt><dd>{ground.driveForceN.toFixed(2)} N</dd>
                  <dt>側向輪胎力</dt><dd>{ground.lateralForceN.toFixed(2)} N</dd>
                  <dt>轉向力矩</dt><dd>{ground.steeringTorqueNm.toFixed(2)} N·m</dd>
                  <dt>機械功率</dt><dd>{ground.mechanicalPowerW.toFixed(2)} W</dd>
                  <dt>航向誤差</dt><dd>{ground.headingErrorDeg.toFixed(2)}°</dd>
                  <dt>路點</dt><dd>{ground.waypointEnabled ? `${ground.waypointCompleted ? "完成" : `第 ${ground.waypointIndex + 1}/${ground.waypointCount} 點`} · 距離 ${ground.waypointDistanceM.toFixed(2)} m` : "手動轉向"}</dd>
                </dl>
                <h3>地形及穩定性</h3>
                <dl className="physics-lab-stats" data-testid="physics-robot-terrain-readings">
                  <dt>不平地形</dt><dd>{robotTerrain.terrainEnabled ? `啟用 · 81 塊 · 粗糙度 ${robotTerrain.roughnessM.toFixed(2)} m` : "關閉"}</dd>
                  <dt>車身傾角</dt><dd>{robotTerrain.tiltDeg.toFixed(2)}°</dd>
                  <dt>最大傾角</dt><dd>{robotTerrain.maxTiltDeg.toFixed(2)}°</dd>
                  <dt>質心高度</dt><dd>{robotTerrain.centerHeightM.toFixed(3)} m</dd>
                  <dt>水平速度</dt><dd>{robotTerrain.horizontalSpeedMps.toFixed(2)} m/s</dd>
                  <dt>離起點距離</dt><dd>{robotTerrain.distanceFromStartM.toFixed(2)} m</dd>
                  <dt>跌倒狀態</dt><dd>{robotTerrain.fallen ? `已跌倒 ${robotTerrain.fallenDurationS.toFixed(2)} s` : "正常"}</dd>
                  <dt>累計跌倒</dt><dd>{robotTerrain.fallCount} 次</dd>
                </dl>
              </>
            )}
            {cadFlightEnabled && (
              <>
                <h3>CAD 飛行遙測</h3>
                <dl className="physics-lab-stats" data-testid="physics-cad-flight-readings">
                  <dt>相對空速</dt><dd>{flight.airspeedMps.toFixed(2)} m/s</dd>
                  <dt>動壓</dt><dd>{flight.dynamicPressurePa.toFixed(2)} Pa</dd>
                  <dt>升力</dt><dd>{flight.liftN.toFixed(2)} N</dd>
                  <dt>阻力</dt><dd>{flight.dragN.toFixed(2)} N</dd>
                  <dt>推力</dt><dd>{flight.thrustN.toFixed(2)} N</dd>
                  <dt>實際指令推力</dt><dd>{flight.commandedThrustN.toFixed(2)} N</dd>
                  <dt>四馬達推力</dt><dd>{flight.rotorThrustN?.map((value) => value.toFixed(1)).join(" / ") ?? "0 / 0 / 0 / 0"} N</dd>
                  <dt>電功率</dt><dd>{(flight.electricalPowerW ?? 0).toFixed(1)} W</dd>
                  <dt>電池</dt><dd>{(flight.batteryRemainingWh ?? cadBatteryCapacityWh).toFixed(2)} Wh · {((flight.batteryStateOfCharge ?? 1) * 100).toFixed(1)}%</dd>
                  <dt>預計續航</dt><dd>{flight.estimatedEnduranceS == null ? "—" : `${(flight.estimatedEnduranceS / 60).toFixed(1)} min`}</dd>
                  <dt>馬達限制</dt><dd>{flight.batteryDepleted ? "電池耗盡" : flight.motorSaturated ? "推力飽和" : "正常"}</dd>
                  <dt>高度保持</dt><dd>{flight.altitudeHoldEnabled ? `目標誤差 ${flight.altitudeErrorM.toFixed(2)} m` : "關閉"}</dd>
                  <dt>目標點導航</dt><dd>{flight.waypointEnabled ? `${flight.waypointCompleted ? "完成" : `第 ${flight.waypointIndex + 1}/${flight.waypointCount} 點`} · 距離 ${flight.waypointDistanceM.toFixed(2)} m` : "關閉"}</dd>
                  <dt>方塊避障</dt><dd>{flight.obstacleAvoidanceEnabled ? (flight.nearestObstacleDistanceM == null ? "未有方塊障礙" : `最近 ${flight.nearestObstacleDistanceM.toFixed(2)} m`) : "關閉"}</dd>
                  <dt>射線避障</dt><dd>{flight.raycastAvoidanceEnabled ? (flight.nearestColliderDistanceM == null ? "前方 3m 無命中" : `命中 ${flight.nearestColliderDistanceM.toFixed(2)} m`) : "關閉"}</dd>
                </dl>
                <p className="physics-lab-note" data-testid="physics-cad-flight-peak">
                  峰值合力：{peakFlightLoad ? `${Math.hypot(...peakFlightLoad.forceWorldN).toFixed(2)} N @ ${peakFlightLoad.atS.toFixed(2)} s` : "尚未量到"}
                </p>
                <button
                  data-testid="physics-transfer-flight-load-to-fea"
                  disabled={!peakFlightLoad}
                  onClick={transferPeakFlightLoadToFea}
                >
                  將峰值飛行載荷載入已選 FEA 面
                </button>
                <button
                  data-testid="physics-transfer-flight-load-auto-cantilever"
                  disabled={!peakFlightLoad}
                  title="明確假設為懸臂：系統以最長軸一端固定、另一端受力。使用前請確認這符合真實夾具。"
                  onClick={transferPeakFlightLoadWithAutoSupport}
                >
                  自動懸臂支撐後載入峰值載荷
                </button>
                {feaTransferNote && <p className="physics-lab-note">{feaTransferNote}</p>}
              </>
            )}
            {(peakImpactLoad || peakFlightLoad || linkedPeakLoadFea) && (
              <section className="physics-lab-fea-link" data-testid="physics-peak-fea">
                <h3>峰值載荷靜態 FEA</h3>
                <button
                  data-testid="physics-run-peak-fea"
                  disabled={!feaFixed || !feaLoad || feaBusy}
                  onClick={runPeakLoadFea}
                  title="將目前已載入的衝擊或飛行峰值力，以靜態等效力運行現有線彈性 FEA。"
                >
                  {feaBusy ? "FEA 計算中…" : "運行峰值載荷 FEA"}
                </button>
                {(!feaFixed || !feaLoad) && (
                  <p className="physics-lab-note">先選擇固定面與受力面；亦可用上方「自動懸臂支撐後載入」建立明確的初步假設。</p>
                )}
                {linkedPeakLoadFea && (
                  <dl className="physics-lab-stats" data-testid="physics-peak-fea-verdict">
                    <dt>材料</dt><dd>{linkedPeakLoadFea.material}</dd>
                    <dt>最大 von Mises 應力</dt><dd>{linkedPeakLoadFea.maxVonMisesMPa.toFixed(2)} MPa</dd>
                    <dt>屈服強度</dt><dd>{linkedPeakLoadFea.yieldStrengthMPa.toFixed(2)} MPa</dd>
                    <dt>安全係數</dt><dd>{linkedPeakLoadFea.safetyFactor == null ? "—" : linkedPeakLoadFea.safetyFactor.toFixed(2)}</dd>
                    <dt>最大位移</dt><dd>{linkedPeakLoadFea.maxDisplacementMm.toFixed(3)} mm</dd>
                    <dt>判定</dt><dd>{linkedPeakLoadFea.verdict}</dd>
                    <dt>收斂</dt><dd>{linkedPeakLoadFea.converged ? "已收斂" : `未完全收斂（殘差 ${linkedPeakLoadFea.residual.toExponential(2)}）`}</dd>
                  </dl>
                )}
                <p className="physics-lab-note">
                  這是把量到的瞬時峰值力作靜態等效的線彈性 FEA；可用作初步強度與變形篩查，不代表瞬態衝擊、塑性變形、破裂或疲勞認證。
                </p>
              </section>
            )}
            {componentStates.length > 0 && (
              <>
                <h3>投入元件讀數</h3>
                <ol className="physics-lab-events">
                  {componentStates.map((c) => (
                    <li key={c.id}>
                      <b>{c.name}</b>
                      <br />P {c.p.map(fmt).join(", ")} m<br />V{" "}
                      {fmt(Math.hypot(...c.v))} m/s
                    </li>
                  ))}
                </ol>
              </>
            )}
            <h3>碰撞事件</h3>
            <ol className="physics-lab-events">
              {collisions.length ? (
                collisions
                  .slice()
                  .reverse()
                  .map((e, i) => (
                    <li key={`${e.at}-${i}`}>
                      <b>{e.at.toFixed(2)}s</b> {e.label}
                      {e.forceN != null && (
                        <span className="physics-lab-force">
                          {" "}· 接觸力 {e.forceN.toFixed(2)} N
                        </span>
                      )}
                    </li>
                  ))
              ) : (
                <li>尚未發生碰撞</li>
              )}
            </ol>
            <p className="physics-lab-note">
              固定 120Hz
              物理步長；同一瀏覽器與參數下可重播。結果只作設計探索，不作安全、飛行或工程認證。
            </p>
          </aside>
        </main>
      </section>
    </div>
  );
}
