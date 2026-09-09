import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SettingsRoomUsers from './index';
import { getRoomEnrollments } from '../../../actions/RoleActions';
vi.mock('../../../actions/RoleActions', () => ({ getRoomEnrollments: vi.fn(), addRoomUserEnrollment: vi.fn(), enrollUser: vi.fn(), unenrollUser: vi.fn() }));
vi.mock('./ListItem', () => ({ default: ({ enrollment }) => <li>{enrollment.username}</li> }));
const settings = { roles: [{ tag: 'everyone', name: 'Everyone', isDefault: true }, { tag: 'host', name: 'Host' }], enrollments: [{ username: 'alice', userId: 'alice', roles: [{ tag: 'everyone' }] }, { username: 'bob', userId: 'bob', roles: [{ tag: 'host' }] }, { username: 'new-person', userId: 'new', roles: [], new: true }] };

describe('room membership settings', () => {
  it('loads memberships, filters roles, and keeps a newly added participant visible', () => {
    render(<SettingsRoomUsers settings={settings} />); expect(getRoomEnrollments).toHaveBeenCalledOnce(); expect(screen.getByText('alice')).toBeVisible(); expect(screen.queryByText('bob')).not.toBeInTheDocument(); expect(screen.getByText('new-person')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Filter by roles'), { target: { value: 'host' } }); expect(screen.getByText('bob')).toBeVisible(); expect(screen.queryByText('alice')).not.toBeInTheDocument(); expect(screen.getByText('new-person')).toBeVisible();
  });
  it('filters memberships using the search field', () => {
    render(<SettingsRoomUsers settings={settings} />); fireEvent.change(screen.getByLabelText('Search users'), { target: { value: 'alice' } }); expect(screen.getByText('alice')).toBeVisible(); expect(screen.queryByText('new-person')).not.toBeInTheDocument();
  });
});
