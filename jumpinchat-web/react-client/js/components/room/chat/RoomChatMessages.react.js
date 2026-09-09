import React, { Component, Fragment } from 'react';
import PropTypes from 'prop-types';
import RoomChatMessage from './RoomChatMessage.react';
import ScrollResume from '../../elements/ScrollResume.react';
import { ScrollAreaContext } from '../../elements/ScrollArea.react';

class RoomChatMessages extends Component {
  constructor(props) {
    super(props);
    this.handleResumeScroll = this.handleResumeScroll.bind(this);
  }

  componentDidMount() {
    this.scrollTimer = setTimeout(() => {
      this.context.scrollBottom();
    });
  }

  componentDidUpdate(prevProps) {
    const { messages, fixScroll } = this.props;
    const oldMessages = prevProps.messages.map(m => m.id).join('');
    const newMessages = messages.map(m => m.id).join('');
    const hasNewMessages = oldMessages !== newMessages;

    if (hasNewMessages && !fixScroll) {
      this.scrollTimer = setTimeout(() => {
        this.context.scrollBottom();
      });
    }
  }

  componentWillUnmount() {
    clearTimeout(this.scrollTimer);
  }

  handleResumeScroll() {
    const { setScrollFixed } = this.props;
    const { scrollBottom } = this.context;
    setScrollFixed(false);
    scrollBottom();
  }

  render() {
    const {
      messages,
      currentUser,
      fixScroll,
    } = this.props;

    return (
      <Fragment>
        {messages.map(message => (
          <RoomChatMessage
            message={message}
            key={message.id}
            username={currentUser && currentUser.username}
            handle={currentUser && currentUser.handle}
          />
        ))}
        <ScrollResume
          onResume={this.handleResumeScroll}
          visible={fixScroll}
        />
      </Fragment>
    );
  }
}

RoomChatMessages.defaultProps = {
  messages: [],
  currentUser: {},
};

RoomChatMessages.propTypes = {
  messages: PropTypes.array,
  currentUser: PropTypes.shape({
    username: PropTypes.string,
    handle: PropTypes.string,
  }),
  fixScroll: PropTypes.bool.isRequired,
  setScrollFixed: PropTypes.func.isRequired,
};

RoomChatMessages.contextType = ScrollAreaContext;

export default RoomChatMessages;
