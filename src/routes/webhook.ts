import { Router } from 'express';
import { requireApiKey } from '../middleware/api-key.js';
import { handleAdvertiserSignedUp } from '../controllers/webhook.controller.js';

export const webhookRouter = Router();

webhookRouter.post('/advertiser-signed-up', requireApiKey, handleAdvertiserSignedUp);
