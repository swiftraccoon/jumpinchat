import React from 'react';
import PropTypes from 'prop-types';
import { format } from 'date-fns';
import Tooltip from '../../elements/Tooltip.react';

const Timestamp = ({ timestamp }) => {
  const timeObj = new Date(timestamp);
  const displayTimestamp = format(timeObj, 'HH:mm');
  const detailTimestamp = format(timeObj, 'HH:mm:ss');

  return (
    <Tooltip position="left" text={detailTimestamp}>
      <div className="chat__MessageTimestamp">{displayTimestamp}</div>
    </Tooltip>
  );
};

Timestamp.propTypes = {
  timestamp: PropTypes.string.isRequired,
};

export default React.memo(Timestamp);
