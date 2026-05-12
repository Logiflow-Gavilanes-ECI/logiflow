const {
  handleIncomingPosition,
  normalizePositionPayload,
} = require('../src/events/position');

function makeMockIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

describe('normalizePositionPayload', () => {
  test('rejects missing vehicleId', () => {
    expect(normalizePositionPayload({ lat: 4.7, lng: -74.0 })).toBeNull();
  });

  test('rejects non-finite coords', () => {
    expect(normalizePositionPayload({ vehicleId: 'v-1', lat: 'NaN', lng: -74 })).toBeNull();
    expect(normalizePositionPayload({ vehicleId: 'v-1', lat: 200, lng: -74 })).toBeNull();
  });

  test('coerces numeric strings and fills timestamp', () => {
    const out = normalizePositionPayload({ vehicleId: 'v-1', lat: '4.71', lng: '-74.07' });
    expect(out.lat).toBe(4.71);
    expect(out.lng).toBe(-74.07);
    expect(typeof out.timestamp).toBe('string');
  });
});

describe('handleIncomingPosition', () => {
  test('broadcasts to fleet and vehicle rooms with sanitized payload', () => {
    const io = makeMockIo();
    const heartbeats = {};

    const payload = handleIncomingPosition(
      io,
      { vehicleId: 'v-001', lat: 4.71, lng: -74.07, speed: 42 },
      { vehicleHeartbeats: heartbeats },
    );

    expect(payload).toMatchObject({ vehicleId: 'v-001', lat: 4.71, lng: -74.07, speed: 42 });
    expect(io.to).toHaveBeenCalledWith('fleet');
    expect(io.to).toHaveBeenCalledWith('vehicle:v-001');
    expect(heartbeats['v-001']).toEqual(expect.any(Number));
  });

  test('returns null for invalid payload and does not broadcast', () => {
    const io = makeMockIo();
    const result = handleIncomingPosition(io, { vehicleId: '', lat: 'x', lng: 'y' }, {});
    expect(result).toBeNull();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('flips an offline vehicle back to online when a position arrives', () => {
    const io = makeMockIo();
    const offlineVehicles = new Set(['v-002']);

    handleIncomingPosition(
      io,
      { vehicleId: 'v-002', lat: 4.7, lng: -74.0 },
      { offlineVehicles },
    );

    expect(offlineVehicles.has('v-002')).toBe(false);
    expect(io.to).toHaveBeenCalledWith('fleet');
    const events = io.emit.mock.calls.map((c) => c[0]);
    expect(events).toContain('vehicle:online');
    expect(events).toContain('vehicle:position');
  });

  test('persists last position to redis when client is provided', async () => {
    const io = makeMockIo();
    const set = jest.fn(() => Promise.resolve('OK'));

    handleIncomingPosition(
      io,
      { vehicleId: 'v-003', lat: 4.7, lng: -74.0 },
      { redisClient: { set } },
    );

    await new Promise((resolve) => setImmediate(resolve));
    expect(set).toHaveBeenCalledWith(
      'vehicle:v-003:position',
      expect.any(String),
      'EX',
      expect.any(Number),
    );
  });
});
