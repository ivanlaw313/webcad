import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRosTwist, rosAdvertise, rosPublishSimulationState, rosSubscribe } from '../src/simulation/rosBridge.ts';

test('rosbridge handshake uses standard ROS 2 message type names', () => {
  assert.deepEqual(rosSubscribe(), { op: 'subscribe', topic: '/webcad/cmd_vel', type: 'geometry_msgs/msg/Twist', queue_length: 1 });
  assert.deepEqual(rosAdvertise(), { op: 'advertise', topic: '/webcad/simulation_state', type: 'std_msgs/msg/String' });
});

test('cmd_vel parsing validates envelope and clamps unsafe commands', () => {
  assert.equal(parseRosTwist('{bad json'), null);
  assert.equal(parseRosTwist({ op: 'publish', topic: '/wrong', msg: {} }), null);
  assert.deepEqual(parseRosTwist(JSON.stringify({
    op: 'publish', topic: '/webcad/cmd_vel',
    msg: { linear: { x: 500 }, angular: { z: -9 } },
  })), { linearMps: 60, angularRadS: -4 });
});

test('simulation state publisher removes non-finite values from the wire payload', () => {
  const message = rosPublishSimulationState({
    simulationTimeS: 2.5,
    positionM: [1, Number.NaN, 3], velocityMps: [4, 5, Number.POSITIVE_INFINITY],
    targetSpeedMps: 6, forwardSpeedMps: 5.5, steeringDeg: -12, grounded: true,
  });
  assert.equal(message.op, 'publish');
  const payload = JSON.parse(message.msg.data);
  assert.deepEqual(payload.positionM, [1, 0, 3]);
  assert.deepEqual(payload.velocityMps, [4, 5, 0]);
  assert.equal(payload.grounded, true);
});
