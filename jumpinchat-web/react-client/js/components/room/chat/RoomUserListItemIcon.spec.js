import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoomUserListItemIcon from './RoomUserListItemIcon.react';

describe('participant role badge', () => {
  it('omits the default role and displays an assigned role icon', () => {
    const roles = [{ tag: 'everyone', name: 'Everyone', isDefault: true, icon: {} }, { tag: 'host', name: 'Host', icon: { name: 'star', color: 'gold' } }];
    const { container, rerender } = render(<RoomUserListItemIcon roles={roles} userRoles={['everyone']} />); expect(container).toBeEmptyDOMElement();
    rerender(<RoomUserListItemIcon roles={roles} userRoles={['host']} />); expect(container.querySelector('[data-icon="star"]')).toBeInTheDocument();
  });
});
