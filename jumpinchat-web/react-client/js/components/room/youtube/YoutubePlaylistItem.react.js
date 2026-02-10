import React from 'react';
import PropTypes from 'prop-types';
import { formatDistanceToNow } from 'date-fns';
import formatDuration from '../../../utils/formatDuration';
import YoutubePlaylistItemOptions, {
  playlistItemActions,
} from './YoutubePlaylistItemOptions.react';

const YoutubePlaylistItem = ({
  item,
  onDelete,
}) => {
  let { startedBy } = item;

  if (!startedBy) {
    startedBy = {
      username: null,
      pic: 'user-avatar/avatar-blank.png',
    };
  }

  return (
    <div className="youtube__PlaylistItem">
      <div className="youtube__PlaylistItemThumbWrapper">
        <img
          className="youtube__PlaylistItemThumb"
          src={item.thumb}
          alt={item.title}
        />
      </div>
      <div className="youtube__PlaylistItemDetails">
        <span className="youtube__PlaylistItemTitle">
          {item.title}
        </span>
        <span className="text-sub youtube__PlaylistItemDuration">
          <img
            className="youtube__PlaylistItemAvatar"
            src={startedBy.pic}
            alt={startedBy.username}
          />
          <span className="youtube__PlaylistItemStartedBy">
            {startedBy.username}
          </span>
        &nbsp;&bull;&nbsp;
          {formatDuration(item.duration)}
        &nbsp;&bull;&nbsp;
          {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
        </span>
      </div>
      <div className="youtube__PlaylistItemActions">
        <YoutubePlaylistItemOptions
          id={item._id}
          open={item.optionsOpen || false}
          onSelectAction={(action, id) => {
            switch (action) {
              case playlistItemActions.ITEM_REMOVE:
                onDelete(id);
                break;
              default:
                break;
            }
          }}
        />
      </div>
    </div>
  );
};

YoutubePlaylistItem.propTypes = {
  item: PropTypes.shape({
    _id: PropTypes.string.isRequired,
    mediaType: PropTypes.string.isRequired,
    createdAt: PropTypes.string.isRequired,
    startedBy: PropTypes.shape({
      username: PropTypes.string.isRequired,
      pic: PropTypes.string.isRequired,
    }).isRequired,
    duration: PropTypes.number.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    channelId: PropTypes.string.isRequired,
    link: PropTypes.string.isRequired,
    thumb: PropTypes.string.isRequired,
    optionsOpen: PropTypes.bool,
  }).isRequired,
  onDelete: PropTypes.func.isRequired,
};

export default YoutubePlaylistItem;
