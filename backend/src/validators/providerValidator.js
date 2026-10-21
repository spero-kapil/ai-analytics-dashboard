const MAX_ACCOUNT_NAME_LENGTH = 255;
const MAX_PLAN_TYPE_LENGTH = 50;

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const validateString = (body, field, maxLength, errors) => {
  const value = body[field];

  if (value === undefined || value === null) {
    errors.push({ field, message: `${field} is required` });
  } else if (typeof value !== 'string' || value.trim() === '') {
    errors.push({ field, message: `${field} must be a non-empty string` });
  } else if (value.trim().length > maxLength) {
    errors.push({ field, message: `${field} must be at most ${maxLength} characters` });
  }
};

/**
 * Validates a token usage payload.
 * Returns `{ errors }` when invalid, otherwise `{ value }` with normalized fields.
 */
export const validateTokenPayload = (body) => {
  if (!isPlainObject(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const errors = [];

  validateString(body, 'account_name', MAX_ACCOUNT_NAME_LENGTH, errors);
  validateString(body, 'plan_type', MAX_PLAN_TYPE_LENGTH, errors);

  if (body.data === undefined || body.data === null) {
    errors.push({ field: 'data', message: 'data is required' });
  } else if (!isPlainObject(body.data)) {
    errors.push({ field: 'data', message: 'data must be a JSON object' });
  }

  if (errors.length > 0) return { errors };

  return {
    value: {
      accountName: body.account_name.trim(),
      planType: body.plan_type.trim(),
      data: body.data,
    },
  };
};
