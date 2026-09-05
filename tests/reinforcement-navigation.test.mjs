import test from 'node:test';
import assert from 'node:assert/strict';
import { chooseRlAction, encodeRlObservation, rlActionControl, trainTabularNavigationPolicy } from '../src/simulation/reinforcementNavigation.ts';

test('RL observation encoding covers 24 deterministic states', () => {
  const states = new Set();
  for (const headingErrorRad of [-1, 0, 1]) for (let bits = 0; bits < 8; bits += 1) {
    states.add(encodeRlObservation({ headingErrorRad, blockedLeft: !!(bits & 1), blockedCenter: !!(bits & 2), blockedRight: !!(bits & 4) }));
  }
  assert.equal(states.size, 24);
  assert.deepEqual([...states].sort((a, b) => a - b), Array.from({ length: 24 }, (_, index) => index));
});

test('tabular Q-learning is reproducible and learns a useful episodic policy', () => {
  const first = trainTabularNavigationPolicy({ episodes: 1200, seed: 42 });
  const second = trainTabularNavigationPolicy({ episodes: 1200, seed: 42 });
  assert.deepEqual(first.q, second.q);
  assert.equal(first.algorithm, 'tabular-q-learning');
  assert.equal(first.q.length, 96);
  assert.ok(first.q.some((value) => Math.abs(value) > 1e-6));
  assert.ok(first.evaluationSuccessRate >= 0.45, `success=${first.evaluationSuccessRate}`);
  assert.ok(Number.isFinite(first.evaluationRewardMean));
});

test('learned policy produces bounded runtime controls', () => {
  const policy = trainTabularNavigationPolicy({ episodes: 400, seed: 7 });
  const action = chooseRlAction(policy, { headingErrorRad: 0.4, blockedLeft: false, blockedCenter: true, blockedRight: false });
  assert.ok(policy.actions.includes(action));
  const control = rlActionControl(action);
  assert.ok(control.steeringDeg >= -60 && control.steeringDeg <= 60);
  assert.ok(control.speedScale >= 0 && control.speedScale <= 1);
});
