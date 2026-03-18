/**
 * loaders/csv.js
 * Parses a CSV file into an array of issue objects.
 * Expected columns: repo, title, body, labels, milestone, priority, track
 */

import fs from 'fs';
import path from 'path';

export async function loadCSV({ file }) {
  if (!file) throw new Error('CSV loader requires `file` option');
  const raw = fs.readFileSync(path.resolve(file), 'utf-8');
  return parseCSV(raw);
}

// RFC-4180 CSV parser (handles quoted multi-line fields)
export function parseCSV(raw) {
  const rows = [];
  let field = '', inQuotes = false, fields = [], i = 0;
  while (i < raw.length) {
    const ch = raw[i], next = raw[i + 1];
    if (inQuotes) {
      if (ch === '"' && next === '"') { field += '"'; i += 2; }
      else if (ch === '"') { inQuotes = false; i++; }
      else { field += ch; i++; }
    } else {
      if (ch === '"') { inQuotes = true; i++; }
      else if (ch === ',') { fields.push(field); field = ''; i++; }
      else if (ch === '\r' && next === '\n') { fields.push(field); rows.push(fields); fields = []; field = ''; i += 2; }
      else if (ch === '\n') { fields.push(field); rows.push(fields); fields = []; field = ''; i++; }
      else { field += ch; i++; }
    }
  }
  if (field || fields.length) { fields.push(field); if (fields.some(f => f !== '')) rows.push(fields); }
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => h.trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = (row[idx] ?? '').trim(); });
    return obj;
  });
}
