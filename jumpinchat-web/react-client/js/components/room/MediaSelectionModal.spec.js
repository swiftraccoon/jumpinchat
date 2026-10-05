import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MediaSelectionModal from './MediaSelectionModal.react';
import * as modalActions from '../../actions/ModalActions';
import { publish, cancelPublish } from '../../utils/CamUtil';
import { pinSelectionVideo } from '../../utils/mediaSelectionCapture';
vi.mock('../../utils/CamUtil', () => ({ publish: vi.fn(), cancelPublish: vi.fn() }));
vi.mock('../../actions/ModalActions', () => ({ setMediaSelectionModal: vi.fn(), setMediaSelectionModalType: vi.fn(), setMediaDeviceId: vi.fn(), setMediaSelectionModalLoading: vi.fn() }));
vi.mock('../../actions/CamActions', () => ({ setClientAudioPtt: vi.fn(), setDefaultAudioPtt: vi.fn() }));
vi.mock('../../utils/UserAPI', () => ({ saveBroadcastQuality: vi.fn() }));
vi.mock('../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));
vi.mock('../../utils/mediaSelectionCapture', () => ({ pinSelectionVideo: vi.fn() }));
vi.mock('./MediaSource.react', () => ({ default: ({ device, type, onSelectDevice }) => <button onClick={() => onSelectDevice(device.deviceId, type)}>{device.label}</button> }));
const modal = { open: true, loading: false, mediaType: 'video', selectedDevices: { video: null, audio: null }, deviceList: { video: [{ deviceId: 'cam', label: 'Camera' }], audio: [{ deviceId: 'mic', label: 'Microphone' }] } };
const props = { modal, audioPtt: false, forcePtt: false };

describe('media selection dialog', () => {
  it('advances camera selection to the microphone step', () => {
    render(<MediaSelectionModal {...props} />); fireEvent.click(screen.getByRole('button', { name: 'Camera' }));
    expect(modalActions.setMediaDeviceId).toHaveBeenCalledWith('cam', 'video'); expect(modalActions.setMediaSelectionModalType).toHaveBeenCalledWith('audio');
    expect(pinSelectionVideo).toHaveBeenCalledExactlyOnceWith('cam');
    expect(pinSelectionVideo.mock.invocationCallOrder[0]).toBeLessThan(modalActions.setMediaDeviceId.mock.invocationCallOrder[0]);
  });
  it('starts publishing only when the selected microphone changes', () => {
    const { rerender } = render(<MediaSelectionModal {...props} />);
    rerender(<MediaSelectionModal {...props} modal={{ ...modal, selectedDevices: { video: 'cam', audio: 'mic' } }} />);
    expect(publish).toHaveBeenCalledWith(false, null, 'cam', 'mic', true);
    expect(modalActions.setMediaSelectionModalLoading).toHaveBeenCalledWith(true);
    rerender(<MediaSelectionModal {...props} modal={{ ...modal, loading: true, selectedDevices: { video: 'cam', audio: 'mic' } }} />);
    expect(publish).toHaveBeenCalledOnce();
  });
  it('dismisses with Escape without switching back to camera previews first', () => {
    render(<MediaSelectionModal {...props} />); fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape', keyCode: 27 });
    expect(modalActions.setMediaSelectionModal).toHaveBeenCalledWith(false); expect(modalActions.setMediaSelectionModalType).not.toHaveBeenCalled();
    expect(cancelPublish).toHaveBeenCalledOnce();
  });
  it('shows the active startup phase and allows cancelling while loading', () => {
    render(<MediaSelectionModal {...props} modal={{ ...modal, mediaType: 'audio', loading: true, loadingMessage: 'Waiting for camera and microphone…' }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Waiting for camera and microphone…');
    expect(screen.getByRole('status')).toHaveTextContent('permission prompt');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel media selection' }));
    expect(cancelPublish).toHaveBeenCalledOnce();
    expect(modalActions.setMediaSelectionModal).toHaveBeenCalledWith(false);
  });
  it('does not publish from device updates while the dialog is closed', () => {
    const { rerender } = render(<MediaSelectionModal {...props} modal={{ ...modal, open: false }} />);
    rerender(<MediaSelectionModal {...props} modal={{ ...modal, open: false, selectedDevices: { video: 'cam', audio: 'mic' } }} />);
    expect(publish).not.toHaveBeenCalled();
    expect(modalActions.setMediaSelectionModalLoading).not.toHaveBeenCalled();
  });
  it('shows missing sources and disables push-to-talk when the room forces it', () => {
    render(<MediaSelectionModal {...props} forcePtt modal={{ ...modal, mediaType: 'audio', deviceList: { video: [], audio: [] } }} />);
    expect(screen.getByText('No audio sources')).toBeVisible(); expect(screen.getByLabelText('Push to talk')).toBeDisabled();
  });
});
