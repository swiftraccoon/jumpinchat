import { createStore } from 'zustand/vanilla';
import { VIEW_ACTION } from '../constants/PayloadSources';

// Actions publish synchronously. Nested actions wait until every subscriber has
// seen the current action, preserving store/saga ordering without Flux internals.
export class AppDispatcher {
  constructor(name = 'Global dispatcher') {
    this.name = name;
    this.queue = [];
    this.queueRunning = false;
    this.nextToken = 0;
    this.subscriptions = new Map();
    this.actions = createStore(() => ({ payload: null, revision: 0 }));
  }

  register(callback) {
    const token = `action-${++this.nextToken}`;
    const unsubscribe = this.actions.subscribe(({ payload }) => callback(payload));
    this.subscriptions.set(token, unsubscribe);
    return token;
  }

  unregister(token) {
    const unsubscribe = this.subscriptions.get(token);
    if (!unsubscribe) throw new Error(`Unknown action subscription: ${token}`);
    unsubscribe();
    this.subscriptions.delete(token);
  }

  isDispatching() {
    return this.queueRunning;
  }

  dispatch(payload) {
    this.queue.push(payload);
    if (this.queueRunning) return;
    this.queueRunning = true;
    try {
      while (this.queue.length) {
        const next = this.queue.shift();
        this.actions.setState(previous => ({ payload: next, revision: previous.revision + 1 }));
      }
    } finally {
      this.queueRunning = false;
      this.queue.length = 0;
    }
  }

  handleAction(action) {
    if (!action?.actionType) {
      throw new Error('Empty action.type: you likely mistyped the action.');
    }
    this.dispatch({ source: VIEW_ACTION, action });
  }
}

const dispatcher = new AppDispatcher();

export const ApplicationDispatcher = new AppDispatcher('Application dispatcher');
export const ChatDispatcher = new AppDispatcher('Chat dispatcher');
export const CamDispatcher = new AppDispatcher('Cam dispatcher');
export const ModalDispatcher = new AppDispatcher('Modal dispatcher');
export const NotificationDispatcher = new AppDispatcher('Notification dispatcher');
export const PmDispatcher = new AppDispatcher('PM dispatcher');
export const PushDispatcher = new AppDispatcher('Push dispatcher');
export const RoomDispatcher = new AppDispatcher('Room dispatcher');
export const SessionDispatcher = new AppDispatcher('Session dispatcher');
export const UserDispatcher = new AppDispatcher('User dispatcher');
export const YoutubeDispatcher = new AppDispatcher('Youtube dispatcher');
export const ProfileDispatcher = new AppDispatcher('Profile dispatcher');
export const RoleDispatcher = new AppDispatcher('Role dispatcher');
export default dispatcher;
