import { describe, it, expect, vi, afterEach } from 'vitest';
import createAudioLevelMonitor from './audioLevel';

function fakeAudioContext(levels) {
  const analyser = {
    frequencyBinCount: 8,
    disconnect: vi.fn(),
    getFloatFrequencyData: vi.fn((bins) => { bins.set(levels.shift() || bins); }),
  };
  const source = { connect: vi.fn(), disconnect: vi.fn() };
  return {
    analyser,
    source,
    audioContext: { createAnalyser: () => analyser, createMediaStreamSource: vi.fn(() => source) },
  };
}

describe('createAudioLevelMonitor', () => {
  afterEach(() => vi.useRealTimers());

  it('reports the loudest bin above the low-frequency cutoff on every interval', () => {
    vi.useFakeTimers();
    const { audioContext, analyser, source } = fakeAudioContext([
      [-10, -10, -10, -10, -80, -30, -60, 0],
      [-100, -100, -100, -100, -100, -100, -100, -100],
    ]);
    const stream = { id: 'stream' };
    const monitor = createAudioLevelMonitor(stream, { interval: 250, audioContext });
    const volumes = [];
    monitor.on('volume_change', (volume, threshold) => volumes.push([volume, threshold]));

    expect(audioContext.createMediaStreamSource).toHaveBeenCalledWith(stream);
    expect(source.connect).toHaveBeenCalledWith(analyser);
    expect(analyser.fftSize).toBe(512);

    vi.advanceTimersByTime(250);
    expect(volumes).toEqual([[-30, -50]]);
    vi.advanceTimersByTime(250);
    expect(volumes[1]).toEqual([-100, -50]);
  });

  it('emits speaking transitions around the threshold', () => {
    vi.useFakeTimers();
    const loud = new Array(8).fill(-20);
    const quiet = new Array(8).fill(-90);
    const { audioContext } = fakeAudioContext([loud, loud, loud, loud, quiet, quiet, quiet, quiet]);
    const monitor = createAudioLevelMonitor({}, { interval: 100, audioContext });
    const events = [];
    monitor.on('speaking', () => events.push('speaking')).on('stopped_speaking', () => events.push('stopped'));

    vi.advanceTimersByTime(400);
    expect(events).toEqual(['speaking']);
    vi.advanceTimersByTime(400);
    expect(events).toEqual(['speaking', 'stopped']);
  });

  it('stops sampling, reports silence and disconnects the graph', () => {
    vi.useFakeTimers();
    const { audioContext, analyser, source } = fakeAudioContext([new Array(8).fill(-20)]);
    const monitor = createAudioLevelMonitor({}, { interval: 100, audioContext });
    const volumes = [];
    const listener = volume => volumes.push(volume);
    monitor.on('volume_change', listener);
    vi.advanceTimersByTime(100);
    monitor.stop();
    monitor.stop();
    vi.advanceTimersByTime(500);

    expect(volumes).toEqual([-20, -100]);
    expect(analyser.disconnect).toHaveBeenCalledTimes(1);
    expect(source.disconnect).toHaveBeenCalledTimes(1);
    monitor.off('volume_change', listener);
  });
});
