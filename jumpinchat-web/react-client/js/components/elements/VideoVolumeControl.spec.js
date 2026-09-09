import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import VideoVolumeControl from './VideoVolumeControl.react';

describe('video volume', () => {
  it('mutes and restores volume from the button', () => {
    const change = vi.fn(); const props = { onChange: change, onSetControl: vi.fn(), showControl: false };
    const { rerender } = render(<VideoVolumeControl {...props} volume={70} />);
    fireEvent.click(screen.getByRole('button')); expect(change).toHaveBeenLastCalledWith(0);
    rerender(<VideoVolumeControl {...props} volume={0} />);
    fireEvent.click(screen.getByRole('button')); expect(change).toHaveBeenLastCalledWith(100);
  });
  it('uses an accessible native slider and reports numeric values', () => {
    const change = vi.fn(); render(<VideoVolumeControl volume={35} showControl onChange={change} onSetControl={vi.fn()} />);
    const slider = screen.getByRole('slider', { name: 'Volume' }); expect(slider).toHaveValue('35');
    fireEvent.change(slider, { target: { value: '64' } }); expect(change).toHaveBeenCalledWith(64);
  });
  it('opens the control for keyboard focus', () => {
    const setControl = vi.fn(); render(<VideoVolumeControl volume={35} showControl={false} onChange={vi.fn()} onSetControl={setControl} />);
    fireEvent.focus(screen.getByRole('button')); expect(setControl).toHaveBeenCalledWith(expect.anything(), true);
  });
});
