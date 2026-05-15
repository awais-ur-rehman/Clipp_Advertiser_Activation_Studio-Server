import pino from 'pino';
import { env } from './env.js';

const baseOptions: pino.LoggerOptions = {
  level: env.LOG_LEVEL,
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
};

export const logger =
  env.NODE_ENV !== 'production'
    ? pino({
        ...baseOptions,
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'SYS:standard' },
        },
      })
    : pino(baseOptions);
