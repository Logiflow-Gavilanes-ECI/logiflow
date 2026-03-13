const { httpServer, io, initializeServer, app } = require('./server');
const { registerRooms } = require('./rooms');
const { startPositionBroadcast } = require('./events/position');
const { emitRouteUpdate } = require('./events/routeUpdate');
require('dotenv').config();

const vehicleHeartbeats = {};


const OFFLINE_THRESHOLD_MS = 15000; 
const CHECK_INTERVAL_MS    = 5000; 

const PORT = process.env.PORT || 3001;

async function main() {
  await initializeServer();

  registerRooms(io);
  startPositionBroadcast(io);

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
        const vehicleId = route.vehicleId;
        if (!vehicleId) return;

        const routeData = {
          stops: (route.steps || []).map((s) => ({
            id: s.stopId,
            lat: s.lat,
            lng: s.lng,
            order: s.arrivalOrder,
          })),
          polyline: [],
          estimatedTime: route.estimatedTime,
          totalDistance: route.totalDistance,
        };

        emitRouteUpdate(io, vehicleId, routeData, {
          eventType: incoming.eventType,
          totalCost: incoming.totalCost,
          solvedAt: incoming.solvedAt,
        });
      });
    });
  });

  setInterval(() => {
    const now = Date.now();

    Object.entries(vehicleHeartbeats).forEach(([vehicleId, lastSeen]) => {
      const inactivoMs = now - lastSeen;

      if (inactivoMs > OFFLINE_THRESHOLD_MS) {
        console.log(`Vehículo ${vehicleId} sin señal por ${inactivoMs}ms`);
      }
    });
  }, CHECK_INTERVAL_MS);

  httpServer.listen(PORT, () => {
    console.log(`Socket Gateway running on port ${PORT}`);
  });
}

main().catch(console.error);