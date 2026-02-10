
import * as chai from 'chai';
import sinon from 'sinon';
import chaiAsPromised from 'chai-as-promised';
import config from '../../../config/env/index.js';
import esmock from 'esmock';
chai.use(chaiAsPromised);
const { expect } = chai;

describe('selectJanusServer', () => {
  let controller;

  beforeEach(async () => {
    const avgVals = {
      [config.janus.serverIds[0]]: { average: 5, total: 10 },
      [config.janus.serverIds[1]]: { average: 10, total: 20 },
      [config.janus.serverIds[2]]: { average: 20, total: 30 },
      [config.janus.serverIds[3]]: { average: 20, total: 100 },
    };

    controller = (await esmock('./selectJanusServer.js', {
      './getAvgUsersInRoom.js': { default: server => Promise.resolve(avgVals[server]) },
    })).default;
  });

  it('should pick server with lowest user average', async () => {
    let val;
    try {
      val = await controller();
    } catch (err) {
      throw err;
    }

    expect(val).to.equal(config.janus.serverIds[0]);
  });

  it('should work when some values are zero', async () => {
    const avgVals = {
      [config.janus.serverIds[0]]: { average: 5, total: 10 },
      [config.janus.serverIds[1]]: { average: 10, total: 20 },
      [config.janus.serverIds[2]]: { average: 0, total: 0 },
      [config.janus.serverIds[3]]: { average: 0, total: 0 },
    };

    controller = (await esmock('./selectJanusServer.js', {
      './getAvgUsersInRoom.js': { default: server => Promise.resolve(avgVals[server]) },
    })).default;

    let val;
    try {
      val = await controller();
    } catch (err) {
      throw err;
    }

    expect(val).to.equal('janus3');
  });
});
