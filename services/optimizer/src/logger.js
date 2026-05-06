const pino = require('pino');

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const SERVICE_NAME = 'optimizer';

const baseLogger = pino({
  level: LOG_LEVEL,
  base: { service: SERVICE_NAME },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'apiKey',
      '*.apiKey',
      'authorization',
      '*.authorization',
      'headers["x-goog-api-key"]',
      'headers.authorization',
    ],
    censor: '[REDACTED]',
  },
});

function loggerFor(correlationId) {
  if (!correlationId) {
    return baseLogger;
  }
  return baseLogger.child({ correlationId });
}

module.exports = {
  logger: baseLogger,
  loggerFor,
};
