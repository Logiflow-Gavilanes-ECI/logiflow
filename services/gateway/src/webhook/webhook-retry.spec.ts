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
};

describe('WebhookService — retry integration (Task 194)', () => {
  let service: WebhookService;
  let optimizeRoutes: jest.Mock;
  let emitRouteUpdate: jest.Mock;

  beforeEach(async () => {
    jest.useFakeTimers();

    optimizeRoutes = jest.fn();
    emitRouteUpdate = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        RetryService,
        {
          provide: GrpcClientService,
          useValue: { optimizeRoutes },
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

  describe('optimizer failure simulation', () => {
    it('should call optimizer exactly 3 times (maxAttempts) when it always fails', async () => {
      optimizeRoutes.mockRejectedValue(new Error('gRPC: connection refused'));

      const pending = service.handleEvent(BASE_EVENT, 'corr-always-fail');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(optimizeRoutes).toHaveBeenCalledTimes(3);

      expect(result.fallback).toBe(true);
      expect(result.fallbackReason).toBe('optimizer-unreachable');

      expect(result.optimizedRoutes).toBeDefined();
      expect(result.optimizedRoutes.routes).toHaveLength(1);
    });

    it('should call optimizer exactly 2 times when it fails once then recovers', async () => {
      optimizeRoutes
        .mockRejectedValueOnce(new Error('gRPC: timeout'))
        .mockResolvedValue(OPTIMIZER_SUCCESS);

      const pending = service.handleEvent(BASE_EVENT, 'corr-transient');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(optimizeRoutes).toHaveBeenCalledTimes(2);

      expect(result.fallback).toBe(false);
      expect(result.fallbackReason).toBeUndefined();
      expect(result.optimizedRoutes.routes).toHaveLength(1);
      expect(result.optimizedRoutes.routingDistance).toBe('12500');
    });

    it('should call optimizer exactly 3 times when it fails twice then recovers', async () => {
      optimizeRoutes
        .mockRejectedValueOnce(new Error('gRPC: unavailable'))
        .mockRejectedValueOnce(new Error('gRPC: unavailable'))
        .mockResolvedValue(OPTIMIZER_SUCCESS);

      const pending = service.handleEvent(BASE_EVENT, 'corr-two-failures');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(optimizeRoutes).toHaveBeenCalledTimes(3);
      expect(result.fallback).toBe(false);
      expect(result.optimizedRoutes.routingDistance).toBe('12500');
    });
  });

  // Confirm retry execution

  describe('retry execution confirmation', () => {
    it('should pass correlationId to every optimizer call across retries', async () => {
      optimizeRoutes
        .mockRejectedValueOnce(new Error('fail'))
        .mockResolvedValue(OPTIMIZER_SUCCESS);

      const pending = service.handleEvent(BASE_EVENT, 'corr-propagate');
      await jest.runAllTimersAsync();
      await pending;

      expect(optimizeRoutes).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          jobs: [expect.objectContaining({ id: 's1' })],
        }),
        'corr-propagate',
      );
      expect(optimizeRoutes).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          jobs: [expect.objectContaining({ id: 's1' })],
        }),
        'corr-propagate',
      );
    });

    it('should include fallback metadata in response when all attempts fail', async () => {
      optimizeRoutes.mockRejectedValue(new Error('gRPC: connection refused'));

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
      optimizeRoutes.mockResolvedValue(OPTIMIZER_SUCCESS);
      emitRouteUpdate.mockImplementation(() => {
        throw new Error('Socket.io server not connected');
      });

      const pending = service.handleEvent(BASE_EVENT, 'corr-socket-fail');
      await jest.runAllTimersAsync();
      const result = await pending;

      expect(result.received).toBe(true);
      expect(result.fallback).toBe(false);
      expect(result.optimizedRoutes.routingDistance).toBe('12500');
      expect(emitRouteUpdate).toHaveBeenCalledTimes(5);
    });
  });
});
