const {
  emitCurrentFleetPositions,
  getCurrentFleetPositions,
  registerRooms,
} = require('../src/rooms');

describe('fleet room position snapshot', () => {
  test('loads current vehicle positions from redis using scan', async () => {
    const redisClient = {
      scan: jest
        .fn()
        .mockResolvedValueOnce(['7', ['vehicle:v-002:position']])
        .mockResolvedValueOnce(['0', ['vehicle:v-001:position', 'vehicle:bad:position']]),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          vehicleId: 'v-002',
          lat: 4.6281,
          lng: -74.162,
          speed: null,
          timestamp: '2026-05-15T21:00:00.000Z',
        }),
        JSON.stringify({
          vehicleId: 'v-001',
          lat: 4.711,
          lng: -74.081,
          speed: 28,
          timestamp: '2026-05-15T21:00:01.000Z',
        }),
        'not-json',
      ]),
    };

    const positions = await getCurrentFleetPositions(redisClient);

    expect(redisClient.scan).toHaveBeenCalledWith(
      '0',
      'MATCH',
      'vehicle:*:position',
      'COUNT',
      100,
    );
    expect(redisClient.scan).toHaveBeenCalledWith(
      '7',
      'MATCH',
      'vehicle:*:position',
      'COUNT',
      100,
    );
    expect(redisClient.mget).toHaveBeenCalledWith([
      'vehicle:v-002:position',
      'vehicle:v-001:position',
      'vehicle:bad:position',
    ]);
    expect(positions).toEqual([
      expect.objectContaining({ vehicleId: 'v-001', lat: 4.711, lng: -74.081, speed: 28 }),
      expect.objectContaining({ vehicleId: 'v-002', lat: 4.6281, lng: -74.162, speed: null }),
    ]);
  });

  test('emits each current position only to the newly joined socket', async () => {
    const socket = { emit: jest.fn() };
    const redisClient = {
      scan: jest.fn().mockResolvedValue(['0', ['vehicle:v-001:position']]),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          vehicleId: 'v-001',
          lat: 4.711,
          lng: -74.081,
          timestamp: '2026-05-15T21:00:00.000Z',
        }),
      ]),
    };

    await expect(emitCurrentFleetPositions(socket, redisClient)).resolves.toBe(1);
    expect(socket.emit).toHaveBeenCalledWith(
      'vehicle:position',
      expect.objectContaining({ vehicleId: 'v-001', lat: 4.711, lng: -74.081 }),
    );
  });

  test('join:fleet joins the room, acknowledges, and sends the position snapshot', async () => {
    const handlers = {};
    const socket = {
      id: 'socket-1',
      join: jest.fn(),
      emit: jest.fn(),
      on: jest.fn((event, handler) => {
        handlers[event] = handler;
      }),
    };
    const io = {
      on: jest.fn((event, handler) => {
        if (event === 'connection') handler(socket);
      }),
    };
    const redisClient = {
      scan: jest.fn().mockResolvedValue(['0', ['vehicle:v-001:position']]),
      mget: jest.fn().mockResolvedValue([
        JSON.stringify({
          vehicleId: 'v-001',
          lat: 4.711,
          lng: -74.081,
          timestamp: '2026-05-15T21:00:00.000Z',
        }),
      ]),
    };

    registerRooms(io, { redisClient });
    await handlers['join:fleet']();

    expect(socket.join).toHaveBeenCalledWith('fleet');
    expect(socket.emit).toHaveBeenCalledWith('joined', { room: 'fleet' });
    expect(socket.emit).toHaveBeenCalledWith(
      'vehicle:position',
      expect.objectContaining({ vehicleId: 'v-001', lat: 4.711, lng: -74.081 }),
    );
  });
});
