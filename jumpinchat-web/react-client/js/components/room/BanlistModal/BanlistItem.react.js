/**
 * Created by Zaccary on 28/05/2016.
 */

import React from 'react';
import PropTypes from 'prop-types';
import { format, formatDistanceToNow } from 'date-fns';

const BanListItem = ({ removeLabel, item, onRemove }) => (
  <div className="banlist__Item">
    <div className="banlist__Details">
      <div className="banlist__Handle">
        {item.handle}
        {item.username && (
          <>
            {' '}
            <span className="text-sub">
              {item.username}
            </span>
          </>
        )}
      </div>
      <div
        className="banlist__Timestamp"
        title={format(new Date(item.timestamp), 'EEE, h:mmaaa')}
      >
        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
      </div>
    </div>
    <div className="banlist__Actions">
      <button
        type="button"
        className="button button-blue button-floating banlist__Action"
        onClick={onRemove}
      >
        {removeLabel}
      </button>
    </div>
  </div>
);

BanListItem.propTypes = {
  removeLabel: PropTypes.string.isRequired,
  onRemove: PropTypes.func.isRequired,
  item: PropTypes.shape({
    handle: PropTypes.string.isRequired,
    timestamp: PropTypes.string.isRequired,
    username: PropTypes.string,
  }).isRequired,
};

export default BanListItem;
