const MAX_EMAIL_LENGTH = 254;
const MAX_EMAIL_LOCAL_PART_LENGTH = 64;
const MAX_ACCOUNT_NAME_LENGTH = 255;
const MAX_PLAN_TYPE_LENGTH = 50;
const ACTIVE_STATUSES = new Set([0, 1]);

// WHATWG "valid e-mail address" pattern, additionally requiring a dot in the domain.
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const isValidEmail = (email) =>
  email.length <= MAX_EMAIL_LENGTH &&
  email.indexOf('@') <= MAX_EMAIL_LOCAL_PART_LENGTH &&
  EMAIL_RE.test(email);

const validateString = (body, field, maxLength, errors, { required = true } = {}) => {
  const value = body[field];

  if (value === undefined || value === null) {
    if (required) errors.push({ field, message: `${field} is required` });
  } else if (typeof value !== 'string' || value.trim() === '') {
    errors.push({ field, message: `${field} must be a non-empty string` });
  } else if (value.trim().length > maxLength) {
    errors.push({ field, message: `${field} must be at most ${maxLength} characters` });
  }
};

const validateEmail = (body, errors) => {
  const before = errors.length;
  validateString(body, 'email_id', MAX_EMAIL_LENGTH, errors);

  if (errors.length === before && !isValidEmail(body.email_id.trim())) {
    errors.push({ field: 'email_id', message: 'email_id must be a valid email address' });
  }
};

const validateIsActive = (body, errors, { required }) => {
  const value = body.is_active;

  if (value === undefined || value === null) {
    if (required) errors.push({ field: 'is_active', message: 'is_active is required' });
  } else if (!ACTIVE_STATUSES.has(value)) {
    errors.push({ field: 'is_active', message: 'is_active must be 0 (inactive) or 1 (active)' });
  }
};

const normalizeEmail = (email) => email.trim().toLowerCase();

// last_updated is tracked in its own column, so it is never persisted inside `data`.
const withoutLastUpdated = ({ last_updated: _ignored, ...data }) => data;

/**
 * Validates a token usage payload.
 * Returns `{ errors }` when invalid, otherwise `{ value }` with normalized fields.
 */
export const validateTokenPayload = (body) => {
  if (!isPlainObject(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const errors = [];

  validateEmail(body, errors);
  validateString(body, 'account_name', MAX_ACCOUNT_NAME_LENGTH, errors, { required: false });
  validateString(body, 'plan_type', MAX_PLAN_TYPE_LENGTH, errors);
  validateIsActive(body, errors, { required: false });

  if (body.data === undefined || body.data === null) {
    errors.push({ field: 'data', message: 'data is required' });
  } else if (!isPlainObject(body.data)) {
    errors.push({ field: 'data', message: 'data must be a JSON object' });
  }

  if (errors.length > 0) return { errors };

  return {
    value: {
      emailId: normalizeEmail(body.email_id),
      accountName: body.account_name?.trim() ?? null,
      planType: body.plan_type.trim(),
      data: withoutLastUpdated(body.data),
      hasMiscellaneous: body.miscellaneous !== undefined,
      miscellaneous: body.miscellaneous ?? null,
      isActive: body.is_active ?? null,
    },
  };
};

/**
 * Validates a user status update payload: `{ email_id, is_active }`.
 */
export const validateStatusPayload = (body) => {
  if (!isPlainObject(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const errors = [];

  validateEmail(body, errors);
  validateIsActive(body, errors, { required: true });

  if (errors.length > 0) return { errors };

  return {
    value: {
      emailId: normalizeEmail(body.email_id),
      isActive: body.is_active,
    },
  };
};
