import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { SocketClientService } from '../socket-client/socket-client.service';
import { RetryService } from '../common/retry/retry.service';

const mockSocketClientService = {
  emitRouteUpdate: jest.fn(),
  isConnected: jest.fn().mockReturnValue(false),
};

const mockRetryService = {
  execute: jest
    .fn()
    .mockImplementation((operation: () => Promise<unknown>) => operation()),
};

const mockGrpcClientService = {
  optimizeRoutes: jest.fn().mockResolvedValue({
    code: '0',
    error: '',
    routes: [
      {
        vehicleId: 'v1',
        cost: 10,
        distance: '12500',
        duration: '2500',
        steps: [
          {
            type: 'job',
            id: 's1',
            location: { lat: 4.6097, lon: -74.0817 },
            service: 0,
            waitingTime: 0,
            arrival: 1,
            departure: 1,
            amount: 20,
            skills: [],
          },
        ],
        delivery: 0,
        pickup: 0,
      },
    ],
    unassigned: [],
    routingDistance: '12500',
    routingDuration: '2500',
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
      expect(result.fallback).toBe(false);
      expect(result.fallbackReason).toBeUndefined();
      expect(mockGrpcClientService.optimizeRoutes).toHaveBeenCalledWith(
        expect.objectContaining({
          jobs: [
            expect.objectContaining({
              id: 's1',
            }),
          ],
        }),
        'corr-123',
      );
      expect(mockSocketClientService.emitRouteUpdate).toHaveBeenCalledWith(
        'new_order',
        result.optimizedRoutes,
        'corr-123',
      );
    });

    it('should use mock response when gRPC is unavailable', async () => {
      mockGrpcClientService.optimizeRoutes.mockRejectedValueOnce(
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
      expect(result.optimizedRoutes.code).toBe(0);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('optimizer-unreachable');
      expect(mockSocketClientService.emitRouteUpdate).toHaveBeenCalled();
    });
  });
});
