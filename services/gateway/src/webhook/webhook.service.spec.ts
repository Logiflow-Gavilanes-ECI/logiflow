import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { SocketClientService } from '../socket-client/socket-client.service';
import { RetryService } from '../common/retry/retry.service';

const mockSocketClientService = {
  emitRouteUpdate: jest.fn(),
  isConnected: jest.fn().mockReturnValue(false),
};

// executes the operation directly without delays so that unit tests remain synchronous and fast.
const mockRetryService = {
  execute: jest
    .fn()
    .mockImplementation((operation: () => Promise<unknown>) => operation()),
};

const mockGrpcClientService = {
  solveRoute: jest.fn().mockResolvedValue({
    routes: [
      {
        vehicleId: 'v1',
        steps: [{ stopId: 's1', lat: 4.6097, lng: -74.0817, arrivalOrder: 1 }],
        totalDistance: 12.5,
        estimatedTime: 25.0,
      },
    ],
    totalCost: 100.0,
    solvedAt: '2026-03-05T00:00:00.000Z',
  }),
};

describe('WebhookService', () => {
  let service: WebhookService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        { provide: GrpcClientService, useValue: mockGrpcClientService },
        { provide: SocketClientService, useValue: mockSocketClientService },
        { provide: RetryService, useValue: mockRetryService },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleEvent', () => {
    it('should call gRPC optimizer and return optimized routes', async () => {
      const result = await service.handleEvent(
        {
          eventType: 'new_order',
          vehicles: [{ id: 'v1', lat: 4.711, lng: -74.0721, capacity: 100 }],
          stops: [{ id: 's1', lat: 4.6097, lng: -74.0817, demand: 20 }],
        },
        'corr-123',
      );

      expect(result.received).toBe(true);
      expect(result.eventType).toBe('new_order');
      expect(result.correlationId).toBe('corr-123');
      expect(result.vehicleCount).toBe(1);
      expect(result.stopCount).toBe(1);
      expect(result.optimizedRoutes).toBeDefined();
      expect(result.optimizedRoutes.routes).toHaveLength(1);
      expect(result.socketConnected).toBe(false);
      expect(mockGrpcClientService.solveRoute).toHaveBeenCalledWith(
        expect.objectContaining({ eventType: 'new_order' }),
        'corr-123',
      );
      expect(mockSocketClientService.emitRouteUpdate).toHaveBeenCalledWith(
        'new_order',
        result.optimizedRoutes,
        'corr-123',
      );
    });

    it('should use mock response when gRPC is unavailable', async () => {
      mockGrpcClientService.solveRoute.mockRejectedValueOnce(
        new Error('Connection refused'),
      );

      const result = await service.handleEvent(
        {
          eventType: 'traffic_jam',
          vehicles: [{ id: 'v1', lat: 4.711, lng: -74.0721, capacity: 100 }],
          stops: [{ id: 's1', lat: 4.6097, lng: -74.0817, demand: 20 }],
        },
        'corr-failure',
      );

      expect(result.received).toBe(true);
      expect(result.optimizedRoutes).toBeDefined();
      expect(result.optimizedRoutes.routes).toHaveLength(1);
      expect(result.optimizedRoutes.solvedAt).toBeDefined();
      expect(mockSocketClientService.emitRouteUpdate).toHaveBeenCalledWith(
        'traffic_jam',
        result.optimizedRoutes,
        'corr-failure',
      );
    });
  });
});
