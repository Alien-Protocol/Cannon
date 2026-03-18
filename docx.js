/**
 * loaders/docx.js
 *
 * Parses a Word (.docx) document.
 * The document must contain a table where the first row is the header.
 * Supported columns: repo, title, body, labels, milestone, priority, track
 *
 * opts:
 *   file  {string} — path to .docx file
 */

import fs from 'fs';
import path from 'path';
import mammoth from 'mammoth';

export async function loadDOCX({ file }) {
  if (!file) throw new Error('DOCX loader requires `file` option');

  const buffer = fs.readFileSync(path.resolve(file));
  // Extract raw HTML — easier to parse tables from than markdown
  const { value: html } = await mammoth.convertToHtml({ buffer });

  return parseHTMLTable(html);
}

function parseHTMLTable(html) {
  // Simple regex-based table extractor (no DOM dep needed)
  const rows = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  if (rows.length < 2) throw new Error('DOCX: No table found, or table has fewer than 2 rows');

  const getCells = (rowHtml) =>
    [...rowHtml.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map(m => stripTags(m[1]).trim());

  const headers = getCells(rows[0][1]).map(h => h.toLowerCase());

  return rows.slice(1).map(row => {
    const cells = getCells(row[1]);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
    return obj;
  }).filter(r => r.title);
}

function stripTags(html) {
  return html.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}
