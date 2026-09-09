import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import SortContainer from './SortContainer';
import SortItem from './SortItem';

function Items({ onMove }) {
  return (
    <SortContainer>
      <ul>
        {['Alice', 'Bob'].map((name, index) => (
          <SortItem key={name} id={name} index={index} type="USER" onMove={onMove}>
            <li>{name}</li>
          </SortItem>
        ))}
      </ul>
    </SortContainer>
  );
}

function drag(node, type, dataTransfer, clientY) {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, clientX: 10, clientY });
  Object.defineProperty(event, 'dataTransfer', { value: dataTransfer });
  fireEvent(node, event);
}

describe('React 19 HTML5 drag and drop integration', () => {
  it('moves an item after dragging past the midpoint of another item', async () => {
    const onMove = vi.fn();
    render(<Items onMove={onMove} />);
    const [alice, bob] = screen.getAllByRole('listitem');
    for (const [node, top] of [[alice, 0], [bob, 40]]) {
      vi.spyOn(node, 'getBoundingClientRect').mockReturnValue({ top, bottom: top + 40, left: 0, right: 100, width: 100, height: 40 });
    }
    const transfer = { types: [], setData: vi.fn(), setDragImage: vi.fn(), dropEffect: 'move' };
    expect(alice).toHaveAttribute('draggable', 'true');
    drag(alice, 'dragstart', transfer, 10);
    await waitFor(() => expect(alice).toHaveClass('dragging'));
    drag(bob, 'dragenter', transfer, 70);
    drag(bob, 'dragover', transfer, 70);
    await waitFor(() => expect(onMove).toHaveBeenCalledWith(0, 1));
    drag(bob, 'drop', transfer, 70);
    drag(alice, 'dragend', transfer, 70);
    await waitFor(() => expect(alice).not.toHaveClass('dragging'));
  });

  it('tears down backend listeners and remounts without duplicate backends', () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const first = render(<Items onMove={vi.fn()} />);
    first.unmount();
    expect(remove.mock.calls.some(([type]) => type === 'dragstart')).toBe(true);
    expect(() => render(<Items onMove={vi.fn()} />)).not.toThrow();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });
});
