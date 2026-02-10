import { expect } from 'chai';
import sinon from 'sinon';
import { types } from './trophies.js';
import esmock from 'esmock';
describe('trophyUtils', () => {
  const trophyModel = {
    find: sinon.stub().yields(null, {
      exec: sinon.stub().yields(null),
    }),
  };
  let userUtils;

  const trophies = [
    {
      type: types.TYPE_OCCASION,
      conditions: {
        date: {
          day: 1,
          month: 1,
          year: 2018,
        },
      },
    },
    {
      type: types.TYPE_MEMBER_DURATION,
      conditions: {
        duration: {
          years: 1,
        },
      },
    },
    {
      type: 'foo',
    },
  ];

  async function getController(overrides = {}) {
    const mocks = {
      './trophy.model.js': Object.assign(trophyModel, overrides.trophyModel),
      '../user/user.utils.js': Object.assign(userUtils, overrides.userUtils),
      '../message/utils/metaSendMessage.util.js': sinon.stub().returns(Promise.resolve()),
    };

    return await esmock('./trophy.utils.js', mocks);
  }

  let clock;

  beforeEach(async () => {
    clock = sinon.useFakeTimers({
      now: new Date('2018-01-01T12:00:00.000Z').getTime(),
      toFake: ['Date'],
    });

    userUtils = {
      getUserById: sinon.stub().yields(null, {}),
    };
  });

  afterEach(() => {
    clock.restore();
  });

  describe('checkDateMatchesCondition', () => {
    it('should return true if date and month matches', async () => {
      const { checkDateMatchesCondition } = await getController();

      const condition = {
        date: 1,
        month: 1,
      };

      expect(checkDateMatchesCondition(condition)).to.equal(true);
    });

    it('should return true if date, month and year matches', async () => {
      const { checkDateMatchesCondition } = await getController();

      const condition = {
        date: 1,
        month: 1,
        year: 2018,
      };

      expect(checkDateMatchesCondition(condition)).to.equal(true);
    });

    it('should return false if date does not match', async () => {
      const { checkDateMatchesCondition } = await getController();

      const condition = {
        date: 10,
        month: 1,
      };

      expect(checkDateMatchesCondition(condition)).to.equal(false);
    });

    it('should return false if month does not match', async () => {
      const { checkDateMatchesCondition } = await getController();

      const condition = {
        date: 1,
        month: 10,
      };

      expect(checkDateMatchesCondition(condition)).to.equal(false);
    });

    it('should return false if year does not match', async () => {
      const { checkDateMatchesCondition } = await getController();

      const condition = {
        date: 1,
        month: 1,
        year: 2019,
      };

      expect(checkDateMatchesCondition(condition)).to.equal(false);
    });
  });

  describe('checkMembershipDuration', () => {
    it('should return an array of applicable trophies', async () => {
      const { checkMembershipDuration } = await getController();

      const joinDate = new Date('2016-01-01T00:00:00.000Z');

      expect(checkMembershipDuration(joinDate, trophies)).to.eql([trophies[1]]);
    });
  });

  describe('checkOccasion', () => {
    it('should return occasion matching current date', async () => {
      const { checkOccasion } = await getController();

      expect(checkOccasion(trophies)).to.eql([trophies[0]]);
    });

    it('should return occasion matching current date if in tz range', async () => {
      clock.restore();
      clock = sinon.useFakeTimers({
        now: new Date('2017-12-31T18:00:00.000Z').getTime(),
        toFake: ['Date'],
      });
      const { checkOccasion } = await getController();

      expect(checkOccasion(trophies)).to.eql([trophies[0]]);
    });
  });

  describe('dedupe', () => {
    it('should not remove unique trophies', async () => {
      userUtils = {
        getUserById: sinon.stub().returns(Promise.resolve({
          trophies: [
            {
              trophyId: 'foo',
            },
            {
              trophyId: 'bar',
            },
          ],
          save: sinon.stub().returns(Promise.resolve()),
        })),
      };

      const { dedupe } = await getController({ userUtils });
      const res = await dedupe('foo');
      expect(res).to.eql([
        {
          trophyId: 'foo',
        },
        {
          trophyId: 'bar',
        },
      ]);
    });

    it('should remove duplicate trophies', async () => {
      userUtils = {
        getUserById: sinon.stub().returns(Promise.resolve({
          trophies: [
            {
              trophyId: 'foo',
            },
            {
              trophyId: 'bar',
            },
            {
              trophyId: 'bar',
            },
          ],
          save: sinon.stub().returns(Promise.resolve()),
        })),
      };

      const { dedupe } = await getController({ userUtils });
      const res = await dedupe('foo');
      expect(res).to.eql([
        {
          trophyId: 'foo',
        },
        {
          trophyId: 'bar',
        },
      ]);
    });
  });
});
