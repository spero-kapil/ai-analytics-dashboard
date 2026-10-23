import { pool } from '../config/db.js';

const COLUMNS =
  'id, provider, email_id, account_name, data, plan_type, miscellaneous, is_active, last_updated, "createdAt"';

const toJson = (value) => (value === null ? null : JSON.stringify(value));

/**
 * Inserts a new record, or updates the existing one for the provider/email_id pair.
 * Optional fields (account_name, miscellaneous, is_active) keep their stored value
 * when they are omitted from the request. last_updated is always refreshed.
 */
export const upsertProviderRecord = async ({
  provider,
  emailId,
  accountName,
  planType,
  data,
  hasMiscellaneous,
  miscellaneous,
  isActive,
}) => {
  const { rows } = await pool.query(
    `INSERT INTO providers (provider, email_id, account_name, plan_type, data, miscellaneous, is_active)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, COALESCE($7::smallint, 1))
     ON CONFLICT (provider, email_id) DO UPDATE SET
       account_name = COALESCE(EXCLUDED.account_name, providers.account_name),
       plan_type = EXCLUDED.plan_type,
       data = EXCLUDED.data,
       miscellaneous = CASE WHEN $8::boolean THEN EXCLUDED.miscellaneous ELSE providers.miscellaneous END,
       is_active = CASE WHEN $7::smallint IS NULL THEN providers.is_active ELSE EXCLUDED.is_active END,
       last_updated = CURRENT_TIMESTAMP
     RETURNING ${COLUMNS}, (xmax = 0) AS created`,
    [provider, emailId, accountName, planType, toJson(data), toJson(miscellaneous), isActive, hasMiscellaneous],
  );

  const { created, ...record } = rows[0];
  return { record, created };
};

/**
 * Sets is_active for the provider/email_id pair. Returns null when no such record exists.
 */
export const updateActiveStatus = async ({ provider, emailId, isActive }) => {
  const { rows } = await pool.query(
    `UPDATE providers
     SET is_active = $3, last_updated = CURRENT_TIMESTAMP
     WHERE provider = $1 AND email_id = $2
     RETURNING ${COLUMNS}`,
    [provider, emailId, isActive],
  );
  return rows[0] ?? null;
};

export const findAllProviderRecords = async () => {
  const { rows } = await pool.query(
    `SELECT ${COLUMNS} FROM providers ORDER BY last_updated DESC, provider ASC`,
  );
  return rows;
};
