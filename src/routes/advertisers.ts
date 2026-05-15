import { Router } from 'express';
import { requireApiKey } from '../middleware/api-key.js';
import {
  getAdvertisers,
  couponDesigned,
  couponPublished,
} from '../controllers/advertiser.controller.js';

export const advertisersRouter = Router();

advertisersRouter.get('/', getAdvertisers);
advertisersRouter.post('/:id/coupon-designed', requireApiKey, couponDesigned);
advertisersRouter.post('/:id/coupon-published', requireApiKey, couponPublished);
