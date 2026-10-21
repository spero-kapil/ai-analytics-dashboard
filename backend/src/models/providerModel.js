import { randomUUID } from 'node:crypto';
import { pool } from '../config/db.js';

const COLUMNS = 'id, provider, account_name, data, plan_type, createdAt, updatedAt';

export const findByProviderAndAccount = async (provider, accountName) => {
  const [rows] = await pool.execute(
    `SELECT ${COLUMNS} FROM Providers WHERE provider = ? AND account_name = ?`,
    [provider, accountName],
  );
  return rows[0] ?? null;
};

/**
 * Inserts a new record, or updates `data` and `plan_type` when the
 * provider/account_name pair already exists.
 */
export const upsertProviderRecord = async ({ provider, accountName, planType, data }) => {
  const [result] = await pool.execute(
    `INSERT INTO Providers (id, provider, account_name, data, plan_type)
     VALUES (?, ?, ?, ?, ?) AS incoming
     ON DUPLICATE KEY UPDATE
       data = incoming.data,
       plan_type = incoming.plan_type,
       updatedAt = CURRENT_TIMESTAMP`,
    [randomUUID(), provider, accountName, JSON.stringify(data), planType],
  );

  const record = await findByProviderAndAccount(provider, accountName);

  // affectedRows is 1 for a fresh insert, 2 (or 0 if nothing changed) for an update.
  return { record, created: result.affectedRows === 1 };
};

export const findAllProviderRecords = async () => {
  const [rows] = await pool.query(
    `SELECT ${COLUMNS} FROM Providers ORDER BY updatedAt DESC, provider ASC`,
  );
  return rows;
};
