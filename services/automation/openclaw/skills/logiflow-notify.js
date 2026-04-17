'use strict';

const { buildMessage } = require('../../mock-server/message-builder');
const { dispatchToAllChannels, summarizeResults } = require('../channels');

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

async function handler(context) {
  try {
    const payload = extractPayload(context);
    validatePayload(payload);

    const message = buildMessage(payload);
    const results = await dispatchToAllChannels(context, message, payload);
    const summary = summarizeResults(results);

    return {
      success: summary.sent > 0,
      messageSent: summary.sent > 0,
      channelsSent: summary.sent,
      channelsFailed: summary.failed,
      channels: summary.channels,
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
  description: 'Compose and send LogiFlow risk alerts across multiple channels (Telegram, Discord, Slack, Email, Firebase Push) through OpenClaw',
  webhookPath: '/skills/logiflow-notify',
  handler,
};
