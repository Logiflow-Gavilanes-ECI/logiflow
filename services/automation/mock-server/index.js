'use strict';

const express = require('express');
const { buildMessage } = require('./message-builder');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3002', 10);
const WEBHOOK_PATH = '/webhooks/traffic-event';
const NOTIFY_PATH = '/notify';
const REQUIRED_FIELDS = ['eventType', 'affectedVehicles'];
const REQUIRED_NOTIFY_FIELDS = ['riskLevel', 'affectedVehicles', 'eventType'];

app.use(express.json());

function getMissingFields(body) {
  return REQUIRED_FIELDS.filter((field) => !(field in body));
}

function buildErrorResponse(missingFields) {
  return {
    error: 'Invalid payload',
    message: `Missing required fields: ${missingFields.join(', ')}`,
  };
}

function buildSuccessResponse(payload) {
  return {
    status: 'received',
    vehiclesAffected: payload.affectedVehicles.length,
    receivedAt: new Date().toISOString(),
  };
}

function getMissingNotifyFields(body) {
  return REQUIRED_NOTIFY_FIELDS.filter((field) => !(field in body));
}

function buildNotifySuccessResponse(payload, preview) {
  return {
    success: true,
    channel: 'telegram-mock',
    messageSent: true,
    preview,
    eventType: payload.eventType,
    riskLevel: payload.riskLevel,
  };
}

function handleTrafficEvent(req, res) {
  const payload = req.body;
  const missingFields = getMissingFields(payload);

  if (missingFields.length > 0) {
    return res.status(400).json(buildErrorResponse(missingFields));
  }

  const receivedAt = new Date().toISOString();
  console.log(`[${receivedAt}] Traffic event received:`);
  console.log(JSON.stringify(payload, null, 2));

  return res.status(200).json(buildSuccessResponse(payload));
}

app.post(WEBHOOK_PATH, handleTrafficEvent);

function handleNotify(req, res) {
  const payload = req.body;
  const missingFields = getMissingNotifyFields(payload);

  if (missingFields.length > 0) {
    return res.status(400).json(buildErrorResponse(missingFields));
  }

  try {
    const preview = buildMessage(payload);
    console.log('[LogiFlow][Notify] Telegram mock preview:');
    console.log(preview);

    return res.status(200).json(buildNotifySuccessResponse(payload, preview));
  } catch (error) {
    return res.status(400).json({
      error: 'Invalid payload',
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

app.post(NOTIFY_PATH, handleNotify);

function startServer() {
  app.listen(PORT, () => {
    console.log(`[LogiFlow] Mock webhook server running on http://localhost:${PORT}`);
    console.log(`[LogiFlow] Listening for POST ${WEBHOOK_PATH}`);
  });
}

if (require.main === module) {
  startServer();
}

module.exports = app;
