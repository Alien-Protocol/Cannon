import { loadCSV } from './csv.js';
import { loadPDF } from './pdf.js';
import { loadDOCX } from './docx.js';
import { loadJSON } from './json.js';
import { loadPostgres } from './postgres.js';
import { loadMySQL } from './mysql.js';
import { loadSQLite } from './sqlite.js';

const LOADERS = {
  csv: loadCSV,
  pdf: loadPDF,
  docx: loadDOCX,
  json: loadJSON,
  postgres: loadPostgres,
  mysql: loadMySQL,
  sqlite: loadSQLite,
  array: async (opts) => opts.data ?? [],
};

const VALID_ACTIONS = new Set(['create', 'update']);

/**
 * @param {{ source: string, [key: string]: any }} opts
 * @returns {Promise<object[]>}
 */
export async function loadIssues(opts = {}) {
  const { source, ...rest } = opts;
  if (!source) throw new Error('loadIssues: `source` is required');

  const loader = LOADERS[source.toLowerCase()];
  if (!loader) {
    throw new Error(
      `Unknown source "${source}". Valid sources: ${Object.keys(LOADERS).join(', ')}`
    );
  }

  const issues = await loader(rest);

  // Normalise: ensure required fields exist, preserve action column
  return issues
    .filter((row) => {
      // Drop completely empty rows (e.g. trailing blank CSV line)
      return row.title || row.repo;
    })
    .map((row, i) => {
      if (!row.title) throw new Error(`Issue at index ${i} is missing "title"`);
      if (!row.repo) throw new Error(`Issue "${row.title}" is missing "repo"`);

      // Normalise action: default to 'create', validate if provided
      const rawAction = (row.action ?? '').trim().toLowerCase();
      const action = rawAction === '' ? 'create' : rawAction;
      if (!VALID_ACTIONS.has(action)) {
        throw new Error(
          `Issue "${row.title}" has invalid action "${row.action}". ` +
          `Valid values: create, update`
        );
      }

      return {
        action,
        repo: row.repo.trim(),
        title: row.title.trim(),
        body: row.body?.trim() ?? '',
        labels: row.labels ?? '',
        milestone: row.milestone?.trim() ?? '',
        priority: row.priority?.trim() ?? '',
        track: row.track?.trim() ?? '',
        type: row.type?.trim() ?? '',
        difficulty: row.difficulty?.trim() ?? '',
      };
    });
}