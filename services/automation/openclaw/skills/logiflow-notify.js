'use strict';

const { buildMessage } = require('../../mock-server/message-builder');

function extractPayload(input) {
  if (input && input.body && typeof input.body === 'object') {
    return input.body;
  }

  if (input && input.payload && typeof input.payload === 'object') {
    return input.payload;
  }

  return input;
}

function validatePayload(payload) {
  const required = [
    'eventType',
    'riskLevel',
    'affectedVehicles',
  ];

  let index = 0;
  while (index < required.length) {
    const fieldName = required[index];
    if (payload[fieldName] === undefined || payload[fieldName] === null) {
      throw new Error(`Missing required field: ${fieldName}`);
    }
    index += 1;
  }

  if (!Array.isArray(payload.affectedVehicles) || payload.affectedVehicles.length === 0) {
    throw new Error('Missing required field: affectedVehicles');
  }
}

async function dispatchTelegramMessage(context, message) {
  if (context && typeof context.sendMessage === 'function') {
    await context.sendMessage(message);
    return;
  }

  if (
    context &&
    context.telegram &&
    typeof context.telegram.sendMessage === 'function' &&
    (context.chatId || context.payload?.chatId)
  ) {
    const chatId = context.chatId || context.payload.chatId;
    await context.telegram.sendMessage(chatId, message);
    return;
  }

  throw new Error('Telegram transport is not available in OpenClaw context');
}

async function handler(context) {
  try {
    const payload = extractPayload(context);
    validatePayload(payload);

    const message = buildMessage(payload);
    await dispatchTelegramMessage(context, message);

    return {
      success: true,
      messageSent: true,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

module.exports = {
  name: 'logiflow-notify',
  description: 'Compose and send LogiFlow risk alerts to Telegram through OpenClaw',
  webhookPath: '/skills/logiflow-notify',
  handler,
};
