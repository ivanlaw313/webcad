import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepGroundVehicleController } from '../src/simulation/groundVehicle.ts'

const base = {
  massKg: 10,
  gravityMps2: 9.81,
  friction: 0.7,
  velocityMps: [0, 0, 0],
  forwardWorld: [1, 0, 0],
  yawRateRadS: 0,
  targetSpeedMps: 5,
  maxDriveForceN: 80,
  maxBrakeForceN: 120,
  maxSteeringTorqueNm: 40,
  steeringDeg: 0,
  targetDirectionWorld: null,
  grounded: true,
}

test('ground vehicle drive and brake commands are bounded and directional', () => {
  const accelerate = stepGroundVehicleController(base)
  assert.deepEqual(accelerate.forceWorldN, [80, 0, 0])
  assert.equal(accelerate.driveForceN, 80)
  assert.equal(accelerate.speedErrorMps, 5)

  const brake = stepGroundVehicleController({ ...base, velocityMps: [12, 0, 0] })
  assert.equal(brake.driveForceN, -120)
  assert.deepEqual(brake.forceWorldN, [-120, 0, 0])
  assert.equal(brake.mechanicalPowerW, 1440)
})

test('lateral tyre force opposes side-slip and obeys the friction limit', () => {
  const result = stepGroundVehicleController({
    ...base,
    targetSpeedMps: 0,
    velocityMps: [0, 0, 20],
  })
  assert.equal(result.lateralSpeedMps, 20)
  assert.ok(Math.abs(result.lateralForceN + 0.7 * 10 * 9.81) < 1e-9)
  assert.ok(result.forceWorldN[2] < 0)
})

test('manual and waypoint steering produce bounded yaw torque', () => {
  const manual = stepGroundVehicleController({ ...base, steeringDeg: 30 })
  assert.ok(Math.abs(manual.headingErrorDeg - 30) < 1e-9)
  assert.ok(manual.steeringTorqueNm > 0)
  assert.equal(manual.torqueWorldNm[1], -manual.steeringTorqueNm)

  const waypoint = stepGroundVehicleController({
    ...base,
    steeringDeg: -30,
    targetDirectionWorld: [0, 0, 1],
  })
  assert.ok(Math.abs(waypoint.headingErrorDeg - 90) < 1e-9)
  assert.equal(waypoint.steeringTorqueNm, 40)

  const dampPositiveYaw = stepGroundVehicleController({
    ...base,
    yawRateRadS: 0.5,
  })
  assert.ok(dampPositiveYaw.torqueWorldNm[1] < 0, 'positive yaw must receive negative damping torque')

  const dampNegativeYaw = stepGroundVehicleController({
    ...base,
    yawRateRadS: -0.5,
  })
  assert.ok(dampNegativeYaw.torqueWorldNm[1] > 0, 'negative yaw must receive positive damping torque')
})

test('airborne CAD bodies receive no tyre force or steering torque', () => {
  const airborne = stepGroundVehicleController({
    ...base,
    velocityMps: [3, -2, 4],
    steeringDeg: 25,
    grounded: false,
  })
  assert.deepEqual(airborne.forceWorldN, [0, 0, 0])
  assert.deepEqual(airborne.torqueWorldNm, [0, 0, 0])
  assert.equal(airborne.grounded, false)
})

test('malformed numeric inputs never inject NaN into the physics engine', () => {
  const result = stepGroundVehicleController({
    ...base,
    massKg: Number.NaN,
    velocityMps: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    forwardWorld: [0, 0, 0],
    yawRateRadS: Number.NaN,
    targetSpeedMps: Number.NaN,
  })
  for (const value of [
    ...result.forceWorldN,
    ...result.torqueWorldNm,
    result.forwardSpeedMps,
    result.lateralSpeedMps,
    result.driveForceN,
    result.steeringTorqueNm,
  ]) assert.ok(Number.isFinite(value))
})
