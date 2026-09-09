import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MediaSelectionModal from './MediaSelectionModal.react';
import * as modalActions from '../../actions/ModalActions';
import { publish } from '../../utils/CamUtil';
vi.mock('../../utils/CamUtil', () => ({ publish: vi.fn() }));
vi.mock('../../actions/ModalActions', () => ({ setMediaSelectionModal: vi.fn(), setMediaSelectionModalType: vi.fn(), setMediaDeviceId: vi.fn(), setMediaSelectionModalLoading: vi.fn() }));
vi.mock('../../actions/CamActions', () => ({ setClientAudioPtt: vi.fn(), setDefaultAudioPtt: vi.fn() }));
vi.mock('../../utils/UserAPI', () => ({ saveBroadcastQuality: vi.fn() }));
vi.mock('../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));
vi.mock('./MediaSource.react', () => ({ default: ({ device, type, onSelectDevice }) => <button onClick={() => onSelectDevice(device.deviceId, type)}>{device.label}</button> }));
const modal = { open: true, loading: false, mediaType: 'video', selectedDevices: { video: null, audio: null }, deviceList: { video: [{ deviceId: 'cam', label: 'Camera' }], audio: [{ deviceId: 'mic', label: 'Microphone' }] } };
const props = { modal, audioPtt: false, forcePtt: false };

describe('media selection dialog', () => {
  it('advances camera selection to the microphone step', () => {
    render(<MediaSelectionModal {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    expect(modalActions.setMediaDeviceId).toHaveBeenCalledWith('cam', 'video'); expect(modalActions.setMediaSelectionModalType).toHaveBeenCalledWith('audio');
  });
  it('starts publishing only when the selected microphone changes', () => {
    const { rerender } = render(<MediaSelectionModal {...props} />);
    rerender(<MediaSelectionModal {...props} modal={{ ...modal, selectedDevices: { video: 'cam', audio: 'mic' } }} />);
    expect(publish).toHaveBeenCalledWith(false, null, 'cam', 'mic', true);
    expect(modalActions.setMediaSelectionModalLoading).toHaveBeenCalledWith(true);
    rerender(<MediaSelectionModal {...props} modal={{ ...modal, loading: true, selectedDevices: { video: 'cam', audio: 'mic' } }} />);
    expect(publish).toHaveBeenCalledOnce();
  });
  it('dismisses with Escape and resets the next selection step', () => {
    render(<MediaSelectionModal {...props} />); fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });
    expect(modalActions.setMediaSelectionModal).toHaveBeenCalledWith(false); expect(modalActions.setMediaSelectionModalType).toHaveBeenCalledWith('video');
  });
  it('shows missing sources and disables push-to-talk when the room forces it', () => {
    render(<MediaSelectionModal {...props} forcePtt modal={{ ...modal, mediaType: 'audio', deviceList: { video: [], audio: [] } }} />);
    expect(screen.getByText('No audio sources')).toBeVisible(); expect(screen.getByLabelText('Push to talk')).toBeDisabled();
  });
});
