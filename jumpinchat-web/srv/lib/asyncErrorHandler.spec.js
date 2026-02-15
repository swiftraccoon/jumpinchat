import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';

describe('asyncErrorHandler', () => {
  let errorHandler;
  let logErrorStub;
  let req;
  let res;
  let next;
  let statusStub;
  let jsonStub;

  beforeEach(async () => {
    logErrorStub = sinon.stub();
    statusStub = sinon.stub();
    jsonStub = sinon.stub();
    statusStub.returns({ json: jsonStub });

    req = {
      method: 'GET',
      originalUrl: '/api/test',
    };

    res = {
      headersSent: false,
      status: statusStub,
    };

    next = sinon.stub();

    const mod = await esmock('./asyncErrorHandler.js', {
      '../utils/logger.util.js': {
        default: () => ({
          error: logErrorStub,
        }),
      },
    });

    errorHandler = mod.errorHandler;
  });

  it('should return 500 and log error for a generic Error', () => {
    const err = new Error('something broke');

    errorHandler(err, req, res, next);

    expect(logErrorStub.calledOnce).to.equal(true);
    const logArgs = logErrorStub.firstCall.args;
    expect(logArgs[0]).to.have.property('err', err);
    expect(logArgs[0]).to.have.property('method', 'GET');
    expect(logArgs[0]).to.have.property('url', '/api/test');
    expect(logArgs[1]).to.equal('Unhandled error');

    expect(statusStub.calledOnce).to.equal(true);
    expect(statusStub.firstCall.args[0]).to.equal(500);
  });

  it('should return custom status if err.status is set', () => {
    const err = new Error('not found');
    err.status = 404;

    errorHandler(err, req, res, next);

    expect(statusStub.firstCall.args[0]).to.equal(404);
  });

  it('should return custom status if err.statusCode is set', () => {
    const err = new Error('bad request');
    err.statusCode = 400;

    errorHandler(err, req, res, next);

    expect(statusStub.firstCall.args[0]).to.equal(400);
  });

  it('should not leak error message in production', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      // Re-import with production NODE_ENV
      const mod = await esmock('./asyncErrorHandler.js', {
        '../utils/logger.util.js': {
          default: () => ({
            error: logErrorStub,
          }),
        },
      });

      const err = new Error('secret database details');
      mod.errorHandler(err, req, res, next);

      expect(jsonStub.calledOnce).to.equal(true);
      expect(jsonStub.firstCall.args[0]).to.deep.equal({ error: 'Internal server error' });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should show error message in development', async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    try {
      const mod = await esmock('./asyncErrorHandler.js', {
        '../utils/logger.util.js': {
          default: () => ({
            error: logErrorStub,
          }),
        },
      });

      const err = new Error('detailed error info');
      mod.errorHandler(err, req, res, next);

      expect(jsonStub.calledOnce).to.equal(true);
      expect(jsonStub.firstCall.args[0]).to.deep.equal({ error: 'detailed error info' });
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('should call next(err) when headers already sent', () => {
    res.headersSent = true;
    const err = new Error('too late');

    errorHandler(err, req, res, next);

    expect(next.calledOnce).to.equal(true);
    expect(next.firstCall.args[0]).to.equal(err);
    expect(statusStub.called).to.equal(false);
  });

  it('should handle err without message gracefully', () => {
    const err = new Error();

    errorHandler(err, req, res, next);

    expect(statusStub.calledOnce).to.equal(true);
    expect(statusStub.firstCall.args[0]).to.equal(500);
    expect(jsonStub.calledOnce).to.equal(true);
    // Should not throw even with empty message
  });
});
