import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepRobotStability, terrainTileHeightM } from '../src/simulation/robotTerrain.ts'

test('terrain is deterministic, bounded and varies by tile', () => {
  const a = terrainTileHeightM(2, 3, 0.4, 9)
  assert.equal(a, terrainTileHeightM(2, 3, 0.4, 9))
  assert.ok(a >= 0 && a <= 0.4)
  assert.notEqual(a, terrainTileHeightM(2, 4, 0.4, 9))
})

test('upright and tipped robot stability is measured from quaternion', () => {
  const previous = { fallenDurationS: 0, maxTiltDeg: 0, fallCount: 0, wasFallen: false }
  const upright = stepRobotStability({ previous, rotation: { x: 0, y: 0, z: 0, w: 1 }, centerHeightM: 0.5, velocityMps: [1, 0, 0], minimumCenterHeightM: 0.1, fallTiltDeg: 60, dtS: 1 / 120 })
  assert.equal(upright.fallen, false)
  assert.equal(upright.tiltDeg, 0)
  const tipped = stepRobotStability({ previous: upright, rotation: { x: Math.sin(Math.PI / 4), y: 0, z: 0, w: Math.cos(Math.PI / 4) }, centerHeightM: 0.5, velocityMps: [0, 0, 0], minimumCenterHeightM: 0.1, fallTiltDeg: 60, dtS: 0.1 })
  assert.equal(tipped.fallen, true)
  assert.equal(tipped.fallCount, 1)
  assert.ok(tipped.tiltDeg > 89)
})

test('low center and malformed velocity never produce invalid telemetry', () => {
  const out = stepRobotStability({ previous: { fallenDurationS: 0, maxTiltDeg: 0, fallCount: 0, wasFallen: false }, rotation: { x: NaN, y: 0, z: 0, w: NaN }, centerHeightM: 0.01, velocityMps: [NaN, 0, Infinity], minimumCenterHeightM: 0.1, fallTiltDeg: 60, dtS: NaN })
  assert.equal(out.fallen, true)
  assert.ok([out.uprightDot, out.tiltDeg, out.horizontalSpeedMps].every(Number.isFinite))
})
