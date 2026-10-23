import pg from 'pg';
import { env } from './env.js';

const { connectionLimit, ...connectionOptions } = env.db;

export const pool = new pg.Pool({
  ...connectionOptions,
  max: connectionLimit,
  // Keep TIMESTAMPTZ values in UTC regardless of the PostgreSQL server's default time zone.
  options: '-c timezone=UTC',
});

export const testConnection = async () => {
  await pool.query('SELECT 1');
};
