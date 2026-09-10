/* global window */

const DEFAULTS = {
  interval: 100,
  threshold: -50,
  history: 10,
  smoothing: 0.1,
  fftSize: 512,
};

function maxVolume(analyser, bins) {
  analyser.getFloatFrequencyData(bins);
  let max = -Infinity;

  // Skip the lowest bins, which carry DC offset and rumble.
  for (let i = 4; i < bins.length; i += 1) {
    if (bins[i] > max && bins[i] < 0) {
      max = bins[i];
    }
  }

  return max;
}

/**
 * Sample the loudness of a MediaStream with an AnalyserNode. Emits
 * `volume_change` (decibels, -100..0; -Infinity when silent) every
 * `interval` ms plus `speaking`/`stopped_speaking` transitions around
 * `threshold`. Call `stop()` to release the audio graph.
 */
export default function createAudioLevelMonitor(stream, options = {}) {
  const {
    interval, threshold, history, smoothing, fftSize,
  } = { ...DEFAULTS, ...options };
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  const audioContext = options.audioContext || new AudioContextCtor();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = fftSize;
  analyser.smoothingTimeConstant = smoothing;
  const bins = new Float32Array(analyser.frequencyBinCount);
  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyser);

  const listeners = new Map();
  const speakingHistory = new Array(history).fill(0);
  let speaking = false;
  let running = true;
  let timer = null;

  const emit = (event, ...args) => {
    (listeners.get(event) || []).forEach(listener => listener(...args));
  };

  const tick = () => {
    if (!running) {
      return;
    }

    const volume = maxVolume(analyser, bins);
    emit('volume_change', volume, threshold);

    const recent = speakingHistory.slice(-3).reduce((sum, value) => sum + value, 0);
    if (volume > threshold && !speaking && recent >= 2) {
      speaking = true;
      emit('speaking');
    } else if (volume < threshold && speaking && recent === 0) {
      speaking = false;
      emit('stopped_speaking');
    }

    speakingHistory.shift();
    speakingHistory.push(volume > threshold ? 1 : 0);
    timer = setTimeout(tick, interval);
  };

  timer = setTimeout(tick, interval);

  const monitor = {
    on(event, listener) {
      listeners.set(event, [...(listeners.get(event) || []), listener]);
      return monitor;
    },
    off(event, listener) {
      listeners.set(event, (listeners.get(event) || []).filter(item => item !== listener));
      return monitor;
    },
    stop() {
      if (!running) {
        return;
      }

      running = false;
      clearTimeout(timer);
      emit('volume_change', -100, threshold);
      if (speaking) {
        speaking = false;
        emit('stopped_speaking');
      }
      analyser.disconnect();
      source.disconnect();
    },
  };

  return monitor;
}
