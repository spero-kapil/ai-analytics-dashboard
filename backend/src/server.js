import app from './app.js';
import { env } from './config/env.js';
import { pool, testConnection } from './config/db.js';

const start = async () => {
  try {
    await testConnection();
    console.log(`Connected to MySQL database "${env.db.database}"`);
  } catch (error) {
    console.error('Unable to connect to MySQL:', error.message);
    process.exit(1);
  }

  const server = app.listen(env.port, () => {
    console.log(`Token Tracker API listening on http://localhost:${env.port}`);
  });

  const shutdown = (signal) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await pool.end();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
};

start();
