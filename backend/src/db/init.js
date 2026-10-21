import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { env } from '../config/env.js';

const { database, connectionLimit, ...connectionOptions } = env.db;

const init = async () => {
  const schema = await readFile(new URL('./schema.sql', import.meta.url), 'utf8');
  const connection = await mysql.createConnection(connectionOptions);

  try {
    await connection.query(
      `CREATE DATABASE IF NOT EXISTS ${mysql.escapeId(database)} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    );
    await connection.changeUser({ database });
    await connection.query(schema);
    console.log(`Database "${database}" is ready.`);
  } finally {
    await connection.end();
  }
};

init().catch((error) => {
  console.error('Database initialization failed:', error.message);
  process.exit(1);
});
