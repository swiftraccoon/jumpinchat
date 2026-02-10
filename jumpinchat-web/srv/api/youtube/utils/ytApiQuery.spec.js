
import { expect } from 'chai';
import sinon from 'sinon';
import esmock from 'esmock';
describe('ytApiQuery', () => {
  let axiosStub;
  let controller;

  beforeEach(async () => {
    axiosStub = sinon.stub().resolves({ status: 200, data: { items: [] } });
    controller = (await esmock('./ytApiQuery.js', {
      'axios': { default: axiosStub },
      './getCurrentCred.js': { default: () => Promise.resolve('foo') },
    })).default;
  });

  afterEach(() => {
  });

  it('it should call api with correct key', async () => {
    try {
      await controller('http://api', {});
    } catch (err) {
      throw err;
    }

    expect(axiosStub.firstCall.args[0].method).to.equal('GET');
    expect(axiosStub.firstCall.args[0].url).to.equal('http://api?key=foo');
  });

  it('should reject with provider error if yt quota error', async () => {
    axiosStub = sinon.stub().resolves({
      status: 429,
      data: {
        error: {
          errors: [{
            reason: 'dailyLimitExceeded',
          }],
        },
      },
    });

    controller = (await esmock('./ytApiQuery.js', {
      'axios': { default: axiosStub },
      './getCurrentCred.js': { default: () => Promise.resolve('foo') },
    })).default;

    try {
      await controller('foo', {});
      throw new Error('no error happened');
    } catch (err) {
      expect(err.name).to.equal('ExternalProviderError');
    }
  });

  it('should resolve with item array', async () => {
    try {
      const result = await controller('http://api', {});
      expect(result).to.eql([]);
    } catch (err) {
      throw err;
    }
  });
});
