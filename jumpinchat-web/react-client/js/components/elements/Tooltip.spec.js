import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import Tooltip from './Tooltip.react';

describe('tooltip accessibility', () => {
  it('describes a focused control and dismisses with Escape', async () => {
    const ref = React.createRef(); render(<Tooltip ref={ref} text="Mute audio"><button>Volume</button></Tooltip>);
    const button = screen.getByRole('button', { name: 'Volume' }); expect(ref.current).toBe(button); fireEvent.focus(button);
    const tooltip = await screen.findByRole('tooltip'); expect(tooltip).toHaveTextContent('Mute audio'); expect(button).toHaveAttribute('aria-describedby', tooltip.id);
    fireEvent.keyDown(button, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
  });
  it('cancels a pending tooltip when its trigger is removed', async () => {
    const { unmount } = render(<Tooltip text="Removed"><button>Trigger</button></Tooltip>); fireEvent.focus(screen.getByRole('button')); unmount();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
