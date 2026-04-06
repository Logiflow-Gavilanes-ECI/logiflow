const { httpServer, io, initializeServer, app } = require('./server');
const { registerRooms } = require('./rooms');
const { startPositionBroadcast } = require('./events/position');
const { emitRouteUpdate } = require('./events/routeUpdate');
const { checkHeartbeats } = require('./heartbeat');
const { authMiddleware } = require('./middleware/auth');
require('dotenv').config();

const vehicleHeartbeats = {};

vehicleHeartbeats['v-001'] = 0;
vehicleHeartbeats['v-002'] = 0;
vehicleHeartbeats['v-003'] = 0;

const offlineVehicles = new Set();


const OFFLINE_THRESHOLD_MS = 15000; 
const CHECK_INTERVAL_MS    = 6000; 

const PORT = process.env.PORT || 3001;

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
      const { vehicleId } = data;
      if (vehicleId) {
        vehicleHeartbeats[vehicleId] = Date.now();
        console.log(`Heartbeat actualizado: ${vehicleId} → ${vehicleHeartbeats[vehicleId]}`);
      }
    });

    socket.on('route-update', (incoming) => {
      console.log('Core backend/front connected:', socket.id);

      const routes = Array.isArray(incoming?.routes) ? incoming.routes : [];

      routes.forEach((route) => {
        const vehicleId = route.vehicleId || route.vehicle_id;
        if (!vehicleId) return;

        const steps = (route.steps || []).map((s) => ({
          id: s.id || s.stopId,
          lat: s.lat ?? s.location?.lat,
          lng: s.lng ?? s.lon ?? s.location?.lon,
          order: s.arrivalOrder || s.arrival,
          type: s.type,
        }));

        const polyline = steps
          .filter((s) => s.lat != null && s.lng != null)
          .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
          .map((s) => ({ lat: s.lat, lng: s.lng }));

        const routeData = {
          stops: steps,
          polyline,
          estimatedTime: route.estimatedTime ?? route.duration,
          totalDistance: route.totalDistance ?? route.distance,
        };

        emitRouteUpdate(io, vehicleId, routeData, {
          eventType: incoming.eventType,
          totalCost: incoming.totalCost ?? incoming.routingDistance,
          solvedAt: incoming.solvedAt ?? incoming.emittedAt,
        });
      });
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