import data from '@emoji-mart/data';
import { init, SearchIndex } from 'emoji-mart';

let initialization;
export function initializeEmoji() {
  initialization ||= init({ data });
  return initialization;
}

// Persist the same colon codes as historical chat messages, including skin tones.
export function normalizeEmoji(emoji) {
  return {
    ...emoji,
    colons: emoji.shortcodes || emoji.skins?.[0]?.shortcodes || `:${emoji.id}:`,
  };
}

// Room emoji are searched from the active room separately; the picker maintains
// a global custom index that can include aliases from an earlier picker.
export async function searchEmoji(query) {
  await initializeEmoji();
  return (await SearchIndex.search(query, { maxResults: 40 }) || [])
    .filter(emoji => !emoji.skins?.[0]?.src)
    .map(normalizeEmoji);
}

export function pickerCustomEmoji(emojis) {
  if (!emojis.length) return [];
  return [{
    id: 'room',
    name: 'Room emoji',
    emojis: emojis.map(emoji => ({
      id: emoji.id,
      name: emoji.name,
      keywords: emoji.keywords || [emoji.id],
      skins: [{ src: emoji.imageUrl }],
    })),
  }];
}

export { data };
