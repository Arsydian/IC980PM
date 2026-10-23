import { RadioChannel } from '../types/radio';
import { AIRBAND_RX, inRange, isAmateurTx, isHardwareRx, isHardwareTx, RegionInfo } from './band-plans';
import { isChannelEmpty, roundMHz } from './channel';
import { isStandardCtcss, sameTone } from './tone-tables';

export type IssueSeverity = 'error' | 'warning' | 'info';

export interface ChannelIssue {
  channelId: number;
  severity: IssueSeverity;
  message: string;
}

/**
 * Checks every programmed channel. Errors block writing to the radio;
 * warnings ask for confirmation first.
 */
export function validateChannels(channels: RadioChannel[], region: RegionInfo): ChannelIssue[] {
  const issues: ChannelIssue[] = [];
  const seen = new Map<string, number>();
  const add = (ch: RadioChannel, severity: IssueSeverity, message: string) =>
    issues.push({ channelId: ch.id, severity, message });

  for (const ch of channels) {
    if (isChannelEmpty(ch)) continue;
    const airband = inRange(ch.rxFreq, AIRBAND_RX) && ch.rxFreq < 134;

    if (!isHardwareRx(ch.rxFreq)) {
      add(ch, 'error', `RX ${ch.rxFreq.toFixed(5)} MHz is outside the radio's range (108–176, 400–475 MHz).`);
    }
    if (airband && ch.mode !== 1) {
      add(ch, 'warning', 'Airband frequency set to FM; airband uses AM.');
    }
    if (!airband && ch.mode === 1) {
      add(ch, 'info', 'AM mode outside the airband.');
    }

    const txFreq = ch.txFreq > 0 ? ch.txFreq : ch.rxFreq;
    if (!airband || ch.duplex !== 'OFF') {
      if (!isHardwareTx(txFreq)) {
        add(ch, 'error', `TX ${txFreq.toFixed(5)} MHz is outside the radio's transmit range (134–176, 400–475 MHz).`);
      } else if (!isAmateurTx(txFreq, region)) {
        add(ch, 'warning', `TX ${txFreq.toFixed(5)} MHz is outside the ${region.name} amateur 2 m / 70 cm allocations.`);
      }
    }

    if ((ch.duplex === '+' || ch.duplex === '-') && !(ch.offset > 0)) {
      add(ch, 'warning', `Duplex ${ch.duplex} with no offset — TX equals RX.`);
    }
    if (ch.duplex === 'SPLIT' && roundMHz(txFreq - ch.rxFreq) === 0) {
      add(ch, 'info', 'Split selected but TX equals RX.');
    }
    for (const [label, tone] of [['TX', ch.txTone], ['RX', ch.rxTone]] as const) {
      if (tone.type === 1 && !isStandardCtcss(tone.ctcss)) {
        add(ch, 'warning', `${label} tone ${tone.ctcss.toFixed(1)} Hz is not a standard CTCSS tone.`);
      }
    }

    const key = [ch.rxFreq.toFixed(5), txFreq.toFixed(5), ch.mode].join('|');
    const prev = seen.get(key);
    if (prev !== undefined) {
      const other = channels[prev - 1];
      const tonesMatch = sameTone(other.txTone, ch.txTone) && sameTone(other.rxTone, ch.rxTone);
      add(ch, 'info', `Same frequencies as channel ${prev}${tonesMatch ? ' (duplicate)' : ' (different tones)'}.`);
    } else {
      seen.set(key, ch.id);
    }
  }

  const order: Record<IssueSeverity, number> = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity] || a.channelId - b.channelId);
}

export function countBySeverity(issues: ChannelIssue[]): Record<IssueSeverity, number> {
  const counts = { error: 0, warning: 0, info: 0 };
  for (const i of issues) counts[i.severity]++;
  return counts;
}
