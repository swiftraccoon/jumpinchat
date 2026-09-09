import React, { useState } from 'react';
import Modal from 'react-modal';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

function SettingsDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open settings</button>
      <Modal isOpen={open} contentLabel="Settings" onRequestClose={() => setOpen(false)}>
        <button type="button" onClick={() => setOpen(false)}>Close settings</button>
      </Modal>
    </>
  );
}

describe('React 19 modal integration', () => {
  it('hides background content while open and restores trigger focus after Escape', async () => {
    const app = document.querySelector('#app-root');
    render(<SettingsDialog />, { container: app });
    const trigger = screen.getByRole('button', { name: 'Open settings' });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(app).toHaveAttribute('aria-hidden', 'true');
    fireEvent.keyDown(dialog, { key: 'Escape', code: 'Escape', keyCode: 27 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(app).not.toHaveAttribute('aria-hidden');
    expect(trigger).toHaveFocus();
  });

  it('removes an open portal on unmount and can open another dialog', () => {
    const first = render(<SettingsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('dialog')).toBeVisible();
    first.unmount();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('#app-root')).not.toHaveAttribute('aria-hidden');
    render(<SettingsDialog />);
    fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
