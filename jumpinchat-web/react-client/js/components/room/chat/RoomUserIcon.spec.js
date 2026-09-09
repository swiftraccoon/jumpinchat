import React from 'react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import RoomUserIcon from './RoomUserIcon.react';

describe('participant identity badge', () => {
  it('distinguishes guests, accounts, supporters, and administrators', () => {
    const props = { isAdmin: false, isSiteMod: false, isSupporter: false };
    const { container, rerender } = render(<RoomUserIcon {...props} />); expect(container.querySelector('.fa-user-o')).toBeInTheDocument();
    rerender(<RoomUserIcon {...props} userId="account" />); expect(container.querySelector('.fa-user')).toBeInTheDocument();
    rerender(<RoomUserIcon {...props} userId="account" isSupporter />); expect(container.querySelector('.fa-heart')).toBeInTheDocument();
    rerender(<RoomUserIcon {...props} userId="account" isSupporter isAdmin />); expect(container.querySelector('.fa-user-secret')).toBeInTheDocument(); expect(container.querySelector('.fa-heart')).not.toBeInTheDocument();
  });
});
