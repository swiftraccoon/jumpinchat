import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initRoom } from './RoomUtils';
import SessionStore from '../stores/SessionStore';

const fixture = vi.hoisted(() => ({
  socket: { id: undefined, connected: false },
  listeners: new Map(),
  getSession: vi.fn(),
  updateSessionId: vi.fn(),
  authSocket: vi.fn(),
  resume: vi.fn(),
  setCanBroadcast: vi.fn(),
  addNotification: vi.fn(),
  closeNotification: vi.fn(),
  notifications: [],
  error: vi.fn(),
}));

vi.mock('./SocketUtil', () => ({ default: {
  socket: fixture.socket,
  authSocket: fixture.authSocket,
  resume: fixture.resume,
  listen: (name, callback) => fixture.listeners.set(name, callback),
} }));
vi.mock('./UserAPI', () => ({
  getSession: fixture.getSession,
  updateSessionId: fixture.updateSessionId,
  syncUser: vi.fn(), checkCanBroadcast: vi.fn(),
}));
vi.mock('./RoomAPI', () => ({
  getRoom: vi.fn(), joinRoom: vi.fn(), syncMessages: vi.fn(),
  syncUsers: vi.fn(), syncClientEvents: vi.fn(), syncErrors: vi.fn(),
}));
vi.mock('./YoutubeAPI', () => ({ syncYoutubeMessages: vi.fn() }));
vi.mock('./CamUtil', () => ({ init: vi.fn() }));
vi.mock('./ErrorUtil', () => ({ error: fixture.error }));
vi.mock('../actions/RoomActions', () => ({ getStoredRoom: vi.fn() }));
vi.mock('../actions/ChatActions', () => ({
  setUserList: vi.fn(), setClientUser: vi.fn(), addMessage: vi.fn(),
}));
vi.mock('../actions/CamActions', () => ({ setCanBroadcast: fixture.setCanBroadcast }));
vi.mock('../actions/ModalActions', () => ({ setHandleModal: vi.fn() }));
vi.mock('../actions/NotificationActions', () => ({
  addNotification: fixture.addNotification, closeNotification: fixture.closeNotification,
}));
vi.mock('../stores/NotificationStore', () => ({ default: {
  getNotifications: () => fixture.notifications,
} }));
vi.mock('../actions/RoleActions', () => ({ fetchRoles: vi.fn() }));
vi.mock('../actions/UserActions', () => ({ setBroadcastRestricted: vi.fn() }));
vi.mock('../stores/ChatStore/ChatStore', () => ({ default: { getState: () => ({}) } }));

function connect(id) {
  fixture.socket.id = id;
  fixture.socket.connected = true;
  fixture.listeners.get('connect')();
}

function disconnect() {
  fixture.socket.id = undefined;
  fixture.socket.connected = false;
  fixture.listeners.get('disconnect')('transport close');
}

function start() {
  const callback = vi.fn();
  initRoom(callback);
  connect('socket-a');
  return callback;
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/testroom');
  fixture.listeners.clear();
  fixture.notifications = [];
  fixture.addNotification.mockImplementation(notification => fixture.notifications.unshift(notification));
  fixture.closeNotification.mockImplementation(index => fixture.notifications.splice(index, 1));
  fixture.socket.id = undefined;
  fixture.socket.connected = false;
  fixture.getSession.mockImplementation(callback => callback(null, { token: 'fixture-token' }));
  fixture.updateSessionId.mockReset();
  fixture.resume.mockReset();
  SessionStore.setSessionId(null);
  SessionStore.setIsReconnecting(false);
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('room transport recovery', () => {
  it('initializes once, then migrates the prior room mapping on a new connect event', () => {
    const callback = start();
    expect(callback).toHaveBeenCalledWith(null, expect.objectContaining({
      room: 'testroom', activityToken: 'fixture-token', loading: false,
    }));
    expect(fixture.authSocket).toHaveBeenCalledWith('fixture-token');
    disconnect();
    connect('socket-b');
    expect(fixture.updateSessionId).toHaveBeenCalledWith('socket-a', 'socket-b', expect.any(Function));
    expect(SessionStore.getState()).toEqual({ id: 'socket-a', isReconnecting: true });
    expect(fixture.setCanBroadcast).toHaveBeenLastCalledWith(false);
    expect(fixture.resume).toHaveBeenCalledTimes(1);
    fixture.updateSessionId.mock.calls[0][2](null);
    expect(SessionStore.getState()).toEqual({ id: 'socket-b', isReconnecting: false });
    expect(fixture.setCanBroadcast).toHaveBeenLastCalledWith(true);
    expect(fixture.resume).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears each disconnect reload deadline after recovery', () => {
    start();
    fixture.updateSessionId.mockImplementation((_old, _next, callback) => callback(null));
    for (const id of ['socket-b', 'socket-c']) {
      disconnect();
      expect(vi.getTimerCount()).toBe(1);
      vi.advanceTimersByTime(59000);
      connect(id);
      expect(vi.getTimerCount()).toBe(0);
    }
    expect(SessionStore.getState().id).toBe('socket-c');
  });

  it('chains a second connection from the mapping confirmed by an in-flight request', () => {
    const callback = start();
    disconnect();
    connect('socket-b');
    disconnect();
    connect('socket-c');
    expect(fixture.updateSessionId).toHaveBeenCalledTimes(1);
    fixture.updateSessionId.mock.calls[0][2](null);
    expect(fixture.updateSessionId.mock.calls[1].slice(0, 2)).toEqual(['socket-b', 'socket-c']);
    expect(SessionStore.getState()).toEqual({ id: 'socket-b', isReconnecting: true });
    expect(fixture.setCanBroadcast).not.toHaveBeenCalledWith(true);
    expect(fixture.resume).toHaveBeenCalledTimes(1);
    fixture.updateSessionId.mock.calls[1][2](null);
    expect(SessionStore.getState()).toEqual({ id: 'socket-c', isReconnecting: false });
    expect(fixture.setCanBroadcast).toHaveBeenLastCalledWith(true);
    expect(fixture.resume).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('retains the prior mapping when a stale connection fails during recovery', () => {
    const callback = start();
    disconnect();
    connect('socket-b');
    disconnect();
    connect('socket-c');
    fixture.updateSessionId.mock.calls[0][2]('socket-b disappeared');
    expect(fixture.updateSessionId.mock.calls[1].slice(0, 2)).toEqual(['socket-a', 'socket-c']);
    fixture.updateSessionId.mock.calls[1][2](null);
    expect(SessionStore.getState().id).toBe('socket-c');
    expect(callback).toHaveBeenCalledTimes(1);
  });

  it('keeps broadcasting disabled if the transport drops before migration completes', () => {
    start();
    disconnect();
    connect('socket-b');
    disconnect();
    fixture.updateSessionId.mock.calls[0][2](null);
    expect(SessionStore.getState()).toEqual({ id: 'socket-b', isReconnecting: false });
    expect(fixture.setCanBroadcast).not.toHaveBeenCalledWith(true);
    connect('socket-c');
    expect(fixture.updateSessionId.mock.calls[1].slice(0, 2)).toEqual(['socket-b', 'socket-c']);
  });

  it('reports an unrecoverable session without replacing the last confirmed mapping', () => {
    const callback = start();
    disconnect();
    connect('socket-b');
    fixture.updateSessionId.mock.calls[0][2]('ERR_NO_SESSION');
    expect(callback).toHaveBeenLastCalledWith('ERR_RECONNECT_FAIL');
    expect(SessionStore.getState()).toEqual({ id: 'socket-a', isReconnecting: false });
    expect(fixture.setCanBroadcast).toHaveBeenLastCalledWith(false);
    expect(fixture.error).toHaveBeenCalledWith(expect.objectContaining({ context: 'chat' }));
  });

  it('reports Socket.IO connection errors without announcing a successful session', () => {
    const callback = vi.fn();
    initRoom(callback);
    fixture.listeners.get('connect_error')(new Error('connection unavailable'));
    expect(callback).not.toHaveBeenCalled();
    expect(fixture.setCanBroadcast).toHaveBeenLastCalledWith(false);
    expect(fixture.addNotification).toHaveBeenCalledWith(expect.objectContaining({
      message: 'Unable to establish connection to chat server',
    }));
  });

  it('clears stale connection warnings only after initial connection or confirmed recovery', () => {
    initRoom(vi.fn());
    fixture.listeners.get('connect_error')(new Error('initial network unavailable'));
    expect(fixture.notifications).toHaveLength(1);
    connect('socket-a');
    expect(fixture.notifications).toHaveLength(0);
    disconnect();
    fixture.listeners.get('connect_error')(new Error('retry unavailable'));
    fixture.notifications.push({ message: 'An unrelated persistent notice' });
    connect('socket-b');
    expect(fixture.notifications.some(notification => notification.message.includes('Unable to establish'))).toBe(true);
    fixture.updateSessionId.mock.calls[0][2](null);
    expect(fixture.notifications.map(notification => notification.message)).toEqual([
      'Chat server reconnected', 'An unrelated persistent notice',
    ]);
  });

  it('keeps a new disconnect warning when transport drops while queued events drain', () => {
    const callback = start();
    disconnect();
    connect('socket-b');
    fixture.resume.mockImplementationOnce(disconnect);
    fixture.updateSessionId.mock.calls[0][2](null);
    expect(fixture.setCanBroadcast).toHaveBeenLastCalledWith(false);
    expect(fixture.notifications.some(notification => notification.message === 'Chat server disconnected')).toBe(true);
    expect(fixture.notifications.some(notification => notification.message === 'Chat server reconnected')).toBe(false);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(1);
  });
});
