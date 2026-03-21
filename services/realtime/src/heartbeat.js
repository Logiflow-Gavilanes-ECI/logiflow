/**
 * checkHeartbeats — pure function extracted from index.js for testability.
 * Called by the setInterval in index.js every CHECK_INTERVAL_MS.
 *
 * @param {object} io               - Socket.io server instance
 * @param {object} vehicleHeartbeats - { vehicleId: lastSeenTimestampMs }
 * @param {Set}    offlineVehicles   - set of vehicleIds currently considered offline
 * @param {number} threshold         - OFFLINE_THRESHOLD_MS (default 15000)
 */
function checkHeartbeats(io, vehicleHeartbeats, offlineVehicles, threshold = 15000) {
  const now = Date.now();

  Object.entries(vehicleHeartbeats).forEach(([vehicleId, lastSeen]) => {
    const inactivoMs = now - lastSeen;

    if (inactivoMs > threshold && !offlineVehicles.has(vehicleId)) {
      offlineVehicles.add(vehicleId);
      io.to('fleet').emit('vehicle:offline', { vehicleId });
      console.log(`vehicle:offline emitido → ${vehicleId}`);
    } else if (inactivoMs <= threshold && offlineVehicles.has(vehicleId)) {
      offlineVehicles.delete(vehicleId);
      io.to('fleet').emit('vehicle:online', { vehicleId });
      console.log(`vehicle:online emitido → ${vehicleId}`);
    }
  });
}

module.exports = { checkHeartbeats };
