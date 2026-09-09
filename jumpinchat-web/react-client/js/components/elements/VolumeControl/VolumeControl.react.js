import React, { forwardRef } from 'react';

const VolumeControl = forwardRef(({ volume, onChangeVolume }, ref) => (
  <div className="cams__VolumeSlider" onClick={event => event.stopPropagation()} ref={ref}>
    <input
      aria-label="Volume"
      aria-valuetext={`${volume}%`}
      className="volume-range"
      type="range"
      min="0"
      max="100"
      step="1"
      value={volume}
      onChange={event => onChangeVolume(Number(event.target.value))}
    />
  </div>
));

export default VolumeControl;
