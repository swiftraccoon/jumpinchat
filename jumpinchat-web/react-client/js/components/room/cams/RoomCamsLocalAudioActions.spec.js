import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoomCamsLocalAudioActions from './RoomCamsLocalAudioActions.react';
import { setAudioState } from '../../../utils/CamUtil';
import { setLocalAudioActive } from '../../../actions/CamActions';
vi.mock('../../../utils/CamUtil', () => ({ setAudioState: vi.fn() }));
vi.mock('../../../actions/CamActions', () => ({ setLocalAudioActive: vi.fn() }));
vi.mock('../../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));
vi.mock('../AudioVolumeIndicator.react', () => ({ default: () => null }));

describe('local microphone controls', () => {
  it('enables push-to-talk while held and disables after release', () => {
    vi.useFakeTimers(); render(<RoomCamsLocalAudioActions audioPtt localAudioActive={false} />);
    fireEvent.mouseDown(screen.getByRole('button', { name: /Push to Talk/ })); expect(setAudioState).toHaveBeenLastCalledWith(true);
    fireEvent.mouseUp(window); act(() => vi.advanceTimersByTime(500)); expect(setAudioState).toHaveBeenLastCalledWith(false); expect(setLocalAudioActive).toHaveBeenLastCalledWith(false);
  });
  it('toggles continuous audio with the mute control', () => {
    render(<RoomCamsLocalAudioActions audioPtt={false} localAudioActive={false} />);
    fireEvent.click(screen.getByRole('button')); expect(setAudioState).toHaveBeenCalledWith(true);
  });
});
