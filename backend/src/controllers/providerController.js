import { findAllProviderRecords, upsertProviderRecord } from '../models/providerModel.js';
import { validateTokenPayload } from '../validators/providerValidator.js';
import { HttpError } from '../utils/HttpError.js';

export const saveTokenData = (provider) => async (req, res) => {
  const { value, errors } = validateTokenPayload(req.body);
  if (errors) {
    throw new HttpError(400, 'Invalid payload', errors);
  }

  const { record, created } = await upsertProviderRecord({ provider, ...value });

  res.status(created ? 201 : 200).json({
    success: true,
    message: created ? `${provider} record created` : `${provider} record updated`,
    data: record,
  });
};

export const getAllTokenData = async (_req, res) => {
  const records = await findAllProviderRecords();

  res.status(200).json({
    success: true,
    count: records.length,
    data: records,
  });
};
