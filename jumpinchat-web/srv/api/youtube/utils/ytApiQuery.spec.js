const { expect } = require('chai');
const sinon = require('sinon');
const mock = require('mock-require');

describe('ytApiQuery', () => {
  let axiosStub;
  const getController = () => mock.reRequire('./ytApiQuery');
  beforeEach(() => {
    axiosStub = sinon.stub().resolves({ status: 200, data: { items: [] } });
    mock('axios', axiosStub);
    mock('./getCurrentCred', () => Promise.resolve('foo'));
  });

  afterEach(() => {
    mock.stopAll();
  });

  it('it should call api with correct key', async () => {
    const controller = getController();

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

    mock('axios', axiosStub);
    const controller = getController();

    try {
      await controller('foo', {});
      throw new Error('no error happened');
    } catch (err) {
      expect(err.name).to.equal('ExternalProviderError');
    }
  });

  it('should resolve with item array', async () => {
    const controller = getController();

    try {
      const result = await controller('http://api', {});
      expect(result).to.eql([]);
    } catch (err) {
      throw err;
    }
  });
});
