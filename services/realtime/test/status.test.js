const {
  handleIncomingStatus,
  normalizeStatusPayload,
} = require('../src/events/status');

function makeMockIo() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  return { to, emit };
}

describe('normalizeStatusPayload', () => {
  test('rejects missing vehicleId', () => {
    expect(normalizeStatusPayload({ status: 'en_camino' })).toBeNull();
  });

  test('rejects unknown status', () => {
    expect(normalizeStatusPayload({ vehicleId: 'v-1', status: 'arrived' })).toBeNull();
  });

  test('rejects empty payload', () => {
    expect(normalizeStatusPayload(null)).toBeNull();
    expect(normalizeStatusPayload(undefined)).toBeNull();
    expect(normalizeStatusPayload('not-an-object')).toBeNull();
  });

  test('accepts each valid status and trims fields', () => {
    for (const status of ['en_camino', 'en_parada', 'entregado']) {
      const out = normalizeStatusPayload({
        vehicleId: '  v-001  ',
        status,
        stopId: '  s-7  ',
      });
      expect(out).toMatchObject({ vehicleId: 'v-001', status, stopId: 's-7' });
      expect(typeof out.timestamp).toBe('string');
    }
  });

  test('coerces missing stopId to null and fills timestamp', () => {
    const out = normalizeStatusPayload({ vehicleId: 'v-1', status: 'en_camino' });
    expect(out.stopId).toBeNull();
    expect(out.timestamp).toEqual(expect.any(String));
  });

  test('preserves provided ISO timestamp', () => {
    const ts = '2026-05-12T17:00:00.000Z';
    const out = normalizeStatusPayload({
      vehicleId: 'v-1',
      status: 'entregado',
      timestamp: ts,
    });
    expect(out.timestamp).toBe(ts);
  });
});

describe('handleIncomingStatus', () => {
  test('broadcasts to fleet and vehicle rooms with sanitized payload', () => {
    const io = makeMockIo();

    const payload = handleIncomingStatus(io, {
      vehicleId: 'v-001',
      status: 'en_parada',
      stopId: 's-3',
    });

    expect(payload).toMatchObject({
      vehicleId: 'v-001',
      status: 'en_parada',
      stopId: 's-3',
    });
    expect(io.to).toHaveBeenCalledWith('fleet');
    expect(io.to).toHaveBeenCalledWith('vehicle:v-001');
    expect(io.emit).toHaveBeenCalledTimes(2);
    expect(io.emit).toHaveBeenCalledWith('vehicle:status', payload);
  });

  test('returns null for invalid payload and does not broadcast', () => {
    const io = makeMockIo();
    const result = handleIncomingStatus(io, { vehicleId: 'v-1', status: 'flying' });
    expect(result).toBeNull();
    expect(io.to).not.toHaveBeenCalled();
  });

  test('persists last status in Redis when client is provided', async () => {
    const io = makeMockIo();
    const set = jest.fn().mockResolvedValue('OK');
    const redisClient = { set };

    handleIncomingStatus(
      io,
      { vehicleId: 'v-001', status: 'entregado', stopId: 's-1' },
      { redisClient },
    );

    await new Promise((resolve) => setImmediate(resolve));

    expect(set).toHaveBeenCalledWith(
      'vehicle:v-001:status',
      expect.stringContaining('"status":"entregado"'),
      'EX',
      expect.any(Number),
    );
  });
});
