import mysql from 'mysql2/promise';

export async function loadMySQL({ connectionString, host, user, password, database, query }) {
  if (!query) throw new Error('mysql loader requires `query`');

  const connOpts = connectionString
    ? { uri: interpolateEnv(connectionString) }
    : {
        host: interpolateEnv(host ?? ''),
        user: interpolateEnv(user ?? ''),
        password: interpolateEnv(password ?? ''),
        database: interpolateEnv(database ?? ''),
      };

  const connection = await mysql.createConnection(connOpts);
  try {
    const [rows] = await connection.execute(query);
    return rows;
  } finally {
    await connection.end();
  }
}

function interpolateEnv(str) {
  return str.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const val = process.env[key];
    if (!val) throw new Error(`Environment variable "${key}" is not set`);
    return val;
  });
}
