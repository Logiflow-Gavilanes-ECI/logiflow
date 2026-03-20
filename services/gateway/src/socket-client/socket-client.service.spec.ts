import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SocketClientService } from './socket-client.service';

describe('SocketClientService', () => {
  let service: SocketClientService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SocketClientService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue: string) => defaultValue),
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
              location: { lat: 4.711, lon: -74.072 },
              service: 0,
              waitingTime: 0,
              arrival: 2,
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
                lat: 4.711,
                lng: -74.072,
                lon: -74.072,
                arrivalOrder: 2,
              }),
            ],
          }),
        ],
      }),
    );
  });
});
