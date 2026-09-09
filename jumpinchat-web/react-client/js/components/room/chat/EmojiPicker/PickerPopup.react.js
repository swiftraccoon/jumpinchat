import React, { useEffect, useRef } from 'react';
import { Picker } from 'emoji-mart';
import { data, initializeEmoji, normalizeEmoji, pickerCustomEmoji } from '../../../../utils/emoji';
import { useOutsideDismiss } from '../../../elements/FloatingLayer.react';

const noCustomEmoji = [];
export default function PickerPopup({ onSelect, onClickOutside, custom = noCustomEmoji, darkTheme }) {
  const container = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  useOutsideDismiss(container, onClickOutside);
  useEffect(() => {
    let active = true;
    let picker;
    initializeEmoji().then(() => {
      if (!active) return;
      picker = new Picker({
        data,
        set: 'native',
        theme: darkTheme ? 'dark' : 'light',
        previewPosition: 'none',
        custom: pickerCustomEmoji(custom),
        onEmojiSelect: emoji => onSelectRef.current(normalizeEmoji(emoji)),
      });
      container.current.appendChild(picker);
    });
    return () => { active = false; picker?.remove(); };
  }, [custom, darkTheme]);

  return <div ref={container} className="emoji-picker" />;
}
