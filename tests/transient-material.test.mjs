import test from 'node:test';
import assert from 'node:assert/strict';
import { REDUCED_MATERIALS, initialTransientMaterialState, normalizeLoadDirection, stepTransientMaterial, worldDirectionToLocal } from '../src/simulation/transientMaterial.ts';

const geometry = { lengthM: 0.1, areaM2: 1e-4, effectiveMassKg: 0.5 };

test('reduced transient material model stays finite and returns elastically below yield', () => {
  let state = initialTransientMaterialState();
  for (let i = 0; i < 120; i += 1) state = stepTransientMaterial(state, i < 10 ? 100 : 0, 1 / 120, geometry, REDUCED_MATERIALS.steel);
  assert.ok(Number.isFinite(state.displacementM));
  assert.equal(state.yielded, false);
  assert.equal(state.plasticDisplacementM, 0);
});

test('overload accumulates irreversible plastic strain and reaches bounded damage', () => {
  let state = initialTransientMaterialState();
  for (let i = 0; i < 30; i += 1) state = stepTransientMaterial(state, 2e6, 1 / 120, geometry, REDUCED_MATERIALS.abs);
  assert.equal(state.yielded, true);
  assert.ok(state.plasticStrain > 0);
  assert.ok(state.damage >= 0 && state.damage <= 1);
  assert.ok(Math.abs(state.displacementM) <= REDUCED_MATERIALS.abs.failurePlasticStrain * geometry.lengthM + 0.002);
  assert.ok(Number.isFinite(state.plasticWorkJ));
});

test('contact direction is normalized and selects the dominant CAD-local axis', () => {
  const load = normalizeLoadDirection([10, 1, -2]);
  assert.equal(load.axis, 'x');
  const expected = [10 / Math.sqrt(105), 1 / Math.sqrt(105), -2 / Math.sqrt(105)];
  load.direction.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < 1e-15));
  assert.deepEqual(normalizeLoadDirection([0, 0, 0]), { direction: [0, 1, 0], axis: 'y' });
});

test('transient state preserves the measured local impact direction for rendering and reports', () => {
  const state = stepTransientMaterial(
    initialTransientMaterialState(),
    100,
    1 / 120,
    geometry,
    REDUCED_MATERIALS.steel,
    [0.1, -0.2, 4],
  );
  assert.equal(state.loadAxis, 'z');
  assert.ok(Math.abs(Math.hypot(...state.loadDirectionLocal) - 1) < 1e-12);
  assert.ok(state.loadDirectionLocal[2] > 0.99);
});

test('world contact direction is rotated into CAD-local coordinates', () => {
  const half = Math.sin(Math.PI / 4);
  const local = worldDirectionToLocal([1, 0, 0], { x: 0, y: 0, z: half, w: half });
  assert.ok(Math.abs(local[0]) < 1e-12);
  assert.ok(Math.abs(local[1] + 1) < 1e-12);
  assert.ok(Math.abs(local[2]) < 1e-12);
});

test('reverse plastic loading records signed stress, reversals and dissipated work', () => {
  let state = initialTransientMaterialState();
  for (let i = 0; i < 10; i += 1) {
    state = stepTransientMaterial(state, 4500, 1 / 120, geometry, REDUCED_MATERIALS.abs, [0, 1, 0]);
  }
  const monotonicEquivalent = state.cumulativePlasticStrain;
  for (let i = 0; i < 20; i += 1) {
    state = stepTransientMaterial(state, 4500, 1 / 120, geometry, REDUCED_MATERIALS.abs, [0, -1, 0]);
  }
  assert.ok(state.stressPa < 0, 'opposite-face contact must produce opposite signed axial stress');
  assert.equal(state.loadReversals, 1, 'one persistent reversal must be counted once');
  assert.ok(state.cumulativePlasticStrain > monotonicEquivalent);
  assert.ok(state.plasticWorkJ > 0);
  assert.ok(state.peakForceN >= 4500);
  assert.ok(state.damage >= 0 && state.damage <= 1);
});
