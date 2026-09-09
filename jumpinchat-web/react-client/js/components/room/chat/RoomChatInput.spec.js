import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { RoomChatInput } from './RoomChatInput.react';
import { sendMessage } from '../../../utils/RoomAPI';
import * as actions from '../../../actions/ChatActions';
import { searchEmoji } from '../../../utils/emoji';
vi.mock('../../../utils/RoomAPI', () => ({ sendMessage: vi.fn() }));
vi.mock('../../../utils/emoji', () => ({ searchEmoji: vi.fn().mockResolvedValue([]) }));
vi.mock('../../../actions/ChatActions', () => ({ setChatInputValue: vi.fn(), restoreMessage: vi.fn(), setEmojiPicker: vi.fn(), insertEmoji: vi.fn(), setEmojiSearch: vi.fn(), setSelectedEmojiResult: vi.fn() }));
vi.mock('./EmojiPicker/EmojiPicker.react', () => ({ default: () => <button type="button">Emoji picker</button> }));
vi.mock('./EmojiPicker/EmojiPredict.react', () => ({ default: ({ emojis, onSelect }) => <div>{emojis.map(emoji => <button type="button" key={emoji.id} onClick={() => onSelect(emoji)}>{emoji.colons}</button>)}</div> }));

function Composer({ initialValue = '', hasHandle = true, ...props }) {
  const [value, setValue] = useState(initialValue);
  actions.setChatInputValue.mockImplementation(setValue);
  return <RoomChatInput room="room" users={[{ handle: 'Alice' }, { handle: 'Alison' }]} roleState={{ roles: [] }} userState={{ user: { hasChangedHandle: hasHandle } }} chatInputValue={value} customEmoji={[]} emojiPickerOpen={false} emojiSearch={{ results: [], query: null, selected: 0 }} {...props} />;
}

describe('chat composer', () => {
  it('sends trimmed text and clears the field after submission', async () => {
    render(<Composer />); const user = userEvent.setup(); const input = screen.getByPlaceholderText('Start typing');
    await user.type(input, '  Hello room  '); fireEvent.submit(input.closest('form'));
    expect(sendMessage).toHaveBeenCalledWith('Hello room', 'room'); expect(input).toHaveValue('');
  });
  it('does not send whitespace or messages before choosing a handle', () => {
    const { rerender } = render(<Composer initialValue="   " />); fireEvent.submit(screen.getByRole('textbox').closest('form')); expect(sendMessage).not.toHaveBeenCalled();
    rerender(<Composer key="guest" initialValue="Hello" hasHandle={false} />); fireEvent.submit(screen.getByRole('textbox').closest('form')); expect(sendMessage).not.toHaveBeenCalled();
  });
  it('cycles matching participant names with Tab', () => {
    render(<Composer initialValue="@Al" />); const input = screen.getByRole('textbox');
    fireEvent.keyDown(input, { key: 'Tab', keyCode: 9 }); expect(input).toHaveValue('@Alice: ');
    fireEvent.keyDown(input, { key: 'Tab', keyCode: 9 }); expect(input).toHaveValue('@Alison: ');
    fireEvent.keyDown(input, { key: 'Tab', keyCode: 9 }); expect(input).toHaveValue('@Alice: ');
  });
  it('rejects stale emoji search results after another query or Escape', async () => {
    let resolveFirst; let resolveSecond;
    searchEmoji.mockReturnValueOnce(new Promise(resolve => { resolveFirst = resolve; })).mockReturnValueOnce(new Promise(resolve => { resolveSecond = resolve; }));
    render(<Composer />); const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: ':sm' } }); fireEvent.change(input, { target: { value: ':he' } });
    const heart = { id: 'heart', colons: ':heart:' }; await act(async () => resolveSecond([heart]));
    expect(actions.setEmojiSearch).toHaveBeenLastCalledWith([heart], 'he');
    await act(async () => resolveFirst([{ id: 'smile' }])); expect(actions.setEmojiSearch).toHaveBeenLastCalledWith([heart], 'he');
    let resolveThird; searchEmoji.mockReturnValueOnce(new Promise(resolve => { resolveThird = resolve; }));
    fireEvent.change(input, { target: { value: ':ha' } }); fireEvent.keyDown(input, { key: 'Escape', keyCode: 27 });
    await act(async () => resolveThird([{ id: 'happy' }])); expect(actions.setEmojiSearch).toHaveBeenLastCalledWith([], '');
  });
  it('chooses an emoji with Enter instead of sending an unfinished message', () => {
    const results = [{ id: 'smile', colons: ':smile:' }, { id: 'heart', colons: ':heart:' }];
    render(<Composer initialValue="Hello :sm" emojiSearch={{ results, selected: 0, query: 'sm' }} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', keyCode: 13 });
    expect(screen.getByRole('textbox')).toHaveValue('Hello :smile:'); expect(sendMessage).not.toHaveBeenCalled();
  });
  it('removes history keyboard listeners when the composer unmounts', () => {
    const { unmount } = render(<Composer />); fireEvent.keyDown(window, { code: 'ArrowUp' }); expect(actions.restoreMessage).toHaveBeenCalledOnce();
    unmount(); fireEvent.keyDown(window, { code: 'ArrowUp' }); expect(actions.restoreMessage).toHaveBeenCalledOnce();
  });
});
