import { RadioChannel } from '../types/radio';
import { cloneChannel, createBlankChannel, isChannelEmpty, MAX_CHANNELS, renumber } from './channel';

/**
 * Moves the selected rows up (delta -1) or down (+1) by one, swapping with neighbours.
 * Returns the new array and the moved rows' new indices; no-op at the edges.
 */
export function moveChannels(channels: RadioChannel[], indices: number[], delta: -1 | 1): { channels: RadioChannel[]; indices: number[] } {
  const sorted = [...new Set(indices)].sort((a, b) => a - b);
  if (sorted.length === 0) return { channels, indices };
  if ((delta === -1 && sorted[0] === 0) || (delta === 1 && sorted[sorted.length - 1] === channels.length - 1)) {
    return { channels, indices: sorted };
  }
  const next = [...channels];
  const order = delta === -1 ? sorted : [...sorted].reverse();
  for (const i of order) {
    const j = i + delta;
    [next[i], next[j]] = [next[j], next[i]];
  }
  return { channels: renumber(next), indices: sorted.map((i) => i + delta) };
}

/** Inserts a blank row at `index`, shifting later rows down. Fails if channel 500 is in use. */
export function insertBlank(channels: RadioChannel[], index: number): RadioChannel[] | null {
  if (!isChannelEmpty(channels[MAX_CHANNELS - 1])) return null;
  const next = [...channels.slice(0, index), createBlankChannel(index + 1), ...channels.slice(index, MAX_CHANNELS - 1)];
  return renumber(next);
}

/** Deletes the selected rows and shifts later rows up, padding the end with blanks. */
export function deleteAndShift(channels: RadioChannel[], indices: number[]): RadioChannel[] {
  const drop = new Set(indices);
  const kept = channels.filter((_, i) => !drop.has(i));
  while (kept.length < MAX_CHANNELS) kept.push(createBlankChannel(kept.length + 1));
  return renumber(kept);
}

/** Removes the gaps between programmed channels, keeping their order. */
export function compactChannels(channels: RadioChannel[]): RadioChannel[] {
  const used = channels.filter((c) => !isChannelEmpty(c));
  const next = [...used];
  while (next.length < MAX_CHANNELS) next.push(createBlankChannel(next.length + 1));
  return renumber(next);
}

/** Sorts programmed channels by RX frequency. With `indices`, sorts only within those slots. */
export function sortByFrequency(channels: RadioChannel[], indices?: number[]): RadioChannel[] {
  const slots = indices && indices.length > 1
    ? [...new Set(indices)].sort((a, b) => a - b)
    : channels.map((_, i) => i);
  const picked = slots.map((i) => channels[i]);
  const full = picked.filter((c) => !isChannelEmpty(c)).sort((a, b) => a.rxFreq - b.rxFreq || a.txFreq - b.txFreq);
  const empties = picked.filter((c) => isChannelEmpty(c));
  const ordered = [...full, ...empties];
  const next = [...channels];
  slots.forEach((slot, k) => { next[slot] = ordered[k]; });
  return renumber(next);
}

export type BulkPatch = Partial<Pick<RadioChannel, 'power' | 'bandwidth' | 'scan' | 'mode' | 'busy' | 'compander'>>;

/** Applies the same field values to every selected programmed channel. */
export function bulkEdit(channels: RadioChannel[], indices: number[], patch: BulkPatch): RadioChannel[] {
  const set = new Set(indices);
  return channels.map((ch, i) => (set.has(i) && !isChannelEmpty(ch) ? { ...ch, ...patch } : ch));
}

export function clearChannels(channels: RadioChannel[], indices: number[]): RadioChannel[] {
  const set = new Set(indices);
  return channels.map((ch, i) => (set.has(i) ? createBlankChannel(i + 1) : ch));
}

/** Pastes channels into consecutive slots starting at `start`. */
export function pasteChannels(channels: RadioChannel[], start: number, incoming: RadioChannel[]): { channels: RadioChannel[]; indices: number[] } {
  const next = [...channels];
  const indices: number[] = [];
  incoming.forEach((ch, k) => {
    const slot = start + k;
    if (slot < MAX_CHANNELS) {
      next[slot] = cloneChannel(ch, slot + 1);
      indices.push(slot);
    }
  });
  return { channels: next, indices };
}
