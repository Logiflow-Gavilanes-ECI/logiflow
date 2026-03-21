'use strict';

const RISK_EMOJIS = {
  CRITICAL: '🔴',
  HIGH: '🟠',
  MEDIUM: '🟡',
  LOW: '🟡',
};

const DEFAULT_ACTIONS = {
  CRITICAL: 'Reroute immediately and notify drivers',
  HIGH: 'Calculate detour and monitor ETA impact',
  MEDIUM: 'Monitor and evaluate route impact',
  LOW: 'Monitor conditions',
};

const TIMEZONE = 'America/Bogota';

function assertRequiredField(payload, fieldName) {
  if (payload[fieldName] === undefined || payload[fieldName] === null || payload[fieldName] === '') {
    throw new Error(`Missing required field: ${fieldName}`);
  }
}

function normalizeVehicleName(vehicle) {
  if (typeof vehicle === 'string') {
    return vehicle;
  }

  if (vehicle && typeof vehicle === 'object') {
    return vehicle.id || vehicle.vehicleId || JSON.stringify(vehicle);
  }

  return String(vehicle);
}

function normalizeAffectedVehicles(payload) {
  const source = Array.isArray(payload.affectedVehicles)
    ? payload.affectedVehicles
    : Array.isArray(payload.vehicles)
      ? payload.vehicles
      : null;

  if (!source || source.length === 0) {
    throw new Error('Missing required field: affectedVehicles');
  }

  const normalized = [];
  let index = 0;

  while (index < source.length) {
    normalized.push(normalizeVehicleName(source[index]));
    index += 1;
  }

  return normalized;
}

function formatLocalTimestamp(rawTimestamp) {
  const timestamp = rawTimestamp || new Date().toISOString();
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    throw new Error('Invalid timestamp format');
  }

  return new Intl.DateTimeFormat('en-US', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

function resolveRiskLevel(payload) {
  const riskLevel = String(payload.riskLevel || payload.severity || '').toUpperCase();

  if (!riskLevel) {
    throw new Error('Missing required field: riskLevel');
  }

  return riskLevel;
}

function resolveLocation(payload) {
  if (payload.location && typeof payload.location === 'object' && payload.location.description) {
    return payload.location.description;
  }

  return payload.locationDescription || payload.incidentAddress || 'Unknown location';
}

function resolveAction(payload, riskLevel) {
  return payload.action || payload.recommendedAction || DEFAULT_ACTIONS[riskLevel] || DEFAULT_ACTIONS.MEDIUM;
}

function buildMessage(payload) {
  assertRequiredField(payload, 'eventType');

  const riskLevel = resolveRiskLevel(payload);
  const vehicles = normalizeAffectedVehicles(payload);
  const location = resolveLocation(payload);
  const action = resolveAction(payload, riskLevel);
  const formattedTimestamp = formatLocalTimestamp(payload.timestamp);
  const emoji = RISK_EMOJIS[riskLevel] || RISK_EMOJIS.MEDIUM;

  return [
    `${emoji} ${riskLevel} ALERT - LogiFlow`,
    '━━━━━━━━━━━━━━━━━━━━━━━',
    `📍 ${location}`,
    `⚠️ Event: ${String(payload.eventType).toUpperCase()} (Severity: ${riskLevel})`,
    `🚛 Affected vehicles: ${vehicles.join(', ')}`,
    `🔁 Action: ${action}`,
    `🕐 ${formattedTimestamp} (Bogota)`,
    '━━━━━━━━━━━━━━━━━━━━━━━',
    'Sent by LogiFlow Automation · Sprint 2',
  ].join('\n');
}

module.exports = {
  buildMessage,
  RISK_EMOJIS,
  DEFAULT_ACTIONS,
};
