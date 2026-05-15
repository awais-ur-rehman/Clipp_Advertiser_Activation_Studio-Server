import { Router } from 'express';
import { requireApiKey } from '../middleware/api-key.js';
import { getDlq, retryDlqTask } from '../controllers/task.controller.js';

export const tasksRouter = Router();

tasksRouter.get('/dlq', getDlq);
tasksRouter.post('/dlq/retry', requireApiKey, retryDlqTask);
