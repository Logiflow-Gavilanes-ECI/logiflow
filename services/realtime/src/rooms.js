'use strict';

const { normalizePositionPayload } = require('./events/position');

const POSITION_KEY_PATTERN = 'vehicle:*:position';
const POSITION_SCAN_COUNT = 100;

function parseStoredPosition(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return normalizePositionPayload(JSON.parse(raw));
  } catch (err) {
    console.warn('[rooms] invalid stored vehicle position ignored:', err.message);
    return null;
  }
}

async function scanPositionKeys(redisClient) {
  if (!redisClient || typeof redisClient.scan !== 'function') return [];

  const keys = [];
  let cursor = '0';

  do {
    const [nextCursor, pageKeys = []] = await redisClient.scan(
      cursor,
      'MATCH',
      POSITION_KEY_PATTERN,
      'COUNT',
      POSITION_SCAN_COUNT,
    );
    cursor = String(nextCursor);
    keys.push(...pageKeys);
  } while (cursor !== '0');

  return keys;
}

async function getCurrentFleetPositions(redisClient) {
  const keys = await scanPositionKeys(redisClient);
  if (keys.length === 0) return [];

  let values;
  if (typeof redisClient.mget === 'function') {
    values = await redisClient.mget(keys);
  } else if (typeof redisClient.get === 'function') {
    values = await Promise.all(keys.map((key) => redisClient.get(key)));
  } else {
    return [];
  }

  return values
    .map(parseStoredPosition)
    .filter(Boolean)
    .sort((a, b) => a.vehicleId.localeCompare(b.vehicleId));
}

async function emitCurrentFleetPositions(socket, redisClient) {
  const positions = await getCurrentFleetPositions(redisClient);
  positions.forEach((position) => {
    socket.emit('vehicle:position', position);
  });
  return positions.length;
}

function registerRooms(io, ctx = {}) {
  const { redisClient } = ctx;

  io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    // Handle joining fleet room
    socket.on('join:fleet', async () => {
      socket.join('fleet');
      console.log(`${socket.id} joined fleet room`);
      socket.emit('joined', { room: 'fleet' });
      try {
        const snapshotCount = await emitCurrentFleetPositions(socket, redisClient);
        if (snapshotCount > 0) {
          console.log(`${socket.id} received ${snapshotCount} current vehicle positions`);
        }
      } catch (err) {
        console.error('[rooms] failed to emit fleet position snapshot:', err.message);
      }
    });

    // Handle joining vehicle-specific room
    socket.on('join:vehicle', ({ vehicleId }) => {
      socket.join(`vehicle:${vehicleId}`);
      console.log(`${socket.id} joined vehicle:${vehicleId}`);
      socket.emit('joined', { room: `vehicle:${vehicleId}` });
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}

module.exports = {
  registerRooms,
  getCurrentFleetPositions,
  emitCurrentFleetPositions,
};
