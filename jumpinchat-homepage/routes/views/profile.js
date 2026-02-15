/**
 * Created by Zaccary on 19/03/2017.
 */

import { marked } from 'marked';
import logFactory from '../../utils/logger.js';
import { errors, calMonths } from '../../constants/constants.js';
import { ordinal } from '../../utils/numbers.js';
import { User } from '../../models/index.js';

const log = logFactory({ name: 'login view' });

marked.setOptions({
  sanitize: true,
});

const formatUserInfo = user => Object.assign({}, user, {
  attrs: Object.assign({}, user.attrs, {
    join_date: new Date(user.attrs.join_date).toISOString(),
    last_active: new Date(user.attrs.last_active).toISOString(),
  }),
  profile: Object.assign({}, user.profile, {
    dob: user.profile && user.profile.dob && user.profile.dob.month
      ? `${calMonths[user.profile.dob.month]} ${ordinal(user.profile.dob.day)}`
      : null,
  }),
});

const formatMarkdownBio = (user) => {
  if (user.profile.bio && user.profile.bio.length) {
    return marked(user.profile.bio);
  }

  return '';
};

export default async function profile(req, res) {
  const { locals } = res;

  // locals.section is used to set the currently selected
  // item in the header navigation.
  locals.user = req.user;
  locals.username = req.params.username;
  locals.section = locals.username ? `Profile for ${locals.username}` : 'Your profile';
  locals.errors = null;

  // Init phase
  // IF no username AND not logged in THEN redirect
  if (!locals.username && !locals.user) {
    return res.redirect('/');
  }

  const username = locals.username || locals.user.username;

  try {
    const user = await User
      .findOne({ username })
      .populate('trophies.trophyId')
      .lean();

    if (!user) {
      return res.notfound();
    }

    // re-map the trophy objects contained
    // in the array to fix the nesting produced
    // by populating them via `trophyId`
    locals.trophies = user.trophies
      .sort(t => t.awarded)
      .map(t => Object.assign({
        awarded: t.awarded,
      }, t.trophyId));

    locals.profileUser = formatUserInfo(user);
    locals.profileBio = formatMarkdownBio(locals.profileUser);
  } catch (err) {
    log.fatal({ err }, 'error fetching user');
    return res.status(500).send();
  }

  return res.render('profile');
}
