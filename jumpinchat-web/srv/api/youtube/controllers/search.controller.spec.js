
/* global describe,it,beforeEach,after */

import { expect } from 'chai';
import sinon from 'sinon';
import logFactory from '../../../utils/logger.util.js';
import esmock from 'esmock';
const log = logFactory({ name: 'search.controller.spec' });
const sandbox = sinon.createSandbox();

describe('youtube search controller', () => {
  let SearchYoutube;
  let searchYoutube;
  beforeEach(async () => {
    SearchYoutube = await esmock('./search.controller.js', {
      '../../room/room.utils.js': {},
      '../../../lib/redis.util.js': () => ({ hSet: sinon.stub().resolves() }),
      '../../../utils/utils.js': {
        encodeUriParams: () => 'foo',
      },
      './playVideo.controller.js': {
        saveVideoInfoToCache: sinon.stub().yields(),
      },
      '../utils/ytApiQuery.js': sinon.stub().resolves([]),
      '../utils/getCurrentCred.js': sinon.stub().resolves('mock-api-key'),
    });

    searchYoutube = new SearchYoutube();

    searchYoutube.redis = {
      get: sandbox.stub().resolves(),
      set: sandbox.stub().resolves(),
      expire: sandbox.stub().resolves(),
    };
  });

  describe('fetchVideoIdFromUrl', () => {
    it('should extract ID from video URL', () => {
      expect(SearchYoutube.fetchVideoIdFromUrl('https://youtube.com/watch?v=dQw4w9WgXcQ'))
        .to.equal('dQw4w9WgXcQ');

      expect(SearchYoutube.fetchVideoIdFromUrl('https://youtu.be/dQw4w9WgXcQ'))
        .to.equal('dQw4w9WgXcQ');
    });

    it('should return query if no match', () => {
      expect(SearchYoutube.fetchVideoIdFromUrl('foo bar baz'))
        .to.equal('foo bar baz');
    });
  });

  describe('checkCache', () => {
    it('should get redis entry by hash', (done) => {
      searchYoutube.checkCache('foo', () => {
        expect(searchYoutube.redis.get.firstCall.args[0]).to.equal('yt_search:foo');
        done();
      });
    });
  });

  describe('saveSearchInCache', () => {
    it('should set json string in redis with has as key', (done) => {
      const hash = 'foo';
      const data = { foo: 'bar' };
      searchYoutube.saveSearchInCache(hash, data, () => {
        expect(searchYoutube.redis.set.firstCall.args[0]).to.equal(`yt_search:${hash}`);
        expect(searchYoutube.redis.set.firstCall.args[1]).to.equal('{"foo":"bar"}');
        done();
      });
    });

    it('should set cache entry to expire', (done) => {
      const hash = 'foo';
      const data = { foo: 'bar' };
      searchYoutube.saveSearchInCache(hash, data, () => {
        expect(searchYoutube.redis.expire.firstCall.args[0]).to.equal(`yt_search:${hash}`);
        expect(searchYoutube.redis.expire.firstCall.args[1]).to.equal(searchYoutube.cacheExpire);
        done();
      });
    });
  });

  describe('encodeUrlParams', () => {
    it('should create url params', () => {
      const params = SearchYoutube.encodeUrlParams({ foo: 'bar', bar: 'baz' });
      expect(params).to.equal('foo=bar&bar=baz');
    });
  });
});
