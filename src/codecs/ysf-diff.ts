import { describeYsfOffset } from './ysf-codec';

export interface DiffRun {
  start: number;
  end: number;   // inclusive
  label: string;
  a: number[];
  b: number[];
}

/**
 * Lists the byte ranges that differ between two .ysf images, labelled with the
 * field each offset belongs to. Used to map unknown settings: change one setting
 * in the OEM software, save, and compare against the previous file.
 */
export function diffYsfImages(a: Uint8Array, b: Uint8Array): DiffRun[] {
  const len = Math.max(a.length, b.length);
  const runs: DiffRun[] = [];
  let current: DiffRun | null = null;

  for (let i = 0; i < len; i++) {
    const va = i < a.length ? a[i] : -1;
    const vb = i < b.length ? b[i] : -1;
    if (va === vb) {
      current = null;
      continue;
    }
    const label = describeYsfOffset(i).replace(/ \+\d+ \(/, ' (');
    if (current && current.end === i - 1 && current.label === label) {
      current.end = i;
      current.a.push(va);
      current.b.push(vb);
    } else {
      current = { start: i, end: i, label, a: [va], b: [vb] };
      runs.push(current);
    }
  }
  return runs;
}
