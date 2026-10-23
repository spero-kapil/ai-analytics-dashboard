import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { env } from '../config/env.js';

const { database, connectionLimit, ...connectionOptions } = env.db;

const createDatabaseIfMissing = async () => {
  const client = new pg.Client({ ...connectionOptions, database: 'postgres' });
  await client.connect();

  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (rowCount === 0) {
      await client.query(`CREATE DATABASE ${client.escapeIdentifier(database)} ENCODING 'UTF8'`);
    }
  } finally {
    await client.end();
  }
};

const init = async () => {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  await createDatabaseIfMissing();

  const client = new pg.Client({ ...connectionOptions, database });
  await client.connect();

  try {
    await client.query(schema);
    console.log(`Database "${database}" is ready.`);
  } finally {
    await client.end();
  }
};

init().catch((error) => {
  console.error('Database initialization failed:', error.message);
  process.exit(1);
});
