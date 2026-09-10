import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, describe, it, expect, vi } from 'vitest';
import RoomChatShare from './RoomChatShare.react';
import { addNotification } from '../../../actions/NotificationActions';
vi.mock('../../../actions/NotificationActions', () => ({ addNotification: vi.fn() }));

describe('room sharing', () => {
  const browserAPIs = [
    [navigator, 'share'],
    [navigator, 'clipboard'],
    [document, 'execCommand'],
  ].map(([object, key]) => ({ object, key, descriptor: Object.getOwnPropertyDescriptor(object, key) }));

  afterEach(() => {
    browserAPIs.forEach(({ object, key, descriptor }) => {
      if (descriptor) Object.defineProperty(object, key, descriptor);
      else delete object[key];
    });
  });

  it('shares the room URL with the native share API', async () => {
    const share = vi.fn().mockResolvedValue(); Object.defineProperty(navigator, 'share', { configurable: true, value: share });
    render(<RoomChatShare roomName="friends" />); expect(screen.getByRole('textbox')).toHaveValue('jumpin.chat/friends');
    fireEvent.click(screen.getByRole('button'));
    expect(share).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://jumpin.chat/friends' }));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' })));
  });
  it('copies the room URL with the async clipboard when sharing is unavailable', async () => {
    delete navigator.share;
    const writeText = vi.fn().mockResolvedValue();
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<RoomChatShare roomName="friends" />);
    fireEvent.click(screen.getByRole('button'));
    expect(writeText).toHaveBeenCalledWith('https://jumpin.chat/friends');
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith(expect.objectContaining({ color: 'green' })));
  });

  it('reports a clipboard failure', async () => {
    delete navigator.share;
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } });
    render(<RoomChatShare roomName="friends" />);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(addNotification).toHaveBeenCalledWith(expect.objectContaining({ color: 'yellow' })));
  });

  it('copies the full selected URL with the fallback and restores the display, focus and selection', () => {
    delete navigator.share;
    delete navigator.clipboard;
    let copiedText;
    const execCommand = vi.fn(() => {
      const selectedInput = document.activeElement;
      copiedText = selectedInput.value.slice(selectedInput.selectionStart, selectedInput.selectionEnd);
      return true;
    });
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand });
    render(<RoomChatShare roomName="friends" />);
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button');
    input.setSelectionRange(2, 8, 'backward');
    button.focus();

    fireEvent.click(button);

    expect(execCommand).toHaveBeenCalledWith('copy');
    expect(copiedText).toBe('https://jumpin.chat/friends');
    expect(input).toHaveValue('jumpin.chat/friends');
    expect([input.selectionStart, input.selectionEnd, input.selectionDirection]).toEqual([2, 8, 'backward']);
    expect(button).toHaveFocus();
    expect(addNotification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ color: 'green' }));
  });

  it.each([
    ['returns false', () => false],
    ['throws', () => { throw new Error('copy denied'); }],
    ['is unavailable', undefined],
  ])('reports failure and preserves the input when the fallback %s', (name, copy) => {
    delete navigator.share;
    delete navigator.clipboard;
    Object.defineProperty(document, 'execCommand', { configurable: true, value: copy });
    render(<RoomChatShare roomName="friends" />);
    const input = screen.getByRole('textbox');
    const button = screen.getByRole('button');
    input.setSelectionRange(1, 4);
    button.focus();

    fireEvent.click(button);

    expect(input).toHaveValue('jumpin.chat/friends');
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4]);
    expect(button).toHaveFocus();
    expect(addNotification).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ color: 'yellow' }));
  });
});
