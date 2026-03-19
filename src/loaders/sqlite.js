import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

export async function loadSQLite({ file, query }) {
  if (!file) throw new Error('sqlite loader requires `file`');
  if (!query) throw new Error('sqlite loader requires `query`');

  const initSqlJs = require('sql.js');
  const SQL = await initSqlJs();

  const buffer = fs.readFileSync(path.resolve(file));
  const db = new SQL.Database(buffer);

  try {
    const results = db.exec(query);
    if (!results.length) return [];

    const { columns, values } = results[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i] ?? ''; });
      return obj;
    });
  } finally {
    db.close();
  }
}