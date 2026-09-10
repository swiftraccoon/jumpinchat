import Store from './Store';
import { setPath as lodashSet } from '../utils/lang';
import { get, set } from '../utils/localStorage';
import { ApplicationDispatcher } from '../dispatcher/AppDispatcher';
import * as actionTypes from '../constants/ActionTypes';
import { layouts } from '../constants/RoomConstants';

const storageKey = 'settingsApp';
export class AppStore extends Store {
  constructor() {
    super();
    const state = get(storageKey);
    this.state = {
      layout: layouts.VERTICAL,
      settingsOpen: false,
      settingsError: {
        room: {},
        app: {},
        user: {},
      },
      ...state,
    };
  }

  setLayout(layout) {
    const state = {
      ...get(storageKey),
      layout,
    };

    this.state = {
      ...this.state,
      layout,
    };

    set(storageKey, state);
  }

  setSettingsModal(settingsOpen) {
    this.state = {
      ...this.state,
      settingsOpen,
    };
  }

  setSettingsError(error) {
    const path = error.modal.replace(/^(settings\.)(.*)/, '$2');
    this.state = {
      ...this.state,
      settingsError: lodashSet(this.state.settingsError, path, error.message),
    };
  }

  getState() {
    return this.state;
  }

  // Emit Change event

  // Add change listener

  // Remove change listener
}

const appStore = new AppStore();

appStore.dispatchToken = ApplicationDispatcher.register((payload) => {
  const { action } = payload;

  switch (action.actionType) {
    case actionTypes.SET_LAYOUT:
      appStore.setLayout(action.layout);
      break;

    case actionTypes.SET_SETTINGS_MODAL:
      appStore.setSettingsModal(action.open);
      break;

    case actionTypes.SET_SETTINGS_ERROR:
      appStore.setSettingsError(action.error);
      break;

    default:
      return true;
  }

  appStore.emitChange();

  return true;
});

export default appStore;
