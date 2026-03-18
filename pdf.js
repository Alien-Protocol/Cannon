/**
 * loaders/pdf.js
 *
 * Extracts issues from a PDF.
 *
 * Two strategies (auto-detected):
 *   A) Table-style PDF  — rows are delimited by | or tabs
 *      First row must be the header row.
 *
 *   B) Structured text PDF  — each issue is a block like:
 *        REPO: owner/repo
 *        TITLE: Fix the login bug
 *        BODY: Describe what's broken...
 *        LABELS: bug, auth
 *        MILESTONE: v1.2
 *
 * opts:
 *   file      {string}  — path to PDF
 *   strategy  {string}  — 'table' | 'text' | 'auto' (default)
 */

import fs from 'fs';
import path from 'path';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export async function loadPDF({ file, strategy = 'auto' }) {
  if (!file) throw new Error('PDF loader requires `file` option');

  const buffer = fs.readFileSync(path.resolve(file));
  const data = await pdfParse(buffer);
  const text = data.text;

  if (strategy === 'auto') {
    // Heuristic: if most non-empty lines contain | or \t → table
    const lines = text.split('\n').filter(l => l.trim());
    const delimited = lines.filter(l => l.includes('|') || l.includes('\t'));
    strategy = delimited.length > lines.length * 0.4 ? 'table' : 'text';
  }

  if (strategy === 'table') return parseTablePDF(text);
  return parseTextPDF(text);
}

function parseTablePDF(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const sep = lines[0].includes('|') ? '|' : '\t';
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(sep).map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ''; });
    return obj;
  }).filter(r => r.title);
}

function parseTextPDF(text) {
  const blocks = text.split(/\n{2,}/);
  return blocks.map(block => {
    const get = (key) => {
      const match = block.match(new RegExp(`^${key}:(.*)`, 'im'));
      return match ? match[1].trim() : '';
    };
    return {
      repo:      get('REPO'),
      title:     get('TITLE'),
      body:      get('BODY'),
      labels:    get('LABELS'),
      milestone: get('MILESTONE'),
      priority:  get('PRIORITY'),
      track:     get('TRACK'),
    };
  }).filter(r => r.repo && r.title);
}
