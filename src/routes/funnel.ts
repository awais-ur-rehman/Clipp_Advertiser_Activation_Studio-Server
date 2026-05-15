import { Router } from 'express';
import { getFunnel } from '../controllers/funnel.controller.js';

export const funnelRouter = Router();

funnelRouter.get('/', getFunnel);
