import React, { Fragment } from 'react';
import PropTypes from 'prop-types';
import { formatRelative } from 'date-fns';

const ProfileInfo = ({ profile = {} }) => {
  const name = profile.username || profile.handle;
  const userType = profile.userType || 'guest user';
  return (
    <div className="profile__Info">
      {name} is a <strong>{userType}</strong>
      {profile.joinDate && (
        <Fragment>
          {' '}
          who joined {formatRelative(new Date(profile.joinDate), new Date())} and
          was last seen {formatRelative(new Date(profile.lastSeen), new Date())}
        </Fragment>
      )}
    </div>
  );
};

ProfileInfo.propTypes = {
  profile: PropTypes.shape({
    userType: PropTypes.string,
    userId: PropTypes.string,
    handle: PropTypes.string.isRequired,
    username: PropTypes.string,
    joinDate: PropTypes.string,
    lastSeen: PropTypes.string,
  }),
};

export default ProfileInfo;
