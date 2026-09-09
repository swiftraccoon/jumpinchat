/* global navigator */

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { publish } from '../../utils/CamUtil';
import { setModalError } from '../../actions/ModalActions';
import {
  defaultVideoConstraints,
  getVideoConstraints,
} from '../../constants/MediaConstants';

const MediaSourceError = ({ error }) => console.log({ error }) || (
  <div
    className="mediaSources__Source mediaSources__Source-error"
  >
    <FontAwesomeIcon
      icon={['fas', 'exclamation-circle']}
    />
    <span className="mediaSources__SourceErrorMessage">
      {error}
    </span>
  </div>
);

class MediaSource extends Component {
  static destroyStream(stream) {
    if (!stream) return;
    const tracks = stream.getTracks?.() || [
      ...(stream.getAudioTracks?.() || []), ...(stream.getVideoTracks?.() || []),
    ];
    new Set(tracks).forEach(track => track.stop());
  }

  constructor(props) {
    super(props);
    this.disposed = false;
    this.mediaGeneration = 0;
    this.publish = publish;
    this.setModalError = setModalError;
    this.onSelectDevice = this.onSelectDevice.bind(this);
    this.state = {
      error: null,
    };
  }

  async componentDidMount() {
    // substitue for setTimeout, since this
    // needs a return value as a promise for
    // testing reasons.
    this.streamPromise = this.getUserMedia();
    return Promise.resolve();
  }

  componentDidUpdate(prevProps) {
    const { videoQuality } = this.props;
    const { videoQuality: prevVideoQuality } = prevProps;

    if (videoQuality && videoQuality.id !== prevVideoQuality?.id) {
      this.streamPromise = this.getUserMedia();
    }
  }

  componentWillUnmount() {
    this.disposed = true;
    this.mediaGeneration += 1;
    MediaSource.destroyStream(this.stream);
    this.stream = null;
  }

  onSelectDevice() {
    this.props.onSelectDevice(this.props.device.deviceId, this.props.type);
  }

  async getUserMedia() {
    const { isGold, videoQuality, type, device } = this.props;
    if (type !== 'video' || !this.video) return null;
    const generation = ++this.mediaGeneration;
    MediaSource.destroyStream(this.stream);
    this.stream = null;
    const constraints = isGold ? getVideoConstraints(videoQuality) : defaultVideoConstraints;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { deviceId: { exact: device.deviceId }, ...constraints },
      });
      if (this.disposed || generation !== this.mediaGeneration) {
        MediaSource.destroyStream(stream);
        return null;
      }
      this.stream = stream;
      if (this.video) this.video.srcObject = stream;
      this.setState({ error: null });
      return stream;
    } catch (error) {
      if (this.disposed || generation !== this.mediaGeneration) return null;
      if (['PermissionDeniedError', 'NotAllowedError'].includes(error.name)) {
        this.setModalError({ message: "You don't have permission to use one or more video sources" });
      }
      this.setState({ error: error.message || 'This video source could not be opened.' });
      return null;
    }
  }


  render() {
    const { error } = this.state;
    const { device, type } = this.props;

    if (error) {
      return (
        <div className="mediaSources__SourceWrapper mediaSources__SourceWrapper-error">
          {error && (
            <MediaSourceError error={error} />
          )}
          <span className="mediaSources__SourceLabel">{device.label}</span>
        </div>
      );
    }
    return (
      <button
        type="button"
        className="mediaSources__SourceWrapper"
        title={device.label}
        onClick={this.onSelectDevice}
      >
        {type === 'video' && !device.deviceId && (
          <div
            className="mediaSources__Source mediaSources__Source-audio"
          >
            <i className="fa fa-microphone" aria-hidden="true" />
          </div>
        )}

        {type === 'video' && device.deviceId && (
          <video
            className="mediaSources__Source"
            ref={(e) => { this.video = e; }}
            autoPlay
            playsInline
          />
        )}

        {type === 'audio' && (
          <div
            className="mediaSources__Source mediaSources__Source-audio"
          >
            <i className="fa fa-microphone" aria-hidden="true" />
          </div>
        )}

        {type === 'screen' && (
          <div
            className="mediaSources__Source mediaSources__Source-screen"
          >
            <i className="fa fa-television" aria-hidden="true" />
          </div>
        )}
        <span className="mediaSources__SourceLabel">{device.label}</span>
      </button>
    );
  }
}

MediaSource.defaultProps = {
  device: null,
  isGold: false,
  videoQuality: null,
};

MediaSource.propTypes = {
  device: PropTypes.object,
  onSelectDevice: PropTypes.func.isRequired,
  type: PropTypes.string.isRequired,
  isGold: PropTypes.bool,
  videoQuality: PropTypes.shape({
    label: PropTypes.string,
    id: PropTypes.string,
    dimensions: PropTypes.shape({
      width: PropTypes.number,
      height: PropTypes.number,
    }),
    frameRate: PropTypes.number,
  }),
};

export default MediaSource;
