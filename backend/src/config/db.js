import mysql from 'mysql2/promise';
import { env } from './env.js';

export const pool = mysql.createPool({
  ...env.db,
  waitForConnections: true,
  // Return DATETIME/TIMESTAMP columns as "YYYY-MM-DD HH:MM:SS" strings instead of Date objects.
  dateStrings: true,
});

// Keep TIMESTAMP values in UTC regardless of the MySQL server's default time zone.
pool.pool.on('connection', (connection) => {
  connection.query("SET time_zone = '+00:00'");
});

export const testConnection = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.ping();
  } finally {
    connection.release();
  }
};
