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
