'use strict';

const express = require('express');

const app = express();
const PORT = 3000;
const WEBHOOK_PATH = '/webhooks/traffic-event';
const REQUIRED_FIELDS = ['eventType', 'affectedVehicles'];

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
