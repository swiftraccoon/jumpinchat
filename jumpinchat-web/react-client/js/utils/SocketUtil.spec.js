import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SocketUtil } from './SocketUtil';

const { io } = vi.hoisted(() => ({ io: vi.fn() }));
vi.mock('socket.io-client', () => ({ default: io }));

function makeSocket() {
  const handlers = new Map();
  const socket = {
    connected: false,
    on: vi.fn((name, handler) => {
      const listeners = handlers.get(name) || [];
      handlers.set(name, [...listeners, handler]);
    }),
    emit: vi.fn(),
    connect() {
      this.connected = true;
      for (const handler of handlers.get('connect') || []) handler();
    },
    disconnect() {
      this.connected = false;
      for (const handler of handlers.get('disconnect') || []) handler('transport close');
    },
  };
  return socket;
}

describe('application socket event buffering', () => {
  let utility;
  let socket;

  beforeEach(() => {
    socket = makeSocket();
    io.mockReturnValue(socket);
    utility = new SocketUtil();
    utility.authSocket('fixture-token');
  });

  it('starts paused and does not send events on native connect alone', () => {
    utility.emit('room::join', { room: 'fixture' });
    socket.connect();
    utility.emit('room::message', { message: 'waiting for session' });
    expect(socket.emit).not.toHaveBeenCalled();
    utility.resume();
    expect(socket.emit.mock.calls).toEqual([
      ['room::join', { room: 'fixture' }],
      ['room::message', { message: 'waiting for session' }],
    ]);
  });

  it('retains immediate emission and default payload once the socket is ready', () => {
    socket.connect();
    utility.resume();
    utility.emit('room::users');
    expect(socket.emit).toHaveBeenCalledWith('room::users', {});
    expect(utility.isSocketConnected).toBe(true);
  });

  it('queues immediately on disconnect and waits for explicit recovery approval', () => {
    socket.connect();
    utility.resume();
    socket.disconnect();
    utility.emit('room::message', { message: 'offline' });
    socket.connect();
    utility.emit('room::message', { message: 'transport returned' });
    expect(socket.emit).not.toHaveBeenCalled();
    utility.resume();
    expect(socket.emit.mock.calls.map(call => call[1].message)).toEqual(['offline', 'transport returned']);
  });

  it('does not resume while disconnected or lose events across repeated outages', () => {
    utility.emit('first');
    utility.resume();
    socket.connect();
    socket.disconnect();
    utility.emit('second');
    socket.connect();
    socket.disconnect();
    utility.emit('third');
    socket.connect();
    expect(socket.emit).not.toHaveBeenCalled();
    utility.resume();
    utility.resume();
    expect(socket.emit.mock.calls.map(call => call[0])).toEqual(['first', 'second', 'third']);
  });

  it('keeps pending events for the current socket when authentication replaces a transport', () => {
    utility.emit('queued');
    const replacement = makeSocket();
    io.mockReturnValue(replacement);
    utility.authSocket('replacement-token');
    replacement.connect();
    utility.resume();
    expect(socket.emit).not.toHaveBeenCalled();
    expect(replacement.emit).toHaveBeenCalledWith('queued', {});
    socket.disconnect();
    utility.emit('current');
    expect(replacement.emit).toHaveBeenLastCalledWith('current', {});
  });

  it('stops a drain when the transport disconnects and preserves the unsent FIFO', () => {
    utility.emit('first');
    utility.emit('second');
    utility.emit('third');
    socket.connect();
    socket.emit.mockImplementationOnce(() => socket.disconnect());
    utility.resume();
    expect(socket.emit.mock.calls.map(call => call[0])).toEqual(['first']);
    utility.emit('fourth');
    socket.connect();
    expect(socket.emit).toHaveBeenCalledTimes(1);
    utility.resume();
    expect(socket.emit.mock.calls.map(call => call[0])).toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('does not let reentrant events or resume calls jump ahead of queued events', () => {
    utility.emit('first');
    utility.emit('second');
    socket.connect();
    socket.emit.mockImplementationOnce(() => {
      utility.emit('third');
      utility.resume();
    });
    utility.resume();
    expect(socket.emit.mock.calls.map(call => call[0])).toEqual(['first', 'second', 'third']);
  });

  it('safely queues before authentication creates a socket', () => {
    const uninitialized = new SocketUtil();
    expect(uninitialized.isSocketConnected).toBe(false);
    uninitialized.emit('early');
    uninitialized.resume();
    uninitialized.authSocket('fixture-token');
    socket.connect();
    uninitialized.resume();
    expect(socket.emit).toHaveBeenCalledWith('early', {});
  });

  it('keeps existing event-listener deduplication behavior', () => {
    const listener = vi.fn();
    utility.listen('room::message', listener);
    utility.listen('room::message', vi.fn());
    expect(socket.on.mock.calls.filter(call => call[0] === 'room::message')).toEqual([['room::message', listener]]);
  });
});
