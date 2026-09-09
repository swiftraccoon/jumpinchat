import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import PmListItemOptions from './PmListItemOptions.react';
const props = { handle: 'Bob', userListId: 'bob', onOpenMenu: vi.fn(), handleClickOutside: vi.fn(), closeConversation: vi.fn() };

describe('private conversation menu', () => {
  it('portals the open menu and closes only the selected conversation', () => {
    const { container } = render(<PmListItemOptions {...props} menuOpen="bob" />);
    const close = screen.getByRole('button', { name: 'Close conversation' }); expect(container).not.toContainElement(close);
    fireEvent.click(close); expect(props.closeConversation).toHaveBeenCalledWith('bob');
  });
  it('dismisses with Escape and returns focus to its trigger', async () => {
    const { container } = render(<PmListItemOptions {...props} menuOpen="bob" />);
    const trigger = container.querySelector('button');
    fireEvent.keyDown(document, { key: 'Escape' }); expect(props.handleClickOutside).toHaveBeenCalled();
    await waitFor(() => expect(trigger).toHaveFocus());
  });
  it('ignores pointer events inside the menu and dismisses outside it', () => {
    render(<PmListItemOptions {...props} menuOpen="bob" />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Close conversation' })); expect(props.handleClickOutside).not.toHaveBeenCalled();
    fireEvent.pointerDown(document.body); expect(props.handleClickOutside).toHaveBeenCalledOnce();
  });
});
