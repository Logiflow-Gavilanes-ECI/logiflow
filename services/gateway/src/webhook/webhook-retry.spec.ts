import { Test, TestingModule } from '@nestjs/testing';
import { WebhookService } from './webhook.service';
import { GrpcClientService } from '../grpc-client/grpc-client.service';
import { SocketClientService } from '../socket-client/socket-client.service';
import { RetryService } from '../common/retry/retry.service';

const BASE_EVENT = {
  eventType: 'new_order' as const,
  vehicles: [{ id: 'v1', lat: 4.711, lng: -74.0721, capacity: 100 }],
  stops: [{ id: 's1', lat: 4.6097, lng: -74.0817, demand: 20 }],
};

const OPTIMIZER_SUCCESS = {
  routes: [
    {
      vehicleId: 'v1',
      steps: [{ stopId: 's1', lat: 4.6097, lng: -74.0817, arrivalOrder: 1 }],
      totalDistance: 12.5,
      estimatedTime: 25.0,
    },
  ],
  totalCost: 100.0,
  solvedAt: '2026-03-13T00:00:00.000Z',
};

describe('WebhookService — retry integration (Task 194)', () => {
  let service: WebhookService;
  let solveRoute: jest.Mock;
  let emitRouteUpdate: jest.Mock;

  beforeEach(async () => {
    jest.useFakeTimers();

    solveRoute = jest.fn();
    emitRouteUpdate = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        RetryService,
        {
          provide: GrpcClientService,
          useValue: { solveRoute },
        },
        {
          provide: SocketClientService,
          useValue: {
            emitRouteUpdate,
            isConnected: jest.fn().mockReturnValue(true),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  // Simulate optimizer failure

  describe('optimizer failure simulation', () => {
    it('should call optimizer exactly 3 times (maxAttempts) when it always fails', async () => {
      solveRoute.mockRejectedValue(new Error('gRPC: connection refused'));

      const pending = service.handleEvent(BASE_EVENT, 'corr-always-fail');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(solveRoute).toHaveBeenCalledTimes(3);

      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('optimizer-unreachable');

      expect(result.optimizedRoutes).toBeDefined();
      expect(result.optimizedRoutes.routes).toHaveLength(1);
    });

    it('should call optimizer exactly 2 times when it fails once then recovers', async () => {
      solveRoute
        .mockRejectedValueOnce(new Error('gRPC: timeout'))
        .mockResolvedValue(OPTIMIZER_SUCCESS);

      const pending = service.handleEvent(BASE_EVENT, 'corr-transient');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(solveRoute).toHaveBeenCalledTimes(2);

      expect(result.fallback).toBe(false);
      expect(result.fallbackReason).toBeUndefined();
      expect(result.optimizedRoutes.routes).toHaveLength(1);
      expect(result.optimizedRoutes.totalCost).toBe(100.0);
    });

    it('should call optimizer exactly 3 times when it fails twice then recovers', async () => {
      solveRoute
        .mockRejectedValueOnce(new Error('gRPC: unavailable'))
        .mockRejectedValueOnce(new Error('gRPC: unavailable'))
        .mockResolvedValue(OPTIMIZER_SUCCESS);

      const pending = service.handleEvent(BASE_EVENT, 'corr-two-failures');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(solveRoute).toHaveBeenCalledTimes(3);
      expect(result.fallback).toBe(false);
      expect(result.optimizedRoutes.totalCost).toBe(100.0);
    });
  });

  // Confirm retry execution

  describe('retry execution confirmation', () => {
    it('should pass correlationId to every optimizer call across retries', async () => {
      solveRoute
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue(OPTIMIZER_SUCCESS);

      const pending = service.handleEvent(BASE_EVENT, 'corr-propagate');
      await jest.runAllTimersAsync();
      await pending;

      expect(solveRoute).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ eventType: 'new_order' }),
        'corr-propagate',
      );
      expect(solveRoute).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ eventType: 'new_order' }),
        'corr-propagate',
      );
    });

    it('should include fallback metadata in response when all attempts fail', async () => {
      solveRoute.mockRejectedValue(new Error('gRPC: connection refused'));

      const pending = service.handleEvent(BASE_EVENT, 'corr-exhausted');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(result.received).toBe(true);
      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('optimizer-unreachable');
      expect(result.correlationId).toBe('corr-exhausted');
      expect(result.optimizedRoutes).toBeDefined();
      expect(Array.isArray(result.optimizedRoutes.routes)).toBe(true);
    });

    it('should still return a valid response even when socket emits also fail', async () => {
      solveRoute.mockResolvedValue(OPTIMIZER_SUCCESS);
      emitRouteUpdate.mockImplementation(() => {
        throw new Error('Socket.io server not connected');
      });

      const pending = service.handleEvent(BASE_EVENT, 'corr-socket-fail');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(result.received).toBe(true);
      expect(result.fallback).toBe(false);
      expect(result.optimizedRoutes.totalCost).toBe(100.0);
      expect(emitRouteUpdate).toHaveBeenCalledTimes(5);
    });
  });
});
