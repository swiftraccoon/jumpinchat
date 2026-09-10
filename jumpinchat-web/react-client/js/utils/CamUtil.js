/**
 * Created by Zaccary on 09/09/2015.
 */

/* global MediaStream */

import uuid from './uuid';
import axios from 'axios';
import Janus from 'janus-gateway';
import adapter from 'webrtc-adapter';
import createMediaRecovery from './mediaRecovery';
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


const closeBroadcast = () => {
  recovery.cancel();
  // Stop all local media tracks to ensure camera/mic are released
  if (janusMcuPlugin && janusMcuPlugin.webrtcStuff && janusMcuPlugin.webrtcStuff.myStream) {
    const tracks = janusMcuPlugin.webrtcStuff.myStream.getTracks();
    tracks.forEach(track => track.stop());
  }

  localMediaStream = null;
  destroyLocalStream(null);
  setMediaDeviceId(null, 'video');
  setMediaDeviceId(null, 'audio');
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

function publishOwnFeed(isGold, videoQuality, videoDevice, audioDevice, sendAudio = false) {
  const currentSession = sessionGeneration;
  // Publish our stream
  console.log('publish own feed', { isGold, videoQuality });
  let media = {
    audioRecv: false,
    videoRecv: false,
    audioSend: true,
    videoSend: false,
  };

  if (videoDevice) {
    media = {
      ...media,
      videoSend: true,
      video: {
        deviceId: {
          exact: videoDevice,
        },
        ...defaultVideoConstraints,
      },
    };
  }

  if (isGold) {
    media.video = {
      ...media.video,
      ...getVideoConstraints(videoQuality),
    };
  }

  if (videoDevice === 'screen') {
    media = {
      ...media,
      video: 'screen',
      screenshareFrameRate: 15,
    };
  } else {
    media = {
      ...media,
      audio: {
        deviceId: {
          exact: audioDevice,
        },
      },
    };
  }

  let simulcastMaxBitrates;

  if (isGold) {
    simulcastMaxBitrates = {
      high: videoQuality.bitRate,
      medium: 0,
      low: 128000,
    };
  }

  const shouldSimulcast = videoQuality
    && videoQuality.id !== 'VIDEO_240'
    && isGold;

  janusMcuPlugin.createOffer(
    {
      media,
      simulcast: shouldSimulcast,
      simulcastMaxBitrates,
      // Publishers are sendonly
      success(jsep) {
        if (currentSession !== sessionGeneration) return;
        const message = {
          request: 'configure',
          audio: true,
          video: true,
          bitrate: isGold ? videoQuality.bitRate : undefined,
        };

        janusMcuPlugin.send({ message, jsep });

        if (!sendAudio) {
          janusMcuPlugin.muteAudio();
        }

        sendUserBroadcastState(true);

        // because screensharing is weird and
        // uses built-in browser selection windows
        setMediaSelectionModal(false);
        setMediaSelectionModalLoading(false);
      },

      error(err) {
        if (currentSession !== sessionGeneration) return;
        console.error('WebRTC error:', err);
        try {
          const message = err && err.name === 'NotAllowedError'
            ? 'Camera or microphone permission was denied. Allow access in your browser and try again.'
            : err && err.name === 'NotReadableError'
              ? 'Camera or microphone is unavailable. Close other apps using it and try again.'
              : 'Unable to broadcast. Check your camera and microphone and try again.';
          addNotification({ color: 'red', message, autoClose: false });
          trackEvent('Error', 'Cam Util', `Create offer: ${String(err)}`);
        } finally {
          setMediaSelectionModal(false);
          setMediaSelectionModalLoading(false);
          closeBroadcast();
        }
      },
    },
  );
}


export function publish(isGold, videoQuality, videoDevice, audioDevice, sendAudio = false) {
  if (!janusMcuPlugin) {
    console.error('Plugin is not initialized');
    trackEvent('Error', 'Cam Util', 'Plugin is not initialized');

    addNotification({
      color: 'red',
      message: 'Unable to broadcast, please refresh',
      autoClose: false,
    });

    closeBroadcast();

    return;
  }

  publishOwnFeed(isGold, videoQuality, videoDevice, audioDevice, sendAudio);
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
  janusMcuPlugin.hangup();
}

function checkVideoSupported() {
  const isSafari = Janus.webRTCAdapter.browserDetails.browser === 'safari';

  if (isSafari) {
    return Janus.safariVp8;
  }

  return true;
}

export function newRemoteFeed(id, roomId, userId, video, audio) {
  // A new feed has been published, create a new plugin handle and attach to it as a listener
  let remoteFeed;
  let remoteStream = null;
  janus.attach(
    {
      plugin: 'janus.plugin.videoroom',
      opaqueId: userId,
      success(pluginHandle) {
        remoteFeed = pluginHandle;
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
        console.error('Error attaching plugin... ', error);
        trackEvent('Error', 'Cam Util', `Error attaching plugin: ${error}`);

        addNotification({
          color: 'red',
          message: 'Error receiving broadcast',
        });
      },
      slowLink(uplink) {
        console.warn({ userId, uplink }, 'poor connection to remote feed');
      },
      onmessage(msg, jsep) {
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
                const message = { request: 'start', room: roomId };
                remoteFeed.send({ message, jsep });
              },

              error(error) {
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
        Janus.log(`Janus says this WebRTC PeerConnection (feed #${remoteFeed.rfindex}) is ${on ? 'up' : 'down'} now`);
        if (on) {
          setFeedLoading(userId, false);
        }
      },
      onremotetrack(track, mid, on) {
        if (!on) return;

        if (!remoteStream) {
          remoteStream = new MediaStream();
        }
        remoteStream.addTrack(track);

        let userClosed = false;
        const { camsDisabled } = camStore.getState();
        if (camsDisabled) {
          userClosed = true;
        }

        addRemoteStream({
          janusId: id,
          stream: remoteStream,
          remoteFeed,
          roomId,
          userId,
          userClosed,
          token: uuid(),
          video,
          audio,
        });
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
  recoverOffer({ media: { video: false, audio: false } });
}

function restartIce() {
  recoverOffer({ iceRestart: true, media: {} });
}

export function destroy() {
  sessionGeneration += 1;
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
            // Attach to video MCU test plugin
            janus.attach({
              plugin: 'janus.plugin.videoroom',
              token,
              success(pluginHandle) {
                if (currentSession !== sessionGeneration) {
                  pluginHandle.detach();
                  return;
                }
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
                if (currentSession !== sessionGeneration) return;
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
                console.log(`Consent dialog should be ${(on ? 'on' : 'off')} now`);
              },

              iceState(state) {
                if (currentSession !== sessionGeneration) return;
                if (state === 'disconnected') {
                  trackEvent('Error', 'Cam Util', 'ice disconnected');
                }

                if (state === 'failed') {
                  trackEvent('Error', 'Cam Util', 'ice failed');
                  restartIce();
                }
              },
              webrtcState(connected, reason) {
                if (currentSession !== sessionGeneration) return;
                console.log('::: peer connection established?', connected);
                if (connected) {
                  janusMcuPlugin.send({ message: { request: 'configure' } });
                } else {
                  console.error({ connected, reason });
                }
              },
              slowLink() {
                if (currentSession !== sessionGeneration) return;
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
                if (currentSession !== sessionGeneration) return;
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
                if (currentSession !== sessionGeneration) return;
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
                      destroyRemoteStream(msg.unpublished);
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
                if (currentSession !== sessionGeneration) return;
                if (!on) return;
                if (!localMediaStream) {
                  localMediaStream = new MediaStream();
                }
                localMediaStream.addTrack(track);
                // Only notify the store once we have the video track,
                // so the feed is created with video: true.
                // Audio track arrives first and would set video: false
                // permanently since the store ignores subsequent calls.
                if (track.kind === 'video') {
                  addLocalStream({ stream: localMediaStream, token: uuid(), isLocal: true });
                }
              },

              oncleanup() {
                if (currentSession !== sessionGeneration) return;
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
