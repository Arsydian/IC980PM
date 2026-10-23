/** RFC 4180-style parser: quoted cells, doubled quotes, CRLF/LF, optional BOM. */
export function parseCsvRows(text: string, delimiter = ','): string[][] {
  const clean = text.replace(/^﻿/, '').replace(/(\r?\n)+$/, '');
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuote = false;

  const endCell = () => {
    currentRow.push(currentCell.trim());
    currentCell = '';
  };
  const endRow = () => {
    endCell();
    rows.push(currentRow);
    currentRow = [];
  };

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (insideQuote) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          currentCell += '"';
          i++;
        } else {
          insideQuote = false;
        }
      } else {
        currentCell += char;
      }
    } else if (char === '"') {
      insideQuote = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\r') {
      if (clean[i + 1] === '\n') i++;
      endRow();
    } else if (char === '\n') {
      endRow();
    } else {
      currentCell += char;
    }
  }
  if (clean.length > 0) endRow();
  return rows;
}

/** Quotes a cell when needed and neutralises spreadsheet formulas in free-text cells. */
export function escapeCsvCell(val: string | number | undefined, isText = false, delimiter = ','): string {
  let str = String(val ?? '');
  if (isText && /^[=+@]/.test(str)) str = `'${str}`;
  if (str.includes(delimiter) || /["\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Turns header + rows into objects keyed by trimmed header names. */
export function rowsToObjects(rows: string[][]): { header: string[]; records: Record<string, string>[] } {
  if (rows.length === 0) return { header: [], records: [] };
  const header = rows[0].map((h) => h.trim());
  const records = rows.slice(1)
    .filter((r) => r.some((cell) => cell !== ''))
    .map((r) => {
      const obj: Record<string, string> = {};
      header.forEach((col, idx) => { obj[col] = r[idx] ?? ''; });
      return obj;
    });
  return { header, records };
}
