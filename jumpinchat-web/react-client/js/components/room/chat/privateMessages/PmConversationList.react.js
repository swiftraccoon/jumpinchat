import React from 'react';
import PropTypes from 'prop-types';
import PmListItem from './PmListItem.react';
import ScrollArea from '../../../elements/ScrollArea.react';

const PmConversationList = ({
  privateMessages,
  selectedConversation = null,
  selectConversation,
  menuOpen = null,
  openMenu,
  handleClickOutside,
  closeConversation,
}) => (
  <ScrollArea
    className="privateMessages__ListWrapper chat__UserList"
    horizontal={false}
  >
    {privateMessages.map(convo => (
      <PmListItem
        key={convo.user.userListId}
        user={convo.user}
        disabled={convo.disabled}
        selectedConversation={selectedConversation}
        selectConversation={selectConversation}
        unreadMessages={convo.unreadMessages}
        menuOpen={menuOpen}
        openMenu={openMenu}
        handleClickOutside={handleClickOutside}
        closeConversation={closeConversation}
      />
    ))}
  </ScrollArea>
);

PmConversationList.propTypes = {
  privateMessages: PropTypes.arrayOf(PropTypes.shape({
    user: PropTypes.shape({
      userListId: PropTypes.string.isRequired,
      userId: PropTypes.string,
    }).isRequired,
    unreadMessages: PropTypes.number.isRequired,
  })).isRequired,
  selectedConversation: PropTypes.string,
  selectConversation: PropTypes.func.isRequired,
  handleClickOutside: PropTypes.func.isRequired,
  closeConversation: PropTypes.func.isRequired,
  openMenu: PropTypes.func.isRequired,
  menuOpen: PropTypes.string,
};

export default PmConversationList;
