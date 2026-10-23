import { Router } from 'express';
import {
  getAllTokenData,
  saveTokenData,
  setActiveStatus,
} from '../controllers/providerController.js';
import { PROVIDERS } from '../constants/providers.js';

const router = Router();

for (const [slug, provider] of Object.entries(PROVIDERS)) {
  router.post(`/${slug}`, saveTokenData(provider));
  router.patch(`/${slug}/status`, setActiveStatus(provider));
}

router.get('/data', getAllTokenData);

export default router;
