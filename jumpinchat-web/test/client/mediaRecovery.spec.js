import { expect } from 'chai';
import sinon from 'sinon';
import createMediaRecovery from '../../react-client/js/utils/mediaRecovery.js';

describe('media recovery', () => {
  let clock;
  let recovery;
  let failure;
  beforeEach(() => {
    clock = sinon.useFakeTimers();
    failure = sinon.spy();
    recovery = createMediaRecovery({ onStart() {}, onFailure: failure });
  });
  afterEach(() => clock.restore());

  it('allows a different recovery operation after success', () => {
    const reconnect = sinon.spy(success => success());
    const restart = sinon.spy(success => success());
    recovery.start(reconnect, () => {});
    clock.tick(2000);
    recovery.start(restart, () => {});
    clock.tick(2000);
    expect(reconnect.calledOnce).to.equal(true);
    expect(restart.calledOnce).to.equal(true);
  });

  it('coalesces repeated outage events and stops after five failures', () => {
    const operation = sinon.spy((success, error) => error());
    recovery.start(operation, () => {});
    recovery.start(operation, () => {});
    clock.tick(10000);
    expect(operation.callCount).to.equal(5);
    expect(failure.calledOnce).to.equal(true);
    clock.tick(10000);
    expect(operation.callCount).to.equal(5);
  });

  it('bounds attempts even if Janus never calls back', () => {
    const operation = sinon.spy();
    recovery.start(operation, () => {});
    clock.tick(60000);
    expect(operation.callCount).to.equal(5);
    expect(failure.calledOnce).to.equal(true);
  });

  it('cancels a pending retry on exit', () => {
    const operation = sinon.spy();
    recovery.start(operation, () => {});
    recovery.cancel();
    clock.tick(60000);
    expect(operation.called).to.equal(false);
    expect(failure.called).to.equal(false);
  });

  it('ignores callbacks from an in-flight attempt after exit', () => {
    let callbacks;
    const success = sinon.spy();
    recovery.start((...args) => { callbacks = args; }, success);
    clock.tick(2000);
    recovery.cancel();
    callbacks[0]();
    callbacks[1]();
    clock.tick(60000);
    expect(success.called).to.equal(false);
    expect(failure.called).to.equal(false);
  });
});
