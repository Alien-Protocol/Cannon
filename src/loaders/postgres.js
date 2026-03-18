/**
 * loaders/postgres.js
 *
 * Fetches issues from a PostgreSQL database.
 *
 * opts:
 *   connectionString  {string}  — postgres://user:pass@host:5432/dbname
 *   query             {string}  — SQL that returns issue rows
 *                                 (must select: repo, title, body, labels, milestone)
 *
 * Example cannon.config.json:
 * {
 *   "source": {
 *     "type": "postgres",
 *     "connectionString": "${POSTGRES_URL}",
 *     "query": "SELECT repo, title, body, labels, milestone FROM backlog WHERE exported = false"
 *   }
 * }
 *
 * ⚠️  Put your connection string in .env as POSTGRES_URL — never hardcode credentials.
 */

import pg from 'pg';

const { Client } = pg;

export async function loadPostgres({ connectionString, query, ssl }) {
  if (!connectionString) throw new Error('postgres loader requires `connectionString`');
  if (!query)            throw new Error('postgres loader requires `query`');

  // Support ${ENV_VAR} interpolation in connectionString
  const connStr = interpolateEnv(connectionString);

  const client = new Client({
    connectionString: connStr,
    ssl: ssl ?? (connStr.includes('sslmode=require') ? { rejectUnauthorized: false } : false),
  });

  await client.connect();
  try {
    const result = await client.query(query);
    return result.rows;
  } finally {
    await client.end();
  }
}

function interpolateEnv(str) {
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const val = process.env[key];
    if (!val) throw new Error(`Environment variable "${key}" is not set`);
    return val;
  });
}
