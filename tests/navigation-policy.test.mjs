import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultNavigationPolicy, scoreNavigationPolicy, trainNavigationPolicy } from '../src/simulation/navigationPolicy.ts';

const route = [{ x: 4, z: 0 }, { x: 4, z: 4 }];
const obstacles = [{ x: 2, z: 0, radius: 0.55 }];

test('navigation policy training is deterministic and never regresses its scored baseline', () => {
  const first = trainNavigationPolicy(route, obstacles, { seed: 123, generations: 5, candidates: 32 });
  const second = trainNavigationPolicy(route, obstacles, { seed: 123, generations: 5, candidates: 32 });
  assert.deepEqual(first, second);
  assert.ok(first.trainedScore >= first.baselineScore);
  assert.ok(Number.isFinite(scoreNavigationPolicy(first.policy, route, obstacles)));
});

test('empty routes are rejected by the scorer instead of fabricating success', () => {
  assert.equal(scoreNavigationPolicy(defaultNavigationPolicy(), [], obstacles), -Infinity);
});
