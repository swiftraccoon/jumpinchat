import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('safeSocketHandler', () => {
  let safeHandler;
  let logErrorStub;

  beforeEach(async () => {
    logErrorStub = sinon.stub();

    const mod = await esmock('./safeSocketHandler.js', {
      '../utils/logger.util.js': {
        default: () => ({
          error: logErrorStub,
        }),
      },
    });

    safeHandler = mod.safeHandler;
  });

  it('should call the wrapped handler with all passed arguments', async () => {
    const handler = sinon.stub();
    const wrapped = safeHandler(handler, 'test:event');

    await wrapped('arg1', 'arg2', 'arg3');

    expect(handler.calledOnce).to.equal(true);
    expect(handler.firstCall.args).to.deep.equal(['arg1', 'arg2', 'arg3']);
  });

  it('should return the result from the handler', async () => {
    const handler = sinon.stub().returns('some-result');
    const wrapped = safeHandler(handler, 'test:event');

    const result = await wrapped();

    expect(result).to.equal('some-result');
  });

  it('should catch sync errors without crashing', async () => {
    const handler = sinon.stub().throws(new Error('sync boom'));
    const wrapped = safeHandler(handler, 'room:join');

    // Should not throw
    await wrapped();

    expect(logErrorStub.calledOnce).to.equal(true);
  });

  it('should catch async (rejected promise) errors without crashing', async () => {
    const handler = sinon.stub().rejects(new Error('async boom'));
    const wrapped = safeHandler(handler, 'room:leave');

    // Should not throw
    await wrapped();

    expect(logErrorStub.calledOnce).to.equal(true);
  });

  it('should log errors with the event name via bunyan', async () => {
    const err = new Error('handler failed');
    const handler = sinon.stub().throws(err);
    const wrapped = safeHandler(handler, 'chat:message');

    await wrapped();

    expect(logErrorStub.calledOnce).to.equal(true);
    const logArgs = logErrorStub.firstCall.args;
    expect(logArgs[0]).to.have.property('err', err);
    expect(logArgs[0]).to.have.property('event', 'chat:message');
    expect(logArgs[1]).to.equal('Socket handler error');
  });
});
