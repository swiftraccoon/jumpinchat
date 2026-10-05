/**
 * Created by Zaccary on 09/09/2015.
 */

/* global MediaStream, navigator */

import uuid from './uuid';
import axios from 'axios';
import Janus from 'janus-gateway';
import adapter from 'webrtc-adapter';
import createMediaRecovery from './mediaRecovery';
import { takeSelectionTracks, cancelMediaSelection } from './mediaSelectionCapture';
import camStore from '../stores/CamStore/CamStore';
import {
  destroyLocalStream,
  addRemoteStream,
  destroyRemoteStream,
  addLocalStream,
  setFeedLoading,
  resumeAllRemoteStreams,
} from '../actions/CamActions';

import { sendUserBroadcastState } from './RoomAPI';
import { addNotification } from '../actions/NotificationActions';
import {
  setModalError,
  setMediaSelectionModal,
  setMediaDeviceId,
  setMediaSelectionModalLoading,
} from '../actions/ModalActions';
import { trackEvent } from './AnalyticsUtil';
import {
  defaultVideoConstraints,
  getVideoConstraints,
} from '../constants/MediaConstants';

let janus = null;
let janusMcuPlugin = null;
let slowlinkTimeout;
let localMediaStream = null;
let sessionGeneration = 0;
let publicationAttempt = null;
const remoteFeeds = new Map();

function isCurrentPublication(attempt) {
  return publicationAttempt === attempt && !attempt.cancelled
    && attempt.session === sessionGeneration && attempt.handle === janusMcuPlugin;
}

function stopTracks(tracks) {
  for (const track of new Set(tracks)) {
    try {
      if (track.readyState !== 'ended') track.stop();
    } catch (error) {
      console.error('Could not release a media track', error);
    }
  }
}

function releaseRemoteFeed(entry) {
  if (entry.closed) return;
  entry.closed = true;
  if (remoteFeeds.get(entry.key) === entry) remoteFeeds.delete(entry.key);
  entry.stream?.getTracks().forEach(track => track.stop());
  entry.stream = null;
  entry.handle?.detach();
}

function removeRemoteFeed(id, roomId) {
  const entry = remoteFeeds.get(`${roomId}:${id}`);
  if (entry) releaseRemoteFeed(entry);
  destroyRemoteStream(id);
}


const closeBroadcast = ({ notifyInterruptedOffer = true } = {}) => {
  recovery.cancel();
  const attempt = publicationAttempt;
  const interrupted = attempt && attempt.phase !== 'published';
  const retiredHandle = attempt?.phase === 'offer' && attempt.handle === janusMcuPlugin
    ? attempt.handle : null;
  const streamHandle = attempt?.handle || janusMcuPlugin;
  if (retiredHandle) janusMcuPlugin = null;
  publicationAttempt = null;
  if (attempt) {
    attempt.cancelled = true;
    clearTimeout(attempt.timer);
  }
  const tracks = [...(attempt?.tracks || [])];
  // Stop all local media tracks to ensure camera/mic are released
  if (streamHandle?.webrtcStuff?.myStream) {
    tracks.push(...streamHandle.webrtcStuff.myStream.getTracks());
  }
  stopTracks(tracks);
  attempt?.tracks.clear();

  localMediaStream = null;
  destroyLocalStream(null);
  setMediaDeviceId(null, 'video');
  setMediaDeviceId(null, 'audio');
  if (interrupted) {
    setMediaSelectionModal(false);
    setMediaSelectionModalLoading(false);
  }
  if (retiredHandle) {
    // detach synchronously invokes oncleanup; identity and attempt are already
    // invalidated, so its callbacks cannot recurse or touch a later attempt.
    try {
      retiredHandle.detach();
    } catch (error) {
      console.error('Could not detach the interrupted publisher', error);
    }
    if (notifyInterruptedOffer && attempt.session === sessionGeneration) {
      addNotification({
        color: 'red', message: 'Broadcast preparation was interrupted. Refresh this page before trying again.', autoClose: false,
      });
    }
  }
};

const getServerEndpoints = () => axios.get('/api/janus/endpoints')
  .then((response) => response.data)
  .catch((err) => {
    const error = new Error();
    error.name = 'RequestError';
    if (err.response) {
      error.message = err.response.data || err.response.statusText;
      error.code = err.response.status;
    } else {
      error.message = err.message;
    }
    throw error;
  });

const getTurnCreds = () => axios.get('/api/turn/')
  .then((response) => response.data)
  .catch((err) => {
    const error = new Error();
    error.name = 'RequestError';
    if (err.response) {
      error.message = err.response.data || err.response.statusText;
      error.code = err.response.status;
    } else {
      error.message = err.message;
    }
    throw error;
  });

const getToken = () => axios.get('/api/janus/token')
  .then((response) => {
    if (!response.data || !response.data.token) {
      const error = new Error('missing authentication token');
      trackEvent('Error', 'Cam Util', error.name);
      throw error;
    }

    return response.data.token;
  })
  .catch((err) => {
    if (err.message === 'missing authentication token') {
      throw err;
    }
    const error = new Error();
    error.name = 'RequestError';
    if (err.response) {
      error.message = err.response.data || err.response.statusText;
      error.code = err.response.status;
    } else {
      error.message = err.message;
    }
    throw error;
  });

/**
 * gets janus endpoints and turn data
 * required to init a janus session
 * @param cb
 */
const getServerInfo = function getServerInfo(roomName, cb) {
  const data = {
    endpoints: null,
    turnData: [
      { urls: 'stun:stun.l.google.com:19302' },
    ],
  };

  Promise.all([
    getServerEndpoints(),
    getTurnCreds(),
    getToken(),
  ])
    .then(([endpoints, turnData, token]) => {
      data.endpoints = endpoints;

      turnData.uris.forEach((uri) => {
        data.turnData.push({
          urls: uri,
          username: turnData.username,
          credential: turnData.password,
        });
      });

      data.token = token;

      return cb(null, data);
    })
    .catch((err) => {
      console.error(err);
      trackEvent('Error', 'Cam Util', 'fetching requirements failed');
      let errorString;
      if (err.constructor() === 'Error') {
        errorString = err.toString();
      } else {
        try {
          errorString = JSON.stringify(err);
        } catch (e) {
          console.error(e);
        }
      }
      trackEvent('Error', 'Cam Util', `Fetch requirements: ${errorString}`);
      addNotification({
        color: 'red',
        message: 'Error connecting to media server',
        autoClose: false,
      });
      return cb(err);
    });
};

function finishPublicationAttempt(attempt) {
  if (!isCurrentPublication(attempt)) return;
  closeBroadcast({ notifyInterruptedOffer: false });
}

function failPublication(attempt, error) {
  if (!isCurrentPublication(attempt)) return;
  const preparingOffer = attempt.phase === 'offer';
  let message;
  if (preparingOffer) {
    message = 'Unable to prepare the broadcast. Refresh this page before trying again.';
  } else if (error?.name === 'TimeoutError') {
    message = 'Camera or microphone access timed out. Check the browser permission prompt and try again.';
  } else if (error?.name === 'NotAllowedError') {
    message = 'Camera or microphone permission was denied. Allow access in your browser and try again.';
  } else if (error?.name === 'NotReadableError') {
    message = 'Camera or microphone is unavailable. Close other apps using it and try again.';
  } else {
    message = 'Unable to broadcast. Check your camera and microphone and try again.';
  }
  console.error('Broadcast preparation failed:', error);
  finishPublicationAttempt(attempt);
  addNotification({ color: 'red', message, autoClose: false });
  trackEvent('Error', 'Cam Util', `Publish ${preparingOffer ? 'offer' : 'capture'}: ${String(error)}`);
}

function setPublicationDeadline(attempt, phase, duration) {
  clearTimeout(attempt.timer);
  attempt.phase = phase;
  attempt.timer = setTimeout(() => {
    const error = new Error(`Broadcast ${phase} timed out`);
    error.name = 'TimeoutError';
    failPublication(attempt, error);
  }, duration);
}

function captureOwnedStream(attempt, acquire) {
  let acquisition;
  // Invoke synchronously so screen sharing retains the click's user activation.
  try {
    acquisition = acquire();
  } catch (error) {
    return Promise.reject(error);
  }
  return Promise.resolve(acquisition).then((stream) => {
    if (!isCurrentPublication(attempt)) {
      stopTracks(stream.getTracks());
      return null;
    }
    for (const track of stream.getTracks()) {
      if (track.kind === 'audio') track.enabled = false;
      attempt.tracks.add(track);
    }
    return stream;
  });
}

async function publishOwnFeed(attempt, isGold, videoQuality, videoDevice, audioDevice, sendAudio) {
  // Transfer the working selection tracks before awaiting anything. Closing the
  // picker must no longer own (or stop) the tracks used by this publication.
  const selection = takeSelectionTracks(videoDevice, audioDevice);
  let { audioTrack, videoTrack } = selection;
  for (const track of [audioTrack, videoTrack].filter(Boolean)) attempt.tracks.add(track);
  const videoConstraints = isGold ? getVideoConstraints(videoQuality) : defaultVideoConstraints;
  const audio = audioDevice ? { deviceId: { exact: audioDevice } } : true;
  const needsAudio = !audioTrack;
  const needsVideo = Boolean(videoDevice) && !videoTrack;
  const captures = [selection.ready];
  setMediaSelectionModalLoading(true, needsAudio && needsVideo
    ? 'Waiting for camera and microphone…'
    : needsAudio ? 'Waiting for microphone…'
      : needsVideo ? 'Waiting for camera…' : 'Preparing selected devices…');
  if (videoDevice === 'screen') {
    // Start the native picker in the click's activation turn, before awaiting
    // configuration or microphone work. Keep an already selected mic alive.
    captures.push(captureOwnedStream(attempt, () => navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 15 }, audio: false,
    })).then((stream) => { if (stream) [videoTrack] = stream.getVideoTracks(); }));
    if (needsAudio) {
      captures.push(captureOwnedStream(attempt, () => navigator.mediaDevices.getUserMedia({ audio, video: false }))
        .then((stream) => { if (stream) [audioTrack] = stream.getAudioTracks(); }));
    }
  } else if (needsAudio || needsVideo) {
    // Request only missing kinds: changing the microphone must never reopen the
    // camera whose preview is already working (and vice versa).
    captures.push(captureOwnedStream(attempt, () => navigator.mediaDevices.getUserMedia({
      audio: needsAudio ? audio : false,
      video: needsVideo ? { deviceId: { exact: videoDevice }, ...videoConstraints } : false,
    })).then((stream) => {
      if (!stream) return;
      if (needsAudio) [audioTrack] = stream.getAudioTracks();
      if (needsVideo) [videoTrack] = stream.getVideoTracks();
    }));
  }
  await Promise.all(captures);
  if (!isCurrentPublication(attempt)) return;
  if (!audioTrack || audioTrack.readyState === 'ended'
    || (videoDevice && (!videoTrack || videoTrack.readyState === 'ended'))) {
    throw new Error('The selected media device returned no live track');
  }
  // PTT must be respected before negotiation can start sending audio.
  audioTrack.enabled = sendAudio;
  const tracks = [{ type: 'audio', capture: audioTrack, recv: false }];
  if (videoTrack) {
    tracks.push({
      type: 'video', capture: videoTrack, recv: false,
      simulcast: Boolean(isGold && videoQuality && videoQuality.id !== 'VIDEO_240'),
      ...(isGold ? { simulcastMaxBitrates: { high: videoQuality.bitRate, medium: 0, low: 128000 } } : {}),
    });
  }
  setPublicationDeadline(attempt, 'offer', 15000);
  setMediaSelectionModalLoading(true, 'Preparing broadcast…');
  attempt.handle.createOffer({
    tracks,
    success(jsep) {
      if (!isCurrentPublication(attempt) || attempt.phase !== 'offer') return;
      try {
        if (!jsep?.sdp) throw new Error('The browser returned no session description');
        if (!sendAudio) attempt.handle.muteAudio();
        attempt.handle.send({
          message: { request: 'configure', audio: true, video: Boolean(videoTrack), bitrate: isGold ? videoQuality.bitRate : undefined },
          jsep,
        });
        clearTimeout(attempt.timer);
        attempt.phase = 'published';
        sendUserBroadcastState(true);
        setMediaSelectionModal(false);
        setMediaSelectionModalLoading(false);
      } catch (error) {
        // Configuration and notification failures also require retiring a handle
        // that has already begun negotiation.
        attempt.phase = 'offer';
        failPublication(attempt, error);
      }
    },
    error(error) {
      failPublication(attempt, error);
    },
  });
}

export function cancelPublish() {
  cancelMediaSelection();
  const attempt = publicationAttempt;
  if (!attempt || attempt.phase === 'published') return;
  const preparingOffer = attempt.phase === 'offer';
  finishPublicationAttempt(attempt);
  if (preparingOffer) {
    addNotification({
      color: 'red', message: 'Broadcast preparation was cancelled. Refresh this page before trying again.', autoClose: false,
    });
  }
}


export function publish(isGold, videoQuality, videoDevice, audioDevice, sendAudio = false) {
  if (publicationAttempt?.phase === 'published') return;
  if (publicationAttempt) cancelPublish();
  if (!janusMcuPlugin) {
    console.error('Plugin is not initialized');
    trackEvent('Error', 'Cam Util', 'Plugin is not initialized');

    addNotification({
      color: 'red',
      message: 'Unable to broadcast, please refresh',
      autoClose: false,
    });

    closeBroadcast();
    setMediaSelectionModal(false);
    setMediaSelectionModalLoading(false);

    return;
  }

  const attempt = {
    session: sessionGeneration, handle: janusMcuPlugin, phase: 'capture',
    tracks: new Set(), cancelled: false, timer: null, videoExpected: Boolean(videoDevice),
  };
  publicationAttempt = attempt;
  setPublicationDeadline(attempt, 'capture', 30000);
  setMediaSelectionModalLoading(true, 'Waiting for camera and microphone…');
  publishOwnFeed(attempt, isGold, videoQuality, videoDevice, audioDevice, sendAudio)
    .catch(error => failPublication(attempt, error));
}

export function setAudioState(state) {
  if (!state) {
    janusMcuPlugin.muteAudio();
  } else {
    janusMcuPlugin.unmuteAudio();
  }
}

export function unpublishOwnFeed() {
  recovery.cancel();
  if (publicationAttempt && publicationAttempt.phase !== 'published') {
    cancelPublish();
    return;
  }
  if (!janusMcuPlugin) {
    closeBroadcast();
    return;
  }
  // Unpublish our stream
  const message = { request: 'unpublish' };
  janusMcuPlugin.send({ message });
  sendUserBroadcastState(false);

  // Tear down the PeerConnection and stop local media tracks immediately.
  // This ensures camera/mic are released even if Janus rejects the unpublish
  // (e.g. "Can't unpublish, not published" due to race conditions).
  // Without this, the WebRTC media continues streaming to subscribers.
  const handle = janusMcuPlugin;
  closeBroadcast();
  handle.hangup();
}

function checkVideoSupported() {
  const isSafari = Janus.webRTCAdapter.browserDetails.browser === 'safari';

  if (isSafari) {
    return Janus.safariVp8;
  }

  return true;
}

export function newRemoteFeed(id, roomId, userId, video, audio) {
  if (!janus) return;
  const key = `${roomId}:${id}`;
  const existing = remoteFeeds.get(key);
  if (existing) {
    const pc = existing.handle?.webrtcStuff?.pc;
    const ended = existing.handle?.detached
      || ['closed', 'failed'].includes(pc?.connectionState)
      || ['closed', 'failed'].includes(pc?.iceConnectionState);
    if (!ended) return;
    releaseRemoteFeed(existing);
  }
  // Publisher announcements can repeat during ICE renegotiation. Reserve the
  // feed before asynchronous attachment so pending requests are deduplicated too.
  const entry = { key, generation: sessionGeneration, handle: null, stream: null, closed: false };
  remoteFeeds.set(key, entry);
  const isCurrent = () => entry.generation === sessionGeneration && remoteFeeds.get(key) === entry && !entry.closed;
  // A new feed has been published, create a new plugin handle and attach to it as a listener
  let remoteFeed;
  janus.attach(
    {
      plugin: 'janus.plugin.videoroom',
      opaqueId: userId,
      success(pluginHandle) {
        if (!isCurrent()) {
          pluginHandle.detach();
          return;
        }
        remoteFeed = pluginHandle;
        entry.handle = pluginHandle;
        const videoSupported = checkVideoSupported();

        // We wait for the plugin to send us an offer
        const message = {
          request: 'join',
          room: roomId,
          ptype: 'subscriber',
          feed: id,
          offer_video: videoSupported,
        };

        if (!videoSupported) {
          addNotification({
            color: 'yellow',
            message: 'Video not supported, receiving audio only',
          });
        }

        remoteFeed.send({ message });
      },
      error(error) {
        if (!isCurrent()) return;
        releaseRemoteFeed(entry);
        console.error('Error attaching plugin... ', error);
        trackEvent('Error', 'Cam Util', `Error attaching plugin: ${error}`);

        addNotification({
          color: 'red',
          message: 'Error receiving broadcast',
        });
      },
      slowLink(uplink) {
        if (!isCurrent()) return;
        console.warn({ userId, uplink }, 'poor connection to remote feed');
      },
      onmessage(msg, jsep) {
        if (!isCurrent()) return;
        if (msg.error !== undefined && msg.error !== null) {
          releaseRemoteFeed(entry);
          trackEvent('Error', 'Cam Util', `Remote feed error: ${msg.error}`);
          addNotification({ color: 'red', message: 'Error receiving broadcast' });
          return;
        }
        const event = msg.videoroom;
        console.log({ ...msg });

        if (!!event && event === 'attached') {
          remoteFeed.rfid = msg.id;
        }

        if (msg.started === 'ok') {
          console.log('feed started');
        }

        if (msg.substream !== undefined) {
          console.log({ substream: msg.substream });

          const { allFeedsHd } = camStore.getState();

          if (allFeedsHd && msg.substream !== 2) {
            remoteFeed.send({
              message: {
                request: 'configure',
                substream: 2,
              },
            });
          }

          if (!allFeedsHd && msg.substream !== 0) {
            remoteFeed.send({
              message: {
                request: 'configure',
                substream: 0,
              },
            });
          }
        }

        if (jsep !== undefined && jsep !== null) {
          // Answer and attach
          remoteFeed.createAnswer(
            {
              jsep,
              media: {
                audioSend: false,
                videoSend: false,
              },
              success(jsep) {
                if (!isCurrent()) return;
                const message = { request: 'start', room: roomId };
                remoteFeed.send({ message, jsep });
              },

              error(error) {
                if (!isCurrent()) return;
                releaseRemoteFeed(entry);
                console.error('WebRTC error', error);
                trackEvent('Error', 'Cam Util', `Remote feed error: ${error}`);

                addNotification({
                  color: 'red',
                  message: 'Error receiving broadcast',
                });
              },
            },
          );
        }
      },

      webrtcState(on) {
        if (!isCurrent()) return;
        Janus.log(`Janus says this WebRTC PeerConnection (feed #${remoteFeed.rfindex}) is ${on ? 'up' : 'down'} now`);
        if (on) {
          setFeedLoading(userId, false);
        }
      },
      onremotetrack(track, mid, on) {
        if (!isCurrent()) {
          if (on) track.stop();
          return;
        }
        if (!on) {
          entry.stream?.removeTrack(track);
          return;
        }

        if (!entry.stream) {
          entry.stream = new MediaStream();
        }
        entry.stream.addTrack(track);

        let userClosed = false;
        const { camsDisabled } = camStore.getState();
        if (camsDisabled) {
          userClosed = true;
        }

        addRemoteStream({
          janusId: id,
          stream: entry.stream,
          remoteFeed,
          roomId,
          userId,
          userClosed,
          token: uuid(),
          video,
          audio,
        });
      },
      oncleanup() {
        releaseRemoteFeed(entry);
      },
      ondetached() {
        releaseRemoteFeed(entry);
      },
    },
  );
}

function reconnectFailed() {
  addNotification({
    color: 'red',
    message: 'Unable to reconnect to media server',
    autoClose: false,
  });

  unpublishOwnFeed();
  return closeBroadcast();
}

const recovery = createMediaRecovery({
  onStart: () => addNotification({
    color: 'yellow', message: 'Attempting to reconnect to media server',
  }),
  onFailure: reconnectFailed,
});

function reconnect() {
  recovery.start((success, error) => janus.reconnect({ success, error }), () => {
    addNotification({ color: 'blue', message: 'Reconnected to media server' });
    resumeAllRemoteStreams();
  });
}

function recoverOffer(options) {
  recovery.start((success, error) => {
    janusMcuPlugin.createOffer({ ...options, success, error });
  }, (jsep) => {
    janusMcuPlugin.send({ message: { request: 'configure', audio: true, video: true }, jsep });
    addNotification({ color: 'blue', message: 'Connection to media server restored' });
  });
}

function renegotiate() {
  recoverOffer({ tracks: [] });
}

function restartIce() {
  recoverOffer({ iceRestart: true, tracks: [] });
}

export function destroy() {
  cancelMediaSelection();
  sessionGeneration += 1;
  for (const entry of remoteFeeds.values()) releaseRemoteFeed(entry);
  remoteFeeds.clear();
  recovery.cancel();
  clearTimeout(slowlinkTimeout);
  slowlinkTimeout = null;
  closeBroadcast();
  const previous = janus;
  janus = null;
  janusMcuPlugin = null;
  if (previous) previous.destroy();
}

export function init(roomId, roomName, userId, cb = () => {}) {
  destroy();
  const currentSession = sessionGeneration;
  getServerInfo(roomName, (err, info) => {
    if (currentSession !== sessionGeneration) return;
    if (err) {
      console.error('error getting sever endpoints');
      addNotification({
        color: 'red',
        message: 'Error connecting to media server',
        autoClose: false,
      });
      return;
    }

    const { endpoints, turnData, token } = info;

    Janus.init({
      debug: process.env.NODE_ENV === 'production' ? 'error' : 'all',
      dependencies: Janus.useDefaultDependencies({ adapter }),
      callback() {
        if (currentSession !== sessionGeneration) return;
        if (!Janus.isWebrtcSupported()) {
          console.warn('No WebRTC support... ');
          addNotification({
            color: 'red',
            message: 'Broadcasting is not supported on this browser',
            autoClose: false,
          });
          return;
        }

        // Create session
        janus = new Janus({
          server: endpoints,
          iceServers: turnData,
          token,
          keepAlivePeriod: 25000,
          success() {
            if (currentSession !== sessionGeneration) return;
            let publisherHandle = null;
            const isCurrentPublisher = () => currentSession === sessionGeneration
              && publisherHandle === janusMcuPlugin;
            // Attach to video MCU test plugin
            janus.attach({
              plugin: 'janus.plugin.videoroom',
              token,
              success(pluginHandle) {
                if (currentSession !== sessionGeneration) {
                  pluginHandle.detach();
                  return;
                }
                publisherHandle = pluginHandle;
                janusMcuPlugin = pluginHandle;
                const message = {
                  request: 'join',
                  room: roomId,
                  ptype: 'publisher',
                  display: userId,
                };

                janusMcuPlugin.send({ message });

                // callback to indicate janus is initialized
                cb(null, true);
              },

              error(error) {
                if (!isCurrentPublisher()) return;
                console.error('  -- Error attaching plugin... ', error);
                trackEvent('Error', 'Cam Util', `error attaching plugin: ${error}`);
                addNotification({
                  color: 'red',
                  message: 'Error connecting to media server',
                  autoClose: false,
                });

                cb(error);
              },

              consentDialog(on) {
                if (!isCurrentPublisher()) return;
                console.log(`Consent dialog should be ${(on ? 'on' : 'off')} now`);
              },

              iceState(state) {
                if (!isCurrentPublisher()) return;
                if (state === 'disconnected') {
                  trackEvent('Error', 'Cam Util', 'ice disconnected');
                }

                if (state === 'failed') {
                  trackEvent('Error', 'Cam Util', 'ice failed');
                  restartIce();
                }
              },
              webrtcState(connected, reason) {
                if (!isCurrentPublisher()) return;
                console.log('::: peer connection established?', connected);
                if (connected) {
                  janusMcuPlugin.send({ message: { request: 'configure' } });
                } else {
                  console.error({ connected, reason });
                }
              },
              slowLink() {
                if (!isCurrentPublisher()) return;
                if (!slowlinkTimeout) {
                  trackEvent('Cams', 'Slow link');
                  addNotification({
                    color: 'yellow',
                    message: 'Poor connection to media server',
                  });

                  slowlinkTimeout = setTimeout(() => {
                    slowlinkTimeout = null;
                  }, 1000 * 60 * 5);
                }
              },
              mediaState(type, on) {
                if (!isCurrentPublisher()) return;
                console.log('::: mediaState :::', type, on);
                if (type === 'video' && !on) {
                  renegotiate();
                  addNotification({
                    color: 'yellow',
                    message: 'Losing media server connection',
                  });
                }
              },

              onmessage(msg, jsep) {
                if (!isCurrentPublisher()) return;
                const event = msg.videoroom;

                if (event !== undefined && event !== null) {
                  if (event === 'joined') {
                    // Publisher/manager created, negotiate WebRTC and attach
                    // to existing feeds, if any

                    addNotification({
                      color: 'blue',
                      message: 'Connected to media server',
                    });

                    // Any new feed to attach to?
                    if (msg.publishers !== undefined && msg.publishers !== null) {
                      msg.publishers.forEach((publisher) => {
                        const video = publisher.video_codec;
                        const audio = publisher.audio_codec;
                        newRemoteFeed(publisher.id, roomId, publisher.display, video, audio);
                      });
                    }
                  }

                  if (event === 'destroyed') {
                    // The room has been destroyed
                    console.log('The room has been destroyed!');
                    trackEvent('Error', 'Cam Util', 'room was destroyed');
                    addNotification({
                      color: 'red',
                      message: 'Media server connection lost, refresh required',
                      autoClose: false,
                    });
                  }

                  if (event === 'event') {
                    // Any new feed to attach to?
                    if (msg.publishers !== undefined && msg.publishers !== null) {
                      msg.publishers.forEach((publisher) => {
                        const video = publisher.video_codec;
                        const audio = publisher.audio_codec;
                        newRemoteFeed(publisher.id, roomId, publisher.display, video, audio);
                      });
                    }

                    if (msg.unpublished !== undefined && msg.unpublished !== null) {
                      console.log('remote feed unpublished', msg);
                      // One of the publishers has unpublished?
                      removeRemoteFeed(msg.unpublished, roomId);
                    }

                    if (msg.error !== undefined && msg.error !== null) {
                      console.error(msg.error);
                      trackEvent('Error', 'Cam Util', `Error message from janus: ${msg.error}`);
                      if (msg.error.match(/^No such room/)) {
                        addNotification({
                          color: 'red',
                          message: 'Media connection lost, refresh required',
                          autoClose: false,
                        });
                      } else {
                        addNotification({
                          color: 'red',
                          message: 'Media server error',
                          autoClose: false,
                        });
                      }
                      closeBroadcast();
                    }
                  }
                }

                if (jsep !== undefined && jsep !== null) {
                  janusMcuPlugin.handleRemoteJsep({ jsep });
                }
              },

              onlocaltrack(track, on) {
                if (!on) return;
                const attempt = publicationAttempt;
                if (!isCurrentPublisher() || !attempt || !isCurrentPublication(attempt)
                  || !attempt.tracks.has(track)) {
                  stopTracks([track]);
                  return;
                }
                if (!localMediaStream) {
                  localMediaStream = new MediaStream();
                }
                localMediaStream.addTrack(track);
                // Only notify the store once we have the video track,
                // so the feed is created with video: true.
                // Audio track arrives first and would set video: false
                // permanently since the store ignores subsequent calls.
                if (track.kind === 'video' || !attempt.videoExpected) {
                  addLocalStream({ stream: localMediaStream, token: uuid(), isLocal: true });
                }
              },

              oncleanup() {
                if (!isCurrentPublisher()) return;
                closeBroadcast();
              },
            });
          },

          error(error) {
                if (currentSession !== sessionGeneration) return;
            console.error('Janus error', error);
            trackEvent('Error', 'Cam Util', `Media server error: ${error}`);
            addNotification({
              color: 'yellow',
              message: 'Media connection lost',
              autoClose: true,
            });
            reconnect();
          },
        });
      },
    });
  });
}
