
import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('ytApiQuery', () => {
  let redisMock;
  let controller;

  beforeEach(async () => {
    redisMock = {
      callPromise: sinon.stub().returns(Promise.resolve('')),
    };
    controller = (await esmock('./getCurrentCred.js', {
      '../../../utils/redis.util.js': redisMock,
      '../../../config/env/index.js': { default: {
        yt: {
          keys: ['foo', 'bar'],
        },
      } },
    })).default;
  });

  afterEach(() => {
  });

  it('should set first key if no key in cache', async () => {
    await controller();
    expect(redisMock.callPromise.calledWith('set', 'ytapikey', 'foo')).to.equal(true);
  });

  it('should use the next key if hasExpired set as true', async () => {
    redisMock = {
      callPromise: sinon.stub().withArgs('get').resolves('foo'),
    };
    controller = (await esmock('./getCurrentCred.js', {
      '../../../utils/redis.util.js': redisMock,
      '../../../config/env/index.js': { default: {
        yt: {
          keys: ['foo', 'bar'],
        },
      } },
    })).default;

    await controller({ hasExpired: true });
    expect(redisMock.callPromise.calledWith('set', 'ytapikey', 'bar')).to.equal(true);
  });

  it('should use the first key if last key is expired', async () => {
    redisMock = {
      callPromise: sinon.stub().withArgs('get').resolves('bar'),
    };
    controller = (await esmock('./getCurrentCred.js', {
      '../../../utils/redis.util.js': redisMock,
      '../../../config/env/index.js': { default: {
        yt: {
          keys: ['foo', 'bar'],
        },
      } },
    })).default;

    await controller({ hasExpired: true });
    expect(redisMock.callPromise.calledWith('set', 'ytapikey', 'foo')).to.equal(true);
  });

  it('should return key from cache if set', async () => {
    redisMock = {
      callPromise: sinon.stub().withArgs('get').resolves('foo'),
    };
    controller = (await esmock('./getCurrentCred.js', {
      '../../../utils/redis.util.js': redisMock,
      '../../../config/env/index.js': { default: {
        yt: {
          keys: ['foo', 'bar'],
        },
      } },
    })).default;

    const key = await controller({ hasExpired: false });
    expect(key).to.equal('foo');
  });
});
