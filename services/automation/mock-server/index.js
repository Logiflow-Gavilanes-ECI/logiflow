'use strict';

const express = require('express');
const { buildMessage } = require('./message-builder');

const app = express();
const PORT = Number.parseInt(process.env.PORT || '3002', 10);
const WEBHOOK_PATH = '/webhooks/traffic-event';
const NOTIFY_PATH = '/notify';
const REQUIRED_NOTIFY_FIELDS = ['riskLevel', 'affectedVehicles', 'eventType'];
const HTTP_STATUS_OK = 200;
const HTTP_STATUS_CREATED = 201;
const HTTP_STATUS_BAD_REQUEST = 400;
const LOG_PREFIX = '[LogiFlow]';
const LOG_NOTIFY_PREFIX = `${LOG_PREFIX}[Notify]`;
const RESPONSE_STATUS_ACCEPTED = 'accepted';
const ERROR_INVALID_PAYLOAD = 'Invalid payload';
const FIELD_EVENT_TYPE = 'eventType';
const FIELD_SEVERITY = 'severity';
const FIELD_RISK = 'risk';
const FIELD_RISK_LEVEL = 'riskLevel';
const FIELD_RECOMMENDED_ACTION = 'recommendedAction';
const FIELD_MAPS = 'maps';
const FIELD_DETOUR_RECOMMENDED = 'detourRecommended';
const FIELD_INCIDENT_ADDRESS = 'incidentAddress';
const FIELD_ALTERNATIVE_ROUTES = 'alternativeRoutes';
const FIELD_VEHICLES = 'vehicles';
const FIELD_STOPS = 'stops';
const FIELD_STATUS = 'status';
const FIELD_VEHICLES_AFFECTED = 'vehiclesAffected';
const FIELD_RECEIVED_AT = 'receivedAt';

const REQUIRED_TRAFFIC_FIELDS = [
  FIELD_EVENT_TYPE,
  FIELD_SEVERITY,
  FIELD_RISK,
  FIELD_MAPS,
  FIELD_VEHICLES,
  FIELD_STOPS,
];

app.use(express.json());

function getMissingFields(body) {
  return REQUIRED_TRAFFIC_FIELDS.filter((field) => !(field in body));
}

function buildErrorResponse(missingFields) {
  return {
    error: ERROR_INVALID_PAYLOAD,
    message: `Missing required fields: ${missingFields.join(', ')}`,
  };
}

function buildTrafficEventSuccessResponse(payload) {
  const vehicles = Array.isArray(payload[FIELD_VEHICLES]) ? payload[FIELD_VEHICLES] : [];

  return {
    [FIELD_STATUS]: RESPONSE_STATUS_ACCEPTED,
    [FIELD_RISK_LEVEL]: payload[FIELD_RISK][FIELD_RISK_LEVEL],
    [FIELD_VEHICLES_AFFECTED]: vehicles.length,
    [FIELD_DETOUR_RECOMMENDED]: payload[FIELD_MAPS][FIELD_DETOUR_RECOMMENDED],
    [FIELD_RECEIVED_AT]: new Date().toISOString(),
  };
}

function getMissingNotifyFields(body) {
  return REQUIRED_NOTIFY_FIELDS.filter((field) => !(field in body));
}

function hasRiskLevel(payload) {
  return Boolean(payload?.[FIELD_RISK]?.[FIELD_RISK_LEVEL]);
}

function hasDetourRecommended(payload) {
  return typeof payload?.[FIELD_MAPS]?.[FIELD_DETOUR_RECOMMENDED] === 'boolean';
}

function buildMissingRiskLevelResponse() {
  return {
    error: ERROR_INVALID_PAYLOAD,
    message: `Missing required field: ${FIELD_RISK}.${FIELD_RISK_LEVEL}`,
  };
}

function buildMissingDetourResponse() {
  return {
    error: ERROR_INVALID_PAYLOAD,
    message: `Missing required field: ${FIELD_MAPS}.${FIELD_DETOUR_RECOMMENDED}`,
  };
}

function logEventReceived(payload) {
  console.log(
    `${LOG_PREFIX} Event received: ${payload[FIELD_EVENT_TYPE]} | Severity: ${payload[FIELD_SEVERITY]} | Risk: ${payload[FIELD_RISK][FIELD_RISK_LEVEL]}`,
  );
}

function logMapsContext(payload) {
  const maps = payload[FIELD_MAPS] || {};
  const alternatives = maps[FIELD_ALTERNATIVE_ROUTES] ?? 0;
  const detour = maps[FIELD_DETOUR_RECOMMENDED];
  const address = maps[FIELD_INCIDENT_ADDRESS] || 'Unknown address';

  console.log(
    `${LOG_PREFIX} Maps: ${address} — ${alternatives} alternatives, detour: ${detour}`,
  );
}

function logVehiclesStops(payload) {
  const vehiclesCount = Array.isArray(payload[FIELD_VEHICLES]) ? payload[FIELD_VEHICLES].length : 0;
  const stopsCount = Array.isArray(payload[FIELD_STOPS]) ? payload[FIELD_STOPS].length : 0;

  console.log(`${LOG_PREFIX} Vehicles: ${vehiclesCount} | Stops: ${stopsCount}`);
}

function logRecommendedAction(payload) {
  const action = payload?.[FIELD_RISK]?.[FIELD_RECOMMENDED_ACTION] || 'No action provided';
  console.log(`${LOG_PREFIX} Action: ${action}`);
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
    return res.status(HTTP_STATUS_BAD_REQUEST).json(buildErrorResponse(missingFields));
  }

  if (!hasRiskLevel(payload)) {
    return res.status(HTTP_STATUS_BAD_REQUEST).json(buildMissingRiskLevelResponse());
  }

  if (!hasDetourRecommended(payload)) {
    return res.status(HTTP_STATUS_BAD_REQUEST).json(buildMissingDetourResponse());
  }

  logEventReceived(payload);
  logMapsContext(payload);
  logVehiclesStops(payload);
  logRecommendedAction(payload);

  return res.status(HTTP_STATUS_CREATED).json(buildTrafficEventSuccessResponse(payload));
}

app.post(WEBHOOK_PATH, handleTrafficEvent);

function handleNotify(req, res) {
  const payload = req.body;
  const missingFields = getMissingNotifyFields(payload);

  if (missingFields.length > 0) {
    return res.status(HTTP_STATUS_BAD_REQUEST).json(buildErrorResponse(missingFields));
  }

  try {
    const preview = buildMessage(payload);
    console.log(`${LOG_NOTIFY_PREFIX} Telegram mock preview:`);
    console.log(preview);

    return res.status(HTTP_STATUS_OK).json(buildNotifySuccessResponse(payload, preview));
  } catch (error) {
    return res.status(HTTP_STATUS_BAD_REQUEST).json({
      error: ERROR_INVALID_PAYLOAD,
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
