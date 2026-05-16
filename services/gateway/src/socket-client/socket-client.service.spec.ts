import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { io } from 'socket.io-client';
import * as jwt from 'jsonwebtoken';
import { SocketClientService } from './socket-client.service';

jest.mock('socket.io-client', () => ({
  io: jest.fn(),
}));

jest.mock('jsonwebtoken', () => ({
  sign: jest.fn(),
}));

describe('SocketClientService', () => {
  let service: SocketClientService;
  let configValues: Record<string, string | undefined>;
  let socketHandlers: Record<string, (...args: any[]) => void>;
  let socketMock: {
    on: jest.Mock;
    emit: jest.Mock;
    disconnect: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    configValues = {};
    socketHandlers = {};
    socketMock = {
      on: jest.fn((event: string, handler: (...args: any[]) => void) => {
        socketHandlers[event] = handler;
        return socketMock;
      }),
      emit: jest.fn(),
      disconnect: jest.fn(),
    };
    (io as jest.Mock).mockReturnValue(socketMock);
    (jwt.sign as jest.Mock).mockReturnValue('service-token');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocketClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              return configValues[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SocketClientService>(SocketClientService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should report disconnected before init', () => {
    expect(service.isConnected()).toBe(false);
  });

  it('initializes the socket client with a signed gateway service token', () => {
    configValues.SOCKETIO_SERVER_HOST = 'realtime';
    configValues.SOCKETIO_SERVER_PORT = '3001';
    configValues.JWT_SECRET = 'jwt-secret';

    service.onModuleInit();

    expect(jwt.sign).toHaveBeenCalledWith(
      {
        sub: 'gateway-service',
        role: 'admin',
        username: 'gateway-service',
      },
      'jwt-secret',
      { expiresIn: '1h' },
    );
    expect(io).toHaveBeenCalledWith(
      'http://realtime:3001',
      expect.objectContaining({
        autoConnect: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        auth: { token: 'service-token' },
      }),
    );

    socketHandlers.connect();
    expect(service.isConnected()).toBe(true);

    socketHandlers.disconnect('transport close');
    expect(service.isConnected()).toBe(false);

    socketHandlers.connect();
    socketHandlers.connect_error(new Error('ECONNREFUSED'));
    expect(service.isConnected()).toBe(false);
  });

  it('omits auth when no JWT secret is configured', () => {
    service.onModuleInit();

    expect(jwt.sign).not.toHaveBeenCalled();
    expect(io).toHaveBeenCalledWith(
      'http://localhost:3001',
      expect.objectContaining({
        auth: undefined,
      }),
    );
  });

  it('disconnects the socket on module destroy', () => {
    service.onModuleInit();

    service.onModuleDestroy();

    expect(socketMock.disconnect).toHaveBeenCalledTimes(1);
  });

  it('should throw when emitting while disconnected', () => {
    const mockRoutes = {
      code: '0',
      error: '',
      routes: [],
      unassigned: [],
      routingDistance: '0',
      routingDuration: '0',
    };

    expect(() => service.emitRouteUpdate('traffic_jam', mockRoutes)).toThrow(
      'Socket.io server not connected',
    );
  });

  it('throws when emitting stop:completed while disconnected', () => {
    expect(() =>
      service.emitStopCompleted({
        stopId: 's1',
        completedAt: '2026-05-07T12:00:00.000Z',
      }),
    ).toThrow('Socket.io server not connected');
  });

  it('emits stop:completed with a server-stamped emittedAt when connected', () => {
    const emit = jest.fn();
    const writableService = service as unknown as {
      connected: boolean;
      socket: { emit: (event: string, payload: unknown) => void };
    };

    writableService.connected = true;
    writableService.socket = { emit };

    service.emitStopCompleted({
      stopId: 's1',
      completedAt: '2026-05-07T12:00:00.000Z',
    });

    expect(emit).toHaveBeenCalledWith(
      'stop:completed',
      expect.objectContaining({
        stopId: 's1',
        completedAt: '2026-05-07T12:00:00.000Z',
        emittedAt: expect.any(String) as unknown,
      }),
    );
  });

  it('should map OptimizeResponse.routes to internal route payload format', () => {
    const emit = jest.fn();
    const writableService = service as unknown as {
      connected: boolean;
      socket: { emit: (event: string, payload: unknown) => void };
    };

    writableService.connected = true;
    writableService.socket = { emit };

    service.emitRouteUpdate('traffic_jam', {
      code: '0',
      error: '',
      routes: [
        {
          vehicleId: 'v-001',
          cost: 12,
          distance: '1000',
          duration: '300',
          steps: [
            {
              type: 'job',
              id: 'j-001',
              address: '  Calle 80 #11-22  ',
              location: { lat: 4.711, lon: -74.072 },
              service: 0,
              waitingTime: 0,
              arrival: 0,
              departure: 2,
              amount: 1,
              skills: [],
            },
          ],
          delivery: 0,
          pickup: 0,
        },
      ],
      unassigned: [],
      routingDistance: '1000',
      routingDuration: '300',
    });

    expect(emit).toHaveBeenCalledWith(
      'route-update',
      expect.objectContaining({
        eventType: 'traffic_jam',
        routes: [
          expect.objectContaining({
            vehicleId: 'v-001',
            totalDistance: 1000,
            estimatedTime: 300,
            steps: [
              expect.objectContaining({
                id: 'j-001',
                stopId: 'j-001',
                address: 'Calle 80 #11-22',
                lat: 4.711,
                lng: -74.072,
                lon: -74.072,
                arrivalOrder: 1,
                status: 'pending',
              }),
            ],
          }),
        ],
      }),
    );
  });
});
