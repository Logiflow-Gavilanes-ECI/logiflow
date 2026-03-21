const { emitRouteUpdate } = require('../src/events/routeUpdate');

describe('emitRouteUpdate', () => {
  let mockIo;

  beforeEach(() => {
    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    };
  });

  test('emits route:update to fleet room', () => {
    const stops = [{ id: 's1', lat: 4.711, lng: -74.072, order: 1 }];

    emitRouteUpdate(mockIo, 'v-001', { stops, polyline: [], estimatedTime: 30, totalDistance: 5000 }, { eventType: 'new_order', totalCost: 100 });

    expect(mockIo.to).toHaveBeenCalledWith('fleet');
    expect(mockIo.emit).toHaveBeenCalledWith('route:update', expect.objectContaining({
      vehicleId: 'v-001',
    }));
  });

  test('emits route:update to vehicle room', () => {
    emitRouteUpdate(mockIo, 'v-001', { stops: [] }, {});

    expect(mockIo.to).toHaveBeenCalledWith('vehicle:v-001');
    expect(mockIo.emit).toHaveBeenCalledWith('route:update', expect.objectContaining({
      vehicleId: 'v-001',
    }));
  });

  test('payload contains vehicleId, stops and timestamp', () => {
    const stops = [{ id: 's1', lat: 4.711, lng: -74.072 }];

    emitRouteUpdate(mockIo, 'v-001', { stops }, {});

    expect(mockIo.emit).toHaveBeenCalledWith('route:update', expect.objectContaining({
      vehicleId: 'v-001',
      stops: expect.any(Array),
      timestamp: expect.any(String),
    }));
  });

  test('derives polyline from stops when polyline is not provided', () => {
    const stops = [
      { id: 's1', lat: 4.711, lng: -74.072, order: 1 },
      { id: 's2', lat: 4.720, lng: -74.080, order: 2 },
    ];

    emitRouteUpdate(mockIo, 'v-002', { stops }, {});

    expect(mockIo.emit).toHaveBeenCalledWith('route:update', expect.objectContaining({
      polyline: [
        { lat: 4.711, lng: -74.072 },
        { lat: 4.720, lng: -74.080 },
      ],
    }));
  });
});
