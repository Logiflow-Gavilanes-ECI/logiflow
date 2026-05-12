'use strict';

function parsePositiveIntEnv(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

const POSITION_KEY_TTL_SECONDS = parsePositiveIntEnv(
  process.env.POSITION_KEY_TTL_SECONDS,
  60 * 5,
);

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

/**
 * Validate and normalize an incoming `vehicle:position` payload from a driver client.
 * Returns a sanitized payload or null when the input is unusable.
 */
function normalizePositionPayload(input) {
  if (!input || typeof input !== 'object') return null;

  const vehicleId = typeof input.vehicleId === 'string' ? input.vehicleId.trim() : '';
  if (!vehicleId) return null;

  const lat = Number(input.lat);
  const lng = Number(input.lng);
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  const speed = isFiniteNumber(Number(input.speed)) ? Number(input.speed) : null;
  const heading = isFiniteNumber(Number(input.heading)) ? Number(input.heading) : null;
  const accuracy = isFiniteNumber(Number(input.accuracy)) ? Number(input.accuracy) : null;
  const timestamp =
    typeof input.timestamp === 'string' && input.timestamp
      ? input.timestamp
      : new Date().toISOString();

  return {
    vehicleId,
    lat,
    lng,
    speed,
    heading,
    accuracy,
    timestamp,
  };
}

async function persistLastPosition(redisClient, payload) {
  if (!redisClient || typeof redisClient.set !== 'function') return;
  try {
    await redisClient.set(
      `vehicle:${payload.vehicleId}:position`,
      JSON.stringify(payload),
      'EX',
      POSITION_KEY_TTL_SECONDS,
    );
  } catch (err) {
    console.error('[position] failed to persist last position:', err.message);
  }
}

/**
 * Handle an incoming `vehicle:position` event from a driver socket.
 * Validates, updates heartbeat, flips offline → online when needed, broadcasts
 * to the fleet + per-vehicle rooms, and caches the last known position in Redis.
 *
 * @returns the normalized payload that was broadcast, or null when ignored.
 */
function handleIncomingPosition(io, raw, ctx = {}) {
  const payload = normalizePositionPayload(raw);
  if (!payload) return null;

  const { vehicleHeartbeats, offlineVehicles, redisClient } = ctx;

  if (vehicleHeartbeats) {
    vehicleHeartbeats[payload.vehicleId] = Date.now();
  }

  if (offlineVehicles && offlineVehicles.has(payload.vehicleId)) {
    offlineVehicles.delete(payload.vehicleId);
    io.to('fleet').emit('vehicle:online', { vehicleId: payload.vehicleId });
  }

  io.to('fleet').emit('vehicle:position', payload);
  io.to(`vehicle:${payload.vehicleId}`).emit('vehicle:position', payload);

  if (redisClient) {
    void persistLastPosition(redisClient, payload);
  }

  return payload;
}

/**
 * Optional simulator. Off by default; enable with SIMULATE_POSITIONS=true for
 * demos / local dev when no real driver clients are connected.
 */
function startPositionBroadcast(io, vehicleHeartbeats) {
  if (process.env.SIMULATE_POSITIONS !== 'true') {
    return null;
  }

  const vehicles = [
    { vehicleId: 'v-001', lat: 4.7110, lng: -74.0721 },
    { vehicleId: 'v-002', lat: 4.6800, lng: -74.0500 },
  ];

  const interval = setInterval(() => {
    vehicles.forEach((vehicle) => {
      vehicle.lat += (Math.random() - 0.5) * 0.001;
      vehicle.lng += (Math.random() - 0.5) * 0.001;

      handleIncomingPosition(
        io,
        {
          vehicleId: vehicle.vehicleId,
          lat: vehicle.lat,
          lng: vehicle.lng,
          speed: Math.floor(Math.random() * 60) + 20,
        },
        { vehicleHeartbeats },
      );
    });
  }, 5000);

  console.log('[position] simulator enabled (SIMULATE_POSITIONS=true)');
  return interval;
}

module.exports = {
  startPositionBroadcast,
  handleIncomingPosition,
  normalizePositionPayload,
};
