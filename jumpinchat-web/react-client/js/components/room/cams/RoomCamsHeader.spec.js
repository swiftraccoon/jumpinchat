import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoomCamsHeader from './RoomCamsHeader.react';
vi.mock('./RoomBroadcastButton.react', () => ({ default: ({ canBroadcast }) => <button disabled={!canBroadcast}>Broadcast</button> }));
vi.mock('./RoomCamsLocalAudioActions.react', () => ({ default: () => <button>Microphone</button> }));
const props = { room: { name: 'Friends', attrs: {}, settings: { description: 'Welcome to our room' } }, feedCount: 2, userCount: 5, canBroadcast: true, broadcastRestricted: false };

describe('room camera header', () => {
  it('keeps the full room description in the DOM and prevents restricted broadcasts', () => {
    const { rerender } = render(<RoomCamsHeader {...props} />); expect(screen.getByRole('heading', { name: 'Friends' })).toBeVisible(); expect(screen.getByText('Welcome to our room')).toBeVisible(); expect(screen.getByRole('button', { name: 'Broadcast' })).toBeEnabled();
    rerender(<RoomCamsHeader {...props} broadcastRestricted />); expect(screen.getByRole('button', { name: 'Broadcast' })).toBeDisabled();
  });
  it('offers microphone controls only when the local stream carries audio', () => {
    const { rerender } = render(<RoomCamsHeader {...props} localStream={{ stream: { getAudioTracks: () => [] } }} />); expect(screen.queryByRole('button', { name: 'Microphone' })).not.toBeInTheDocument();
    rerender(<RoomCamsHeader {...props} localStream={{ stream: { getAudioTracks: () => [{}] } }} />); expect(screen.getByRole('button', { name: 'Microphone' })).toBeVisible();
  });
});
