import { RadioChannel } from '../types/radio';
import { cloneChannel, isChannelEmpty, MAX_CHANNELS } from './channel';

export type PlacementMode = 'appendEmpty' | 'startAt' | 'location';

export interface PlacementPlan {
  /** Zero-based target slot for each incoming channel; -1 when it does not fit. */
  targets: number[];
  /** Channel numbers that already hold data and will be replaced. */
  overwrites: number[];
  /** How many incoming channels have no slot. */
  dropped: number;
}

/**
 * Decides where incoming channels go.
 * - appendEmpty: only empty slots, from `startAt` onward; occupied channels are never touched.
 * - startAt: consecutive slots from `startAt`, replacing whatever is there.
 * - location: each channel's own number (`locations[i]`, 1-based).
 */
export function planPlacement(
  existing: RadioChannel[],
  count: number,
  mode: PlacementMode,
  startAt = 1,
  locations: (number | undefined)[] = []
): PlacementPlan {
  const targets: number[] = [];
  const used = new Set<number>();
  let cursor = Math.max(0, Math.min(MAX_CHANNELS - 1, startAt - 1));

  for (let i = 0; i < count; i++) {
    let target = -1;
    if (mode === 'location') {
      const loc = locations[i];
      if (loc !== undefined && loc >= 1 && loc <= MAX_CHANNELS && !used.has(loc - 1)) target = loc - 1;
    } else if (mode === 'startAt') {
      if (cursor < MAX_CHANNELS) target = cursor++;
    } else {
      while (cursor < MAX_CHANNELS && (!isChannelEmpty(existing[cursor]) || used.has(cursor))) cursor++;
      if (cursor < MAX_CHANNELS) target = cursor++;
    }
    if (target !== -1) used.add(target);
    targets.push(target);
  }

  const overwrites = targets
    .filter((t) => t !== -1 && !isChannelEmpty(existing[t]))
    .map((t) => t + 1);
  return { targets, overwrites, dropped: targets.filter((t) => t === -1).length };
}

export function applyPlacement(existing: RadioChannel[], incoming: RadioChannel[], plan: PlacementPlan): RadioChannel[] {
  const next = [...existing];
  plan.targets.forEach((t, i) => {
    if (t !== -1) next[t] = cloneChannel(incoming[i], t + 1);
  });
  return next;
}
