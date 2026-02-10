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

if (process.env.NODE_ENV === 'production') {
  Sentry.init({
    dsn: 'https://71122020584c44f7af718dfe6d6b877d@sentry.io/186641',
    environment: process.env.NODE_ENV,
    release: window.BUILD_NUM,
    beforeSend(event) {
      if (event.exception) {
        Sentry.showReportDialog({ eventId: event.event_id });
      }
      return event;
    },
  });
}

ServiceWorkerUtils.initServiceWorker();

createRoot(document.getElementById('app')).render(<AppWindow />);
