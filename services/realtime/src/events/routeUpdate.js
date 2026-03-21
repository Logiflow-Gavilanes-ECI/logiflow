function emitRouteUpdate(io, vehicleId, routeData, meta = {}) {
  const stops = routeData.stops || [];

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

module.exports = { emitRouteUpdate };