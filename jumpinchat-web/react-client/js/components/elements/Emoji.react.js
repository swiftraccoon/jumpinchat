import React, { useEffect } from 'react';
import { initializeEmoji } from '../../utils/emoji';

export default function Emoji({ emoji, size = 24, tooltip = false }) {
  useEffect(() => { initializeEmoji(); }, []);
  if (typeof emoji === 'object' && emoji.custom) {
    return <img src={emoji.imageUrl} width={size} height={size} alt={emoji.colons} title={tooltip ? emoji.name : undefined} className="chat-emoji" />;
  }
  const code = typeof emoji === 'string' ? emoji : emoji.colons || emoji.id;
  const shortcodes = code.startsWith(':') ? code : `:${code}:`;
  return <em-emoji shortcodes={shortcodes} size={`${size}px`} set="native" fallback={shortcodes} />;
}
