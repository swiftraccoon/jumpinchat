import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RoomCamOptions } from './RoomCamOptions.react';
import { hangupRemoteStream, resumeRemoteStream } from '../../../actions/CamActions';
vi.mock('../../../actions/CamActions', () => ({ hangupRemoteStream: vi.fn(), resumeRemoteStream: vi.fn(), setStreamOptionsState: vi.fn() }));
vi.mock('../../../utils/RoomAPI', () => ({ sendOperatorAction: vi.fn() }));
const props = { open: true, user: { _id: 'bob' }, clientUser: { roles: [] }, roleState: { roles: [] }, feed: { userId: 'bob', userClosed: false } };

describe('camera options', () => {
  it('hides and restores a selected remote camera', () => {
    const { rerender } = render(<RoomCamOptions {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Hide cam' })); expect(hangupRemoteStream).toHaveBeenCalledWith('bob');
    rerender(<RoomCamOptions {...props} feed={{ ...props.feed, userClosed: true }} />); fireEvent.click(screen.getByRole('button', { name: 'Restore cam' })); expect(resumeRemoteStream).toHaveBeenCalledWith('bob');
  });
  it('does not show administrative controls to ordinary participants', () => {
    render(<RoomCamOptions {...props} />); expect(screen.queryByRole('button', { name: 'Ban user' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Close broadcast' })).not.toBeInTheDocument();
  });
});
