/**
 * loaders/json.js
 * Loads issues from a JSON file (array of issue objects).
 */
import fs from 'fs';
import path from 'path';

export async function loadJSON({ file }) {
  if (!file) throw new Error('JSON loader requires `file` option');
  const raw = fs.readFileSync(path.resolve(file), 'utf-8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error('JSON file must export an array of issue objects');
  return data;
}
