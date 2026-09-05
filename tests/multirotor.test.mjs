import assert from 'node:assert/strict'
import { test } from 'node:test'
import { allocateQuadrotor } from '../src/simulation/multirotor.ts'

const base = {
  collectiveThrustN: 40,
  bodyTorqueNm: [0, 0, 0],
  armM: 0.25,
  yawTorquePerThrustM: 0.02,
  maxRotorThrustN: 30,
}

test('hover command divides collective thrust equally', () => {
  const result = allocateQuadrotor(base)
  assert.deepEqual(result.rotorThrustN, [10, 10, 10, 10])
  assert.equal(result.achievedCollectiveThrustN, 40)
  assert.deepEqual(result.achievedBodyTorqueNm, [0, 0, 0])
  assert.equal(result.saturated, false)
})

test('quad allocation reproduces roll pitch and yaw wrench', () => {
  const requested = [1.5, 0.08, -1]
  const result = allocateQuadrotor({ ...base, bodyTorqueNm: requested })
  requested.forEach((value, index) => assert.ok(Math.abs(result.achievedBodyTorqueNm[index] - value) < 1e-9))
})

test('motor limits report saturation and return only the achievable wrench', () => {
  const result = allocateQuadrotor({
    ...base,
    collectiveThrustN: 200,
    bodyTorqueNm: [100, 20, -100],
  })
  assert.equal(result.saturated, true)
  assert.ok(result.rotorThrustN.every((value) => value >= 0 && value <= 30))
  assert.equal(result.achievedCollectiveThrustN, result.rotorThrustN.reduce((sum, value) => sum + value, 0))
  assert.ok(result.achievedBodyTorqueNm.every(Number.isFinite))
})

test('malformed inputs never emit NaN', () => {
  const result = allocateQuadrotor({
    collectiveThrustN: Number.NaN,
    bodyTorqueNm: [Number.NaN, Infinity, -Infinity],
    armM: Number.NaN,
    yawTorquePerThrustM: 0,
    maxRotorThrustN: Number.NaN,
  })
  assert.ok(result.rotorThrustN.every(Number.isFinite))
  assert.ok(result.achievedBodyTorqueNm.every(Number.isFinite))
})
