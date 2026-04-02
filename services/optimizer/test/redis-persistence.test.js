const { buildRouteRedisKey, persistRoutesToRedis } = require('../src/server');

describe('Redis route persistence', () => {
  test('builds canonical route key with string vehicle id', () => {
    expect(buildRouteRedisKey('v-001')).toBe('route:vehicle:v-001');
  });

  test('persists each route using canonical vehicle key', async () => {
    const set = jest.fn().mockResolvedValue('OK');
    const connect = jest.fn().mockResolvedValue(undefined);
    const mockClient = {
      status: 'wait',
      connect,
      set,
    };

    const grpcResponse = {
      routes: [
        {
          vehicleId: 'v-001',
          steps: [{ id: 'j-001', type: 'job' }],
          distance: 1000,
          duration: 600,
          cost: 10,
        },
      ],
    };

    const call = {
      metadata: {
        get: jest.fn().mockReturnValue(['corr-redis-1']),
      },
    };

    await persistRoutesToRedis(grpcResponse, call, mockClient);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toBe('route:vehicle:v-001');
    expect(set.mock.calls[0][2]).toBe('EX');
    expect(typeof set.mock.calls[0][3]).toBe('number');
    expect(set.mock.calls[0][3]).toBeGreaterThan(0);

    const payload = JSON.parse(set.mock.calls[0][1]);
    expect(payload.vehicleId).toBe('v-001');
    expect(payload.correlationId).toBe('corr-redis-1');
  });
});
