'use strict';

function parsePositiveIntEnv(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const STATUS_KEY_TTL_SECONDS = parsePositiveIntEnv(
  process.env.STATUS_KEY_TTL_SECONDS,
  60 * 60,
);

const VALID_STATUSES = new Set([
  'in_transit',
  'at_stop',
  'delivered',
  'en_camino',
  'en_parada',
  'entregado',
]);

/**
 * Validate and normalize an incoming `vehicle:status` payload from a driver client.
 * Returns a sanitized payload or null when the input is unusable.
 */
function normalizeStatusPayload(input) {
  if (!input || typeof input !== 'object') return null;

  const vehicleId = typeof input.vehicleId === 'string' ? input.vehicleId.trim() : '';
  if (!vehicleId) return null;

  const status = typeof input.status === 'string' ? input.status.trim() : '';
  if (!VALID_STATUSES.has(status)) return null;

  const stopId =
    typeof input.stopId === 'string' && input.stopId.trim() ? input.stopId.trim() : null;

  const timestamp =
    typeof input.timestamp === 'string' && input.timestamp
      ? input.timestamp
      : new Date().toISOString();

  return { vehicleId, status, stopId, timestamp };
}

async function persistLastStatus(redisClient, payload) {
  if (!redisClient || typeof redisClient.set !== 'function') return;
  try {
    await redisClient.set(
      `vehicle:${payload.vehicleId}:status`,
      JSON.stringify(payload),
      'EX',
      STATUS_KEY_TTL_SECONDS,
    );
  } catch (err) {
    console.error('[status] failed to persist last status:', err.message);
  }
}

/**
 * Handle an incoming `vehicle:status` event from a driver socket. Validates,
 * broadcasts to the fleet + per-vehicle rooms, and caches the last known
 * status in Redis so reconnecting dashboards can render the current state.
 *
 * @returns the normalized payload that was broadcast, or null when ignored.
 */
function handleIncomingStatus(io, raw, ctx = {}) {
  const payload = normalizeStatusPayload(raw);
  if (!payload) return null;

  const { redisClient } = ctx;

  io.to('fleet').emit('vehicle:status', payload);
  io.to(`vehicle:${payload.vehicleId}`).emit('vehicle:status', payload);

  void persistLastStatus(redisClient, payload);

  return payload;
}

module.exports = {
  handleIncomingStatus,
  normalizeStatusPayload,
  VALID_STATUSES,
};
