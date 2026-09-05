import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepJointActuator } from '../src/simulation/jointActuator.ts'

const base = { mode: 'revolute', targetVelocity: 2, measuredVelocity: 1, position: 0, minPosition: -1, maxPosition: 1, maxEffort: 5, velocityGain: 3, efficiency: 0.75 }

test('joint servo estimates bounded effort and electrical power', () => {
  const out = stepJointActuator(base)
  assert.equal(out.commandedVelocity, 2)
  assert.equal(out.estimatedEffort, 3)
  assert.equal(out.mechanicalPowerW, 3)
  assert.equal(out.electricalPowerW, 4)
})

test('joint limits block only outward commands', () => {
  assert.equal(stepJointActuator({ ...base, position: 1, targetVelocity: 2 }).commandedVelocity, 0)
  assert.equal(stepJointActuator({ ...base, position: 1, targetVelocity: -2 }).commandedVelocity, -2)
  assert.equal(stepJointActuator({ ...base, position: -1, targetVelocity: -2 }).commandedVelocity, 0)
})

test('loaded motionless actuator reports stall without NaN', () => {
  const out = stepJointActuator({ ...base, measuredVelocity: 0, targetVelocity: 10, maxEffort: 2, velocityGain: 10 })
  assert.equal(out.stalled, true)
  assert.ok(Object.values(out).filter((value) => typeof value === 'number').every(Number.isFinite))
})
