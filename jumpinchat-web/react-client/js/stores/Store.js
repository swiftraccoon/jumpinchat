import { createStore } from 'zustand/vanilla';

// Keep action methods and their explicit publish boundary while Zustand owns subscriptions.
// MediaStreams and AudioNodes stay in the domain stores; they must not be cloned/serialized.
export default class Store {
  constructor(name, initialState) {
    this.name = name;
    if (initialState !== undefined) this.state = initialState;
    this.observable = createStore(() => ({ revision: 0 }));
    this.listeners = new Map();
    this.subscribe = this.observable.subscribe;
    this.getSnapshot = this.observable.getState;
  }

  getState() {
    return this.state;
  }

  emitChange() {
    this.observable.setState(previous => ({ revision: previous.revision + 1 }));
  }

  addChangeListener(callback) {
    if (!this.listeners.has(callback)) {
      this.listeners.set(callback, this.observable.subscribe(() => callback()));
    }
    return () => this.removeChangeListener(callback);
  }

  removeChangeListener(callback) {
    this.listeners.get(callback)?.();
    this.listeners.delete(callback);
  }
}
