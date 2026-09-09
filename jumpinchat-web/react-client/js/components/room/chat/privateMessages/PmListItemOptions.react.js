import React from 'react';
import PropTypes from 'prop-types';
import FloatingLayer from '../../../elements/FloatingLayer.react';
import WrappedListItems from '../../../elements/ListItems.react';

const PmListItemOptions = ({
  menuOpen = null,
  handle,
  userListId,
  onOpenMenu,
  handleClickOutside,
  closeConversation,
}) => {
  const optionsArr = [
    {
      text: `Conversation with ${handle}`,
      element: 'div',
      props: {
        className: 'dropdown__Option dropdown__Option-header',
      },
    },
    {
      text: 'Close conversation',
      element: 'button',
      props: {
        onClick: () => closeConversation(userListId),
      },
    },
  ];

  return (
    <FloatingLayer
      attachment="top center"
      constraints={[
        {
          to: 'scrollParent',
          attachment: 'together',
        },
        {
          to: 'window',
          attachment: 'together',
          pin: true,
        },
      ]}
    >
      <button
        className="userList__Action"
        onClick={onOpenMenu}
        type="button"
      >
        <i className="fa fa-ellipsis-h" aria-hidden="true" />
      </button>

      {menuOpen === userListId && (
        <WrappedListItems
          options={optionsArr}
          onClickOutside={handleClickOutside}
        />
      )}
    </FloatingLayer>
  );
};

PmListItemOptions.propTypes = {
  menuOpen: PropTypes.string,
  handle: PropTypes.string.isRequired,
  userListId: PropTypes.string.isRequired,
  onOpenMenu: PropTypes.func.isRequired,
  handleClickOutside: PropTypes.func.isRequired,
  closeConversation: PropTypes.func.isRequired,
};

export default PmListItemOptions;
