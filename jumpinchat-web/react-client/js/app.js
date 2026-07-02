/* global window, document */
import 'core-js/stable';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Modal from 'react-modal';
import * as Sentry from '@sentry/browser';
import AppWindow from './components/AppWindow.react';
import * as ServiceWorkerUtils from './utils/ServiceWorkerUtils';

Modal.setAppElement('#app');

if (process.env.NODE_ENV === 'production') {
  console.log = () => {};
}

if (process.env.NODE_ENV === 'production' && window.SENTRY_DSN) {
  Sentry.init({
    dsn: window.SENTRY_DSN,
    environment: process.env.NODE_ENV,
    release: window.BUILD_NUM,
  });
}

ServiceWorkerUtils.initServiceWorker();

createRoot(document.getElementById('app')).render(<AppWindow />);
