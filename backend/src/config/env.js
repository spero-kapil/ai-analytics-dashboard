const toInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
};

const parseOrigins = (value) => {
  if (!value || value.trim() === '*') return '*';
  return value.split(',').map((origin) => origin.trim()).filter(Boolean);
};

export const env = {
  port: toInt(process.env.PORT, 3000),
  corsOrigin: parseOrigins(process.env.CORS_ORIGIN),
  db: {
    host: process.env.DB_HOST || 'localhost',
    port: toInt(process.env.DB_PORT, 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'token_tracker',
    connectionLimit: toInt(process.env.DB_CONNECTION_LIMIT, 10),
  },
};
