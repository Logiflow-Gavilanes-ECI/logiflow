const { httpServer, io, initializeServer, app } = require('./server');
const { registerRooms } = require('./rooms');
const { startPositionBroadcast, handleIncomingPosition } = require('./events/position');
const { handleIncomingStatus } = require('./events/status');
const { emitRouteUpdate } = require('./events/routeUpdate');
const { checkHeartbeats } = require('./heartbeat');
const { authMiddleware } = require('./middleware/auth');
const { pubClient } = require('./redis');
require('dotenv').config();

const vehicleHeartbeats = {};

const offlineVehicles = new Set();


const OFFLINE_THRESHOLD_MS = 15000; 
const CHECK_INTERVAL_MS    = 6000; 

const PORT = process.env.PORT || 3001;

function normalizeStep(s) {
  return {
    id: s.id || s.stopId,
    lat: s.lat ?? s.location?.lat,
    lng: s.lng ?? s.lon ?? s.location?.lon,
    order: s.arrivalOrder || s.arrival,
    type: s.type,
  };
}

function processRouteUpdate(io, route, incoming) {
  const vehicleId = route.vehicleId || route.vehicle_id;
  if (!vehicleId) return;

  const steps = (route.steps || []).map(normalizeStep);

  const polyline = steps
    .filter((s) => s.lat != null && s.lng != null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => ({ lat: s.lat, lng: s.lng }));

  emitRouteUpdate(io, vehicleId, {
    stops: steps,
    polyline,
    estimatedTime: route.estimatedTime ?? route.duration,
    totalDistance: route.totalDistance ?? route.distance,
  }, {
    eventType: incoming.eventType,
    totalCost: incoming.totalCost ?? incoming.routingDistance,
    solvedAt: incoming.solvedAt ?? incoming.emittedAt,
  });
}

async function main() {
  await initializeServer();

  io.use(authMiddleware);

  registerRooms(io);
  startPositionBroadcast(io, vehicleHeartbeats);

  app.use(require('express').json());

  app.post('/emit/route-update', (req, res) => {
    const { 
      vehicleId, 
      stops, 
      estimatedTime, 
      polyline,
      totalDistance,
      eventType,
      totalCost,
      solvedAt
    } = req.body;

    emitRouteUpdate(
      io, 
      vehicleId, 
      { stops, estimatedTime, polyline, totalDistance },
      { eventType, totalCost, solvedAt }
    );

    res.json({ success: true });
  });

  io.on('connection', (socket) => {
    socket.on('vehicle:position', (data) => {
      const broadcast = handleIncomingPosition(io, data, {
        vehicleHeartbeats,
        offlineVehicles,
        redisClient: pubClient,
      });
      if (!broadcast) {
        console.warn('[vehicle:position] payload rejected from socket', socket.id);
      }
    });

    socket.on('route-update', (incoming) => {
      console.log('Core backend/front connected:', socket.id);

      const routes = Array.isArray(incoming?.routes) ? incoming.routes : [];
      routes.forEach((route) => processRouteUpdate(io, route, incoming));
    });

    socket.on('vehicle:status', (data) => {
      const broadcast = handleIncomingStatus(io, data, { redisClient: pubClient });
      if (!broadcast) {
        console.warn('[vehicle:status] payload rejected from socket', socket.id);
      }
    });

    socket.on('stop:completed', (incoming) => {
      const stopId = typeof incoming?.stopId === 'string' ? incoming.stopId.trim() : '';
      const completedAt = typeof incoming?.completedAt === 'string' ? incoming.completedAt : null;
      if (!stopId || !completedAt) return;

      const vehicleIdRaw =
        typeof incoming.vehicleId === 'string' ? incoming.vehicleId.trim() : '';
      const payload = {
        stopId,
        completedAt,
        vehicleId: vehicleIdRaw || null,
        emittedAt: new Date().toISOString(),
      };

      io.to('fleet').emit('stop:completed', payload);
      if (payload.vehicleId) {
        io.to(`vehicle:${payload.vehicleId}`).emit('stop:completed', payload);
      }
    });
  });

  setInterval(() => {
    checkHeartbeats(io, vehicleHeartbeats, offlineVehicles, OFFLINE_THRESHOLD_MS);
  }, CHECK_INTERVAL_MS);

  httpServer.listen(PORT, () => {
    console.log(`Socket Gateway running on port ${PORT}`);
  });
}

main().catch(console.error);