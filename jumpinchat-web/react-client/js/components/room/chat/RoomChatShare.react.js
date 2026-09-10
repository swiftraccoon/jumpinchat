/* global window */

import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { addNotification } from '../../../actions/NotificationActions';

const copiedNotification = { color: 'green', message: 'Room link copied!' };
const failedNotification = { color: 'yellow', message: 'Could not copy link' };

class RoomChatShare extends Component {
  static hasShareAPI() {
    return !!window.navigator.share;
  }

  constructor(props) {
    super(props);
    this.link = `jumpin.chat/${props.roomName}`;
    this.handleShare = this.handleShare.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
  }

  handleShare() {
    if (!RoomChatShare.hasShareAPI()) {
      return this.handleCopy();
    }

    const { roomName } = this.props;
    const sharePromise = window.navigator.share({
      title: window.document.title,
      text: `Come and join my chat room: ${roomName}!`,
      url: `https://${this.link}`,
    });

    sharePromise.then(() => addNotification(copiedNotification));

    return sharePromise.catch((err) => {
      console.error({ err });

      if (err.name === 'AbortError') {
        console.log('share aborted');
        return null;
      }

      return addNotification(failedNotification);
    });
  }

  handleCopy() {
    const url = `https://${this.link}`;
    const { clipboard } = window.navigator;

    if (clipboard && typeof clipboard.writeText === 'function') {
      return clipboard.writeText(url)
        .then(() => addNotification(copiedNotification))
        .catch(() => addNotification(failedNotification));
    }

    const { document } = window;
    if (typeof document.execCommand !== 'function') {
      return addNotification(failedNotification);
    }

    // Select the absolute URL for the legacy clipboard API, then restore the
    // displayed link and the user's focus and selection.
    const { input } = this;
    const { value, selectionStart, selectionEnd, selectionDirection } = input;
    const { activeElement } = document;
    let copied = false;
    try {
      input.value = url;
      input.focus({ preventScroll: true });
      input.select();
      copied = document.execCommand('copy');
    } catch (err) {
      copied = false;
    } finally {
      input.value = value;
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection);
      if (activeElement && activeElement !== input && typeof activeElement.focus === 'function') {
        activeElement.focus({ preventScroll: true });
      }
    }

    return addNotification(copied === true ? copiedNotification : failedNotification);
  }

  render() {
    return (
      <div className="chat__Share">
        <input
          className="input chat__ShareInput"
          type="text"
          ref={(e) => { this.input = e; }}
          defaultValue={this.link}
          readOnly="readonly"
        />
        <button
          className="button chat__ShareCopy"
          type="button"
          title="Copy a link to the room to share elsewhere"
          onClick={this.handleShare}
        >
          <i className="fa fa-clipboard" />
        </button>
      </div>
    );
  }
}

RoomChatShare.propTypes = {
  roomName: PropTypes.string,
};

export default RoomChatShare;
