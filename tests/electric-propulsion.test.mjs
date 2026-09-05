import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepElectricPropulsion } from '../src/simulation/electricPropulsion.ts'

const base = {
  previous: { rotorThrustN: [0, 0, 0, 0], remainingWh: 100 },
  targetRotorThrustN: [10, 10, 10, 10], dtS: 1 / 120,
  motorTimeConstantS: 0.08, maxRotorThrustN: 20, batteryCapacityWh: 100,
  electricalEfficiency: 0.82, rotorDiskAreaM2: 0.05,
  airDensityKgM3: 1.225, avionicsPowerW: 8,
}

test('motors spool up and loaded battery loses finite energy', () => {
  const first = stepElectricPropulsion(base)
  assert.ok(first.rotorThrustN.every((value) => value > 0 && value < 10))
  assert.ok(first.electricalPowerW > first.inducedMechanicalPowerW && first.remainingWh < 100)
  assert.ok(first.stateOfCharge > 0 && first.stateOfCharge < 1)
  const second = stepElectricPropulsion({ ...base, previous: first })
  assert.ok(second.rotorThrustN.every((value, index) => value > first.rotorThrustN[index]))
})

test('empty battery spools rotors down and malformed input stays finite', () => {
  const empty = stepElectricPropulsion({ ...base, previous: { rotorThrustN: [5, 5, 5, 5], remainingWh: 0 } })
  assert.equal(empty.depleted, true)
  assert.ok(empty.rotorThrustN.every((value) => value < 5))
  const malformed = stepElectricPropulsion({ ...base, targetRotorThrustN: [NaN, Infinity, -Infinity, NaN], dtS: NaN })
  assert.ok([...malformed.rotorThrustN, malformed.electricalPowerW, malformed.remainingWh].every(Number.isFinite))
})
