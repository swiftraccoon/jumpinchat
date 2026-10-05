/* global navigator */

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { checkCanBroadcast } from '../../../utils/UserAPI';
import { unpublishOwnFeed } from '../../../utils/CamUtil';
import {
  setMediaSelectionModal,
  setMediaSelectionModalLoading,
  setModalError,
} from '../../../actions/ModalActions';

import { setCanBroadcast } from '../../../actions/CamActions';
import { defaultVideoConstraints } from '../../../constants/MediaConstants';
import {
  beginMediaSelection,
  isMediaSelectionCurrent,
  retainSelectionStream,
  cancelMediaSelection,
} from '../../../utils/mediaSelectionCapture';

class RoomBroadcastButton extends Component {
  static removeDuplicates(myArr, prop) {
    return myArr
      .filter((obj, pos, arr) => arr.map(mapObj => mapObj[prop]).indexOf(obj[prop]) === pos);
  }

  static getMediaDevices() {
    return navigator.mediaDevices.enumerateDevices();
  }

  constructor(props) {
    super(props);

    this.unpublishOwnFeed = unpublishOwnFeed;
    this.setMediaSelectionModal = setMediaSelectionModal;
    this.setMediaSelectionModalLoading = setMediaSelectionModalLoading;
    this.setCanBroadcast = setCanBroadcast;
    this.checkCanBroadcast = checkCanBroadcast;

    this._startLocalStream = this._startLocalStream.bind(this);
    this._stopLocalStream = this._stopLocalStream.bind(this);
    this.mediaSupported = navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  }

  componentDidMount() {
    if (!this.mediaSupported) {
      this.setCanBroadcast(false);
    }
  }

  componentWillUnmount() {
    clearTimeout(this.selectionTimer);
    if (this.selection) cancelMediaSelection(this.selection);
  }

  async _startLocalStream() {
    const {
      roomName,
    } = this.props;

    clearTimeout(this.selectionTimer);
    const selection = beginMediaSelection();
    this.selection = selection;
    this.setMediaSelectionModal(true);
    this.setMediaSelectionModalLoading(true, 'Requesting camera and microphone…');
    this.selectionTimer = setTimeout(() => {
      if (!isMediaSelectionCurrent(selection)) return;
      cancelMediaSelection(selection);
      this.setMediaSelectionModalLoading(false);
      setModalError({ message: 'Device access timed out. Close this dialog and try again.' });
    }, 30000);

    try {
      const constraints = { audio: true, video: defaultVideoConstraints };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      // Keep the granted sources alive through selection. The microphone is
      // disabled by the owner, and previews receive video-only streams.
      retainSelectionStream(selection, stream, constraints);
    } catch (err) {
      if (!isMediaSelectionCurrent(selection)) return;
      console.error({ err }, 'failed to get user media');
    }
    if (!isMediaSelectionCurrent(selection)) return;

    this.checkCanBroadcast(roomName, async (err, canBroadcast) => {
      if (!isMediaSelectionCurrent(selection)) return;
      if (err) {
        clearTimeout(this.selectionTimer);
        this.setMediaSelectionModalLoading(false);
        this.setMediaSelectionModal(false);
        return false;
      }

      if (!canBroadcast) {
        clearTimeout(this.selectionTimer);
        this.setMediaSelectionModalLoading(false);
        this.setMediaSelectionModal(false);
        return false;
      }

      try {
        const devices = await RoomBroadcastButton.getMediaDevices();
        if (!isMediaSelectionCurrent(selection)) return;
        clearTimeout(this.selectionTimer);
        this.setMediaSelectionModalLoading(false);
        this.setMediaSelectionModal(true, RoomBroadcastButton.removeDuplicates(devices, 'deviceId'));
      } catch (err) {
        if (!isMediaSelectionCurrent(selection)) return;
        clearTimeout(this.selectionTimer);
        cancelMediaSelection(selection);
        this.setMediaSelectionModalLoading(false);
        setModalError(err);
      }
    });
  }

  _stopLocalStream() {
    this.unpublishOwnFeed();
    this.setCanBroadcast(false);

    setTimeout(() => {
      this.setCanBroadcast(true);
    }, 2000);
  }

  render() {
    const {
      localStream,
      canBroadcast,
      feedCount,
    } = this.props;

    const startMessage = feedCount < 12
      ? 'Start Broadcasting'
      : 'Broadcast Slots Full';

    if (!localStream) {
      return (
        <button
          className="cams__Action button button-floating button-blue"
          onClick={this._startLocalStream}
          disabled={!canBroadcast || feedCount === 12}
        >
          <FontAwesomeIcon
            icon={['fas', 'video']}
          />
          <span className="mobileHidden">
            &nbsp;{startMessage}
          </span>
        </button>
      );
    }

    return (
      <button
        className="cams__Action button button-floating button-default"
        onClick={this._stopLocalStream}
        disabled={!canBroadcast}
      >
        <FontAwesomeIcon
          icon={['fas', 'video-slash']}
        />
        &nbsp;
        <span className="mobileHidden">
          &nbsp;Stop Broadcasting
        </span>
      </button>
    );
  }
}

RoomBroadcastButton.propTypes = {
  canBroadcast: PropTypes.bool,
  localStream: PropTypes.object,
  feedCount: PropTypes.number.isRequired,
  roomName: PropTypes.string.isRequired,
};

RoomBroadcastButton.defaultProps = {
  canBroadcast: false,
  localStream: null,
};

export default RoomBroadcastButton;
