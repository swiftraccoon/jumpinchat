/**
 * Created by Zaccary on 20/06/2015.
 */

import io from 'socket.io-client';

export class SocketUtil {
  constructor() {
    this.socket = null;
    this.listeningEvents = [];
    this.paused = true;
    this.pendingEvents = [];
    this.flushing = false;
  }

  get isSocketConnected() {
    return Boolean(this.socket?.connected);
  }

  authSocket(token) {
    this.paused = true;
    const socket = io({ auth: { token } });
    this.socket = socket;
    socket.on('disconnect', () => {
      if (this.socket === socket) this.paused = true;
      console.warn('socket disconnected');
    });
  }

  resume() {
    if (!this.isSocketConnected) {
      this.paused = true;
      return;
    }
    this.paused = false;
    this.flushPending();
  }

  flushPending() {
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (!this.paused && this.isSocketConnected && this.pendingEvents.length) {
        const [event, data] = this.pendingEvents.shift();
        this.socket.emit(event, data);
      }
    } finally {
      this.flushing = false;
    }
  }

  listen(event, cb) {
    if (!this.listeningEvents.includes(event)) {
      this.socket.on(event, cb);
      this.listeningEvents.push(event);
    }
  }

  emit(event, data = {}) {
    // Socket.IO flushes its own buffer before connect handlers run. Keep room
    // events here until the application confirms the recovered session mapping.
    this.pendingEvents.push([event, data]);
    if (!this.isSocketConnected) this.paused = true;
    if (!this.paused) this.flushPending();
  }
}

export default new SocketUtil();
