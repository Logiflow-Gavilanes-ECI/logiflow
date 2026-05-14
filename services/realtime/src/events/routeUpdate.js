function emitRouteUpdate(io, vehicleId, routeData, meta = {}) {
  const stops = (routeData.stops || []).map((stop, index) => ({
    ...stop,
    address: stop.address || buildDemoStopAddress(index),
  }));

  // Derive polyline from stops sorted by arrival order when not explicitly provided.
  // This ensures polyline is never empty when the optimizer returns valid RouteStep coords.
  const derivedPolyline = stops
    .filter((s) => s.lat != null && s.lng != null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => ({ lat: s.lat, lng: s.lng }));

  const polyline =
    routeData.polyline && routeData.polyline.length > 0
      ? routeData.polyline
      : derivedPolyline;

  const payload = {
    vehicleId,
    stops,
    polyline,
    estimatedTime: routeData.estimatedTime,
    totalDistance: routeData.totalDistance,
    eventType: meta.eventType,
    totalCost: meta.totalCost,
    solvedAt: meta.solvedAt,
    timestamp: new Date().toISOString(),
  };

  io.to('fleet').emit('route:update', payload);
  io.to(`vehicle:${vehicleId}`).emit('route:update', payload);

  console.log(`Route update emitted for vehicle ${vehicleId} — ${polyline.length} polyline points`);
}

function buildDemoStopAddress(index) {
  const demoAddresses = [
    'Cra 7 #45-12, Bogotá',
    'Calle 72 #10-34, Bogotá',
    'Av. Caracas #26-85, Bogotá',
    'Carrera 15 #93-47, Bogotá',
    'Calle 100 #19-61, Bogotá',
  ];

  return demoAddresses[index % demoAddresses.length];
}

module.exports = { emitRouteUpdate };
