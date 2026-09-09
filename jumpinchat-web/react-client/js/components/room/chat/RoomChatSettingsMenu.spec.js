import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import RoomChatSettingsMenu from './RoomChatSettingsMenu.react';
import { setNotificationsEnabled, setTheme } from '../../../actions/UserActions';
import * as api from '../../../utils/UserAPI';
import { registerPushNotifications, unsubscribeFromNotifications } from '../../../utils/ServiceWorkerUtils';
vi.mock('../../../actions/UserActions', () => ({ setNotificationsEnabled: vi.fn(), setTheme: vi.fn() }));
vi.mock('../../../utils/UserAPI', () => ({ setNotificationsEnabled: vi.fn(), setThemeRequest: vi.fn() }));
vi.mock('../../../utils/ServiceWorkerUtils', () => ({ registerPushNotifications: vi.fn(), unsubscribeFromNotifications: vi.fn() }));
vi.mock('../../../utils/RoomAPI', () => ({ sendOperatorAction: vi.fn() }));
vi.mock('../../../utils/YoutubeAPI', () => ({ setPlayYoutubeVideos: vi.fn() }));
vi.mock('../../../actions/NotificationActions', () => ({ addNotification: vi.fn() }));
vi.mock('../../../utils/AnalyticsUtil', () => ({ trackEvent: vi.fn() }));
vi.mock('./RoomChatColorPicker.react', () => ({ default: () => null }));
const props = { user: { user_id: 'account', settings: { pushNotificationsEnabled: true } }, open: true, onClick: vi.fn(), chatColors: [], playYoutubeVideos: true, darkTheme: false, roomName: 'room', layout: 'horizontal' };

describe('chat preferences menu', () => {
  it('updates notification subscriptions and the persisted preference', () => {
    const { rerender } = render(<RoomChatSettingsMenu {...props} />); fireEvent.click(screen.getByLabelText('Enable notifications'));
    expect(unsubscribeFromNotifications).toHaveBeenCalledOnce(); expect(setNotificationsEnabled).toHaveBeenCalledWith(false); expect(api.setNotificationsEnabled).toHaveBeenCalledWith('account', false);
    rerender(<RoomChatSettingsMenu {...props} user={{ ...props.user, settings: { pushNotificationsEnabled: false } }} />); fireEvent.click(screen.getByLabelText('Enable notifications')); expect(registerPushNotifications).toHaveBeenCalledOnce();
  });
  it('updates the account theme from the accessible checkbox', () => {
    render(<RoomChatSettingsMenu {...props} />); fireEvent.click(screen.getByLabelText('Enable dark theme')); expect(setTheme).toHaveBeenCalledWith(true); expect(api.setThemeRequest).toHaveBeenCalledWith('account', true);
  });
});
