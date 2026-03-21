const { httpServer, io, initializeServer, app } = require('./server');
const { registerRooms } = require('./rooms');
const { startPositionBroadcast } = require('./events/position');
const { emitRouteUpdate } = require('./events/routeUpdate');
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

        const routeData = {
          stops: (route.steps || []).map((s) => ({
            id: s.id || s.stopId,
            lat: s.lat ?? s.location?.lat,
            lng: s.lng ?? s.lon ?? s.location?.lon,
            order: s.arrivalOrder || s.arrival,
            type: s.type,
          })),
          polyline: [],
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
    const now = Date.now();
    //console.log(`Checker corriendo. Vehículos en mapa: ${Object.keys(vehicleHeartbeats)}`);

    Object.entries(vehicleHeartbeats).forEach(([vehicleId, lastSeen]) => {
      const inactivoMs = now - lastSeen;
      //console.log(`${vehicleId} → inactivo ${inactivoMs}ms, offline: ${offlineVehicles.has(vehicleId)}`);

      if (inactivoMs > OFFLINE_THRESHOLD_MS && !offlineVehicles.has(vehicleId)) {
      
        offlineVehicles.add(vehicleId);
        io.to('fleet').emit('vehicle:offline', { vehicleId });
        console.log(`vehicle:offline emitido → ${vehicleId}`);

      } else if (inactivoMs <= OFFLINE_THRESHOLD_MS && offlineVehicles.has(vehicleId)) {
       
        offlineVehicles.delete(vehicleId);
        io.to('fleet').emit('vehicle:online', { vehicleId });
        console.log(`vehicle:online emitido → ${vehicleId}`);
      }
    });
  }, CHECK_INTERVAL_MS);

  httpServer.listen(PORT, () => {
    console.log(`Socket Gateway running on port ${PORT}`);
  });
}

main().catch(console.error);