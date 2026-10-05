/* global window, document */
import 'core-js/stable';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Modal from 'react-modal';
import AppWindow from './components/AppWindow.react';
import * as ServiceWorkerUtils from './utils/ServiceWorkerUtils';
import { initErrorReporting } from './utils/errorReporting';

Modal.setAppElement('#app');

if (process.env.NODE_ENV === 'production') {
  console.log = () => {};
}

initErrorReporting({
  dsn: window.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: window.BUILD_NUM,
});

ServiceWorkerUtils.initServiceWorker();

createRoot(document.getElementById('app')).render(<AppWindow />);
